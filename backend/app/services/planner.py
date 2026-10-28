"""Pure schedule planner: turns (goal, days, minutes/day, level…) into dated blocks. No DB, no AI — fully testable."""
from __future__ import annotations

import datetime as dt
import math
import re
from dataclasses import dataclass, field
from typing import Optional

from app.models.enums import TaskMode
from app.services.curriculum import DSA, DSA_BY_KEY, Problem, Topic
from app.services.subjects import DSA_SUBJECT, Subject

DIFF_RANK = {"Easy": 0, "Medium": 1, "Hard": 2}
DEFAULT_MIN = {"Easy": 25, "Medium": 35, "Hard": 50}


class PlanError(ValueError):
    """Invalid planning request (surfaced as HTTP 422)."""


@dataclass
class PlannedBlock:
    day: int                                  # 1-based plan day
    title: str
    mode: TaskMode
    minutes: int
    phase: str                                # theory | practice | review | mock | session
    category: str = ""
    topic_key: Optional[str] = None
    difficulty: Optional[str] = None
    gen_hint: str = ""
    cache_key: Optional[str] = None
    tags: list[str] = field(default_factory=list)
    practice_kind: Optional[str] = None
    practice_config: dict = field(default_factory=dict)


@dataclass
class PlanResult:
    blocks: list[PlannedBlock]
    topics: list[dict]                        # {key, name, days, first_day, last_day}
    trimmed: list[str]
    total_days: int


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60]


def r5(n: float) -> int:
    return max(5, int(round(n / 5.0)) * 5)


def plan_dates(start: dt.date, n_days: int, skip_weekends: bool) -> list[dt.date]:
    out, d = [], start
    while len(out) < n_days:
        if not (skip_weekends and d.weekday() >= 5):
            out.append(d)
        d += dt.timedelta(days=1)
    return out


def dates_between(start: dt.date, end: dt.date, skip_weekends: bool) -> list[dt.date]:
    out, d = [], start
    while d <= end:
        if not (skip_weekends and d.weekday() >= 5):
            out.append(d)
        d += dt.timedelta(days=1)
    return out


# ───────────────────────── DSA ─────────────────────────
def _reserved_days(days: int, mode: str) -> tuple[set[int], set[int]]:
    review = {d for d in range(7, days, 7)} if days >= 10 else set()
    mock: set[int] = set()
    if days >= 7:
        mock.add(days)
        if mode == "PRACTICE" and days >= 14:
            mock.add(days - 1)
    review -= mock
    return review, mock


def _allocate(n_days: int, topics: list[Topic], boost: set[str]) -> list[int]:
    """Largest-remainder allocation of ``n_days`` over topics by weight (≥1 day each)."""
    w = [t.weight * (1.6 if t.key in boost else 1.0) for t in topics]
    alloc = [1] * len(topics)
    extra = n_days - len(topics)
    if extra <= 0:
        return alloc
    total = sum(w)
    raw = [extra * x / total for x in w]
    base = [int(math.floor(x)) for x in raw]
    left = extra - sum(base)
    order = sorted(range(len(topics)), key=lambda i: (raw[i] - base[i]), reverse=True)
    for i in order[:left]:
        base[i] += 1
    return [a + b for a, b in zip(alloc, base)]


def _ordered_problems(topic: Topic, pref: str, level: str, mode: str) -> list[Problem]:
    probs = list(topic.problems)
    if mode == "PRACTICE" and len(probs) >= 4:
        if level == "advanced":
            probs = [p for p in probs if p.difficulty != "Easy"] or probs
        elif level == "intermediate" and probs[0].difficulty == "Easy":
            probs = probs[1:]
    if pref in ("easy", "medium", "hard"):
        want = {"easy": 0, "medium": 1, "hard": 2}[pref]
        probs.sort(key=lambda p: abs(DIFF_RANK[p.difficulty] - want))   # stable: keeps curriculum order within a tie
    return probs


def _practice_hint(sub: Subject, topic: Topic, p: Problem) -> str:
    base = f"Author the {'classic problem' if sub.kind == 'dsa' else 'exercise'} \"{p.title}\" ({p.difficulty}) for a learner studying {topic.name}"
    if sub.kind == "dsa":
        return f"{base}. Use clear plain-language wording. {p.note}".strip()
    return (f"{base} in {sub.name}. Use clear plain-language wording. {p.note} {_KIND_RULES.get(sub.kind, '')}").strip()


_KIND_RULES = {
    "sql": ("SQLite syntax. starter_code = the CREATE TABLE and INSERT statements for the sample data (max 3 tables, 5-10 rows each) "
            "followed by the comment '-- Write your query below'. reference_solution = the correct query. test_cases must be an empty list."),
    "exercise": ("This is a hands-on written exercise: the learner types their answer (steps, formulas, queries or code) into the answer box. "
                 "Put the scenario and any small sample data (as a markdown table) in prompt_context; make the checklist 3-5 things a correct answer must contain; "
                 "word_target_min/max between 40 and 250."),
}


def _cache(sub: Subject, tail: str) -> Optional[str]:
    return None if sub.custom else f"{sub.key}:{tail}"


def _problem_block(day: int, topic: Topic, p: Problem, minutes: int, language: str, phase: str = "practice", sub: Subject = DSA_SUBJECT) -> PlannedBlock:
    lang_part = f":{language}" if sub.practice_mode == TaskMode.CODE else ""
    return PlannedBlock(
        day=day, title=p.title, mode=sub.practice_mode, minutes=minutes, phase=phase, category=topic.name,
        topic_key=topic.key, difficulty=p.difficulty, tags=[topic.name] + (["exercise"] if sub.practice_mode == TaskMode.PROSE else []),
        gen_hint=_practice_hint(sub, topic, p),
        cache_key=_cache(sub, f"{'code' if sub.kind == 'dsa' else 'ex'}:{slug(p.title)}{lang_part}:{p.difficulty}"),
    )


def _fresh_problem(day: int, topic: Topic, k: int, diff: str, minutes: int, language: str, sub: Subject = DSA_SUBJECT) -> PlannedBlock:
    lang_part = f":{language}" if sub.practice_mode == TaskMode.CODE else ""
    noun = "problem" if sub.kind in ("dsa", "code") else "exercise"
    return PlannedBlock(
        day=day, title=f"{topic.name}: Practice Set {k}", mode=sub.practice_mode, minutes=minutes, phase="practice",
        category=topic.name, topic_key=topic.key, difficulty=diff, tags=[topic.name] + (["exercise"] if sub.practice_mode == TaskMode.PROSE else []),
        gen_hint=(f"Invent ONE fresh {diff} {noun} on {topic.name}"
                  + (f" in {sub.name}" if sub.kind != "dsa" else "")
                  + f" that is NOT one of: {', '.join(p.title for p in topic.problems)}. "
                  f"{topic.problems[0].note if topic.problems else ''} {_KIND_RULES.get(sub.kind, '') if sub.kind != 'dsa' else ''}").strip(),
        cache_key=_cache(sub, f"fresh:{topic.key}:{k}:{diff}{lang_part}"),
    )


def _theory_block(day: int, topic: Topic, minutes: int, level: str, sub: Subject = DSA_SUBJECT) -> PlannedBlock:
    bucket = "beginner" if level == "beginner" else "refresher"
    style = ("The learner is a complete beginner: define every term, use everyday analogies, build up slowly, "
             "no unexplained jargon." if level == "beginner" else
             f"The learner already knows the basics of {sub.name}: be concise, focus on patterns, pitfalls and good practice.")
    worked = "a tiny worked example with a trace" if sub.kind in ("dsa", "code") else "a small worked example with concrete sample data"
    return PlannedBlock(
        day=day, title=f"{topic.name}: Concept Lesson", mode=TaskMode.THEORY, minutes=minutes, phase="theory",
        category=topic.name, topic_key=topic.key, difficulty="Foundational" if level == "beginner" else "Intermediate",
        tags=[topic.name, "theory"],
        gen_hint=(f"Write the lesson '{topic.name}'" + (f" (subject: {sub.name})" if sub.kind != "dsa" else "")
                  + f". Must cover: {topic.theory} {style} Include {worked}."),
        cache_key=_cache(sub, f"theory:{topic.key}:{bucket}"),
    )


def _fill_coding(day: int, topic: Topic, queue: list[Problem], used: list[int], budget: int, language: str,
                 fresh_diff: str, fresh_counter: list[int], sub: Subject = DSA_SUBJECT) -> list[PlannedBlock]:
    out: list[PlannedBlock] = []
    remaining = budget
    while remaining >= 15:
        if used[0] < len(queue):
            p = queue[used[0]]; used[0] += 1
            diff, block_fn = p.difficulty, lambda m, p=p: _problem_block(day, topic, p, m, language, sub=sub)
        else:
            fresh_counter[0] += 1
            k = fresh_counter[0]
            diff = fresh_diff
            block_fn = lambda m, k=k: _fresh_problem(day, topic, k, fresh_diff, m, language, sub)
        dur = min(DEFAULT_MIN[diff], remaining)
        if remaining - dur < 15:
            dur = remaining
        out.append(block_fn(r5(dur) if dur % 5 else dur))
        remaining -= dur
    return out


def plan_dsa(**kw) -> PlanResult:
    return plan_subject(DSA_SUBJECT, **kw)


def plan_subject(sub: Subject, *, mode: str, level: str, days: int, minutes: int, difficulty: str = "mixed",
                 topics: Optional[list[str]] = None, known: Optional[list[str]] = None, weak: Optional[list[str]] = None,
                 language: str = "python") -> PlanResult:
    known_s, weak_s = set(known or []), set(weak or [])
    valid = {t.key for t in sub.topics}
    for k in list(topics or []) + list(known_s) + list(weak_s):
        if k not in valid:
            raise PlanError(f"Unknown topic '{k}'")
    selected = [t for t in sub.topics if not topics or t.key in topics]
    if mode == "LEARN":
        selected = [t for t in selected if t.key not in known_s]
    if not selected:
        raise PlanError("No topics left to plan — you marked everything as already known.")

    review_days, mock_days = _reserved_days(days, mode)
    avail = [d for d in range(1, days + 1) if d not in review_days and d not in mock_days]
    trimmed: list[str] = []
    if len(selected) > len(avail):
        keep = {t.key for t in sorted(selected, key=lambda t: t.priority)[: len(avail)]}
        trimmed = [t.name for t in selected if t.key not in keep]
        selected = [t for t in selected if t.key in keep]
    alloc = _allocate(len(avail), selected, weak_s)

    blocks: list[PlannedBlock] = []
    topic_rows: list[dict] = []
    cursor = 0
    covered: list[str] = []
    fresh_diff = {"easy": "Easy", "hard": "Hard"}.get(difficulty, "Medium")
    for t, n in zip(selected, alloc):
        mine = avail[cursor: cursor + n]
        cursor += n
        queue = _ordered_problems(t, difficulty, level, mode)
        used, fresh = [0], [0]
        for i, day in enumerate(mine):
            budget = minutes
            if mode == "LEARN" and i == 0:
                share = 0.40 if level == "beginner" else 0.28
                th = r5(min(45, max(15, minutes * share))) if minutes >= 30 else minutes
                th = min(th, minutes)
                blocks.append(_theory_block(day, t, th, level, sub))
                budget = minutes - th
            blocks.extend(_fill_coding(day, t, queue, used, budget, language, fresh_diff, fresh, sub))
        topic_rows.append({"key": t.key, "name": t.name, "days": len(mine), "first_day": mine[0], "last_day": mine[-1]})
        covered.append(t.name)

    for rd in sorted(review_days):
        names = [r["name"] for r in topic_rows if r["first_day"] < rd]
        blocks.extend(_review_day(rd, names or covered, minutes, mode, language, sub))
    for md in sorted(mock_days):
        blocks.extend(_mock_day(md, covered, minutes, language, final=(md == days), sub=sub))
    blocks.sort(key=lambda b: b.day)
    return PlanResult(blocks, topic_rows, trimmed, days)


def _review_day(day: int, covered: list[str], minutes: int, mode: str, language: str, sub: Subject = DSA_SUBJECT) -> list[PlannedBlock]:
    names = ", ".join(covered[-6:])
    out: list[PlannedBlock] = []
    budget = minutes
    if mode == "LEARN" and minutes >= 40:
        rec = r5(min(25, minutes * 0.4))
        out.append(PlannedBlock(day=day, title="Weekly Recap: Key Ideas", mode=TaskMode.THEORY, minutes=rec, phase="review",
                                category="Review", tags=["review"], difficulty="Foundational",
                                gen_hint=f"A recap sheet for revision (not a new lesson) of these topics: {names}. For each: the core idea in 2 sentences, the signature pattern, complexity, and one common mistake."))
        budget -= rec
    k = 0
    while budget >= 20:
        k += 1
        dur = min(40, budget)
        if budget - dur < 15:
            dur = budget
        out.append(PlannedBlock(day=day, title=f"Mixed Review {'Problem' if sub.kind == 'dsa' else 'Exercise'} {k}", mode=sub.practice_mode,
                                minutes=dur, phase="review", category="Review", difficulty="Medium",
                                tags=["review"] + (["exercise"] if sub.practice_mode == TaskMode.PROSE else []),
                                gen_hint=f"ONE medium {sub.noun} that combines ideas from: {names}. Different from the textbook list. "
                                         f"{_KIND_RULES.get(sub.kind, '') if sub.kind != 'dsa' else ''}".strip(),
                                cache_key=None))
        budget -= dur
    return out


def _mock_title(sub: Subject, final: bool) -> str:
    if sub.kind == "dsa":
        return "Final Mock Interview Round" if final else "Mock Interview Round"
    return "Final Capstone Challenge" if final else "Capstone Challenge"


def _mock_day(day: int, covered: list[str], minutes: int, language: str, final: bool, sub: Subject = DSA_SUBJECT) -> list[PlannedBlock]:
    names = ", ".join(covered[-8:]) or "core data structures"
    out: list[PlannedBlock] = []
    budget = minutes
    k = 0
    while budget >= 25 and k < 3:
        k += 1
        dur = min(60, budget)
        if budget - dur < 20:
            dur = budget
        out.append(PlannedBlock(
            day=day, title=(_mock_title(sub, final)) + (f" — Part {k}" if minutes >= 90 and sub.kind != "dsa" else f" — Problem {k}" if minutes >= 90 else ""),
            mode=sub.practice_mode, minutes=dur, phase="mock", category="Mock Interview" if sub.kind == "dsa" else "Capstone", difficulty="Medium",
            tags=["mock", "timed"] + (["exercise"] if sub.practice_mode == TaskMode.PROSE else []),
            gen_hint=(f"A timed interview-style problem (medium, may lean hard) touching: {names}. State constraints clearly; expect an optimal solution."
                      if sub.kind == "dsa" else
                      f"A capstone {sub.noun} for {sub.name} (medium) that combines: {names}. Realistic scenario, clear success criteria. {_KIND_RULES.get(sub.kind, '')}".strip())))
        budget -= dur
    if not out:
        out.append(PlannedBlock(day=day, title=_mock_title(sub, False), mode=sub.practice_mode, minutes=minutes, phase="mock",
                                category="Mock Interview" if sub.kind == "dsa" else "Capstone", difficulty="Medium",
                                tags=["mock"] + (["exercise"] if sub.practice_mode == TaskMode.PROSE else []),
                                gen_hint=f"A short {'interview-style problem' if sub.kind == 'dsa' else 'capstone ' + sub.noun} touching: {names}. "
                                         f"{_KIND_RULES.get(sub.kind, '') if sub.kind != 'dsa' else ''}".strip()))
    return out


# ───────────────────────── Interview & English tracks ─────────────────────────
ENGLISH_TOPICS = [
    "Introduce yourself", "Your daily routine", "Food and hobbies", "Your work or studies", "A memorable trip",
    "Describing a person you admire", "Telling a story from the past", "Plans for the future", "Giving opinions on technology",
    "Solving a problem politely (phone / shop)", "Describing your city", "Pros and cons of a decision", "Health and lifestyle",
    "Explaining how something works", "Agreeing, disagreeing and debating",
]
ENGLISH_STYLES = ["answer everyday questions", "describe and explain", "tell a short story", "give and justify an opinion"]
CEFR = ["A1", "A2", "B1", "B2", "C1"]


def plan_english(*, days: int, minutes: int, cefr: str = "B1", focus_topics: Optional[list[str]] = None) -> PlanResult:
    if cefr not in CEFR:
        raise PlanError("Unknown English level")
    topics = [x for x in (focus_topics or []) if x.strip()] or ENGLISH_TOPICS
    nq = max(3, min(8, minutes // 4))
    blocks = []
    for d in range(1, days + 1):
        topic = topics[(d - 1) % len(topics)]
        style = ENGLISH_STYLES[(d - 1) % len(ENGLISH_STYLES)]
        blocks.append(PlannedBlock(
            day=d, title=f"Speaking Practice: {topic}", mode=TaskMode.SPEECH, minutes=minutes, phase="session",
            category="English Speaking", tags=["english", cefr], practice_kind="ENGLISH",
            practice_config={"cefr": cefr, "topic": topic, "style": style, "num_questions": nq, "instant_feedback": True}))
    return PlanResult(blocks, [{"key": "english", "name": f"English speaking ({cefr})", "days": days, "first_day": 1, "last_day": days}], [], days)


def plan_interview(*, days: int, minutes: int, role: str, experience: str = "fresher", company_type: str = "") -> PlanResult:
    role = (role or "").strip()
    if not role:
        raise PlanError("Tell us which role you are preparing for")
    if experience not in ("fresher", "junior", "senior"):
        raise PlanError("Unknown experience level")
    nq = max(3, min(10, minutes // 6))
    blocks = []
    b_end, t_end = max(1, round(days * 0.3)), max(2, round(days * 0.8))
    for d in range(1, days + 1):
        final = d == days and days >= 3
        if final:
            rnd, title = "mixed", "Full Mock Interview"
        elif d <= b_end:
            rnd = "hr" if d % 2 else "behavioral"
            title = "HR Round Practice" if rnd == "hr" else "Behavioural (STAR) Practice"
        elif d <= t_end:
            rnd, title = "technical", "Technical Round Practice"
        else:
            rnd, title = "mixed", "Mixed Round Practice"
        blocks.append(PlannedBlock(
            day=d, title=f"{title} — {role}", mode=TaskMode.SPEECH, minutes=minutes, phase="session",
            category="Interview Prep", tags=["interview", rnd], practice_kind="INTERVIEW",
            practice_config={"role": role, "round": rnd, "experience": experience, "company_type": company_type,
                             "num_questions": min(12, nq + 2) if final else nq, "instant_feedback": False}))
    return PlanResult(blocks, [{"key": "interview", "name": f"Interview prep: {role}", "days": days, "first_day": 1, "last_day": days}], [], days)
