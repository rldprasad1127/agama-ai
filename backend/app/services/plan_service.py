"""Learning-plan lifecycle: preview, create, progress view, re-balancing and adaptive tweaks."""
from __future__ import annotations

import datetime as dt
from collections import defaultdict
from typing import Optional

from beanie import PydanticObjectId
from fastapi import HTTPException, status

from app.models.enums import TaskMode, TaskStatus
from app.models.journal import JournalEntry
from app.models.learning import LearningPlan, PlanTopic, TopicStat
from app.models.plan_schemas import (
    PlacementOut, PlacementQuestion, PlanBlockOut, PlanCreate, PlanDayOut, PlanOut, PlanPreview, PlanTopicOut,
    PreviewBlock, PreviewDay, RebalanceOut,
)
from app.models.task import TaskBlock
from app.models.user import User
from app.services import curriculum
from app.services.planner import (
    DIFF_RANK, PlanError, dates_between, PlanResult, PlannedBlock, plan_dates, plan_dsa, plan_english, plan_interview,
)


# ───────────────────────── building ─────────────────────────
def _title(body: PlanCreate) -> str:
    if body.track == "INTERVIEW":
        return f"{body.days}-day interview prep: {body.role.strip()}"
    if body.track == "ENGLISH":
        return f"{body.days}-day English speaking ({body.cefr})"
    return f"{body.days}-day DSA " + ("learning path" if body.mode == "LEARN" else "practice plan")


def compute(body: PlanCreate) -> PlanResult:
    try:
        if body.track == "DSA":
            return plan_dsa(mode=body.mode, level=body.level, days=body.days, minutes=body.minutes_per_day,
                            difficulty=body.difficulty, topics=body.topics or None, known=body.known_topics,
                            weak=body.weak_topics, language=body.language)
        if body.track == "INTERVIEW":
            return plan_interview(days=body.days, minutes=body.minutes_per_day, role=body.role,
                                  experience=body.experience, company_type=body.company_type)
        return plan_english(days=body.days, minutes=body.minutes_per_day, cefr=body.cefr, focus_topics=body.focus_topics)
    except PlanError as e:
        raise HTTPException(422, str(e)) from e


def preview(body: PlanCreate, today: dt.date) -> PlanPreview:
    res = compute(body)
    start = body.start_date or today
    dates = plan_dates(start, body.days, body.skip_weekends)
    by_phase: dict[str, int] = defaultdict(int)
    for b in res.blocks:
        by_phase[b.phase] += 1
    sample = []
    for d in range(1, min(7, body.days) + 1):
        sample.append(PreviewDay(day=d, date=dates[d - 1], blocks=[
            PreviewBlock(title=b.title, mode=b.mode.value, minutes=b.minutes, phase=b.phase) for b in res.blocks if b.day == d]))
    return PlanPreview(
        title=_title(body), track=body.track, mode=body.mode, days=body.days, minutes_per_day=body.minutes_per_day,
        start_date=dates[0], end_date=dates[-1], topics=res.topics, trimmed_topics=res.trimmed,
        total_blocks=len(res.blocks), total_minutes=sum(b.minutes for b in res.blocks), by_phase=dict(by_phase), sample_days=sample)


async def _max_order(user: User, dates: list[dt.date]) -> dict[dt.date, int]:
    if not dates:
        return {}
    rows = await TaskBlock.find(TaskBlock.user_id == user.id, TaskBlock.date >= min(dates), TaskBlock.date <= max(dates)).to_list()
    out: dict[dt.date, int] = {}
    for t in rows:
        if t.date:
            out[t.date] = max(out.get(t.date, -1), t.order_index)
    return out


def _to_doc(user: User, plan: LearningPlan, b: PlannedBlock, date: dt.date, order: int, language: str) -> TaskBlock:
    is_session = b.practice_kind is not None
    return TaskBlock(
        user_id=user.id, date=date, title=b.title, duration_minutes=b.minutes, order_index=order, task_mode=b.mode,
        category=b.category, language=language if b.mode == TaskMode.CODE else None, difficulty=b.difficulty, tags=b.tags,
        description=b.gen_hint[:160] if not is_session else f"{b.practice_kind.title()} Q&A session", plan_id=plan.id, topic_key=b.topic_key,
        phase=b.phase, plan_day=b.day, gen_hint=b.gen_hint, cache_key=b.cache_key,
        practice_kind=b.practice_kind, practice_config=b.practice_config, content_ready=is_session,
    )


async def archive_active(user: User) -> None:
    for old in await LearningPlan.find(LearningPlan.user_id == user.id, LearningPlan.status == "active").to_list():
        await TaskBlock.find(TaskBlock.plan_id == old.id, TaskBlock.status == TaskStatus.PENDING).delete()
        old.status = "archived"
        await old.save()


async def create_plan(user: User, body: PlanCreate, today: dt.date) -> LearningPlan:
    res = compute(body)
    start = body.start_date or today
    dates = plan_dates(start, body.days, body.skip_weekends)
    await archive_active(user)
    language = body.language or user.preferences.default_language
    plan = LearningPlan(
        user_id=user.id, track=body.track, mode=body.mode if body.track == "DSA" else "LEARN", title=_title(body),
        level=body.level, days=body.days, minutes_per_day=body.minutes_per_day, skip_weekends=body.skip_weekends,
        start_date=dates[0], end_date=dates[-1], difficulty=body.difficulty, language=language,
        topics=[PlanTopic(**t) for t in res.topics], trimmed_topics=res.trimmed,
        config={"role": body.role, "experience": body.experience, "company_type": body.company_type, "cefr": body.cefr}
        if body.track != "DSA" else {},
    )
    await plan.insert()
    next_order = await _max_order(user, dates)
    docs: list[TaskBlock] = []
    for b in sorted(res.blocks, key=lambda x: x.day):
        d = dates[b.day - 1]
        next_order[d] = next_order.get(d, -1) + 1
        docs.append(_to_doc(user, plan, b, d, next_order[d], language))
    if docs:
        await TaskBlock.insert_many(docs)
    user.onboarded, user.daily_target_minutes = True, body.minutes_per_day
    user.goal = {"DSA": "dsa", "INTERVIEW": "interview", "ENGLISH": "english"}[body.track]
    if body.track == "DSA":
        user.learner_level = body.level
    await user.save()
    return plan


async def active_plan(user: User) -> Optional[LearningPlan]:
    return await LearningPlan.find_one(LearningPlan.user_id == user.id, LearningPlan.status == "active")


async def owned_plan(plan_id: str, user: User) -> LearningPlan:
    try:
        plan = await LearningPlan.get(PydanticObjectId(plan_id))
    except Exception:
        plan = None
    if plan is None or plan.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan not found")
    return plan


# ───────────────────────── views ─────────────────────────
def count_days(start: dt.date, end: dt.date, skip_weekends: bool) -> int:
    """Number of plan days in [start, end] (weekends skipped when the plan does)."""
    if end < start:
        return 0
    n, d = 0, start
    while d <= end:
        if not (skip_weekends and d.weekday() >= 5):
            n += 1
        d += dt.timedelta(days=1)
    return n


async def plan_blocks(plan: LearningPlan) -> list[TaskBlock]:
    return await TaskBlock.find(TaskBlock.plan_id == plan.id).sort("+date", "+order_index").to_list()


async def build_out(plan: LearningPlan, today: dt.date) -> PlanOut:
    blocks = await plan_blocks(plan)
    done = [b for b in blocks if b.status == TaskStatus.COMPLETED]
    pending = [b for b in blocks if b.status == TaskStatus.PENDING]
    missed = [b for b in pending if b.date is not None and b.date < today]
    todays = [b for b in pending if b.date == today]
    nxt = (missed + todays + [b for b in pending if b.date and b.date > today])
    by_topic: dict[str, list[TaskBlock]] = defaultdict(list)
    for b in blocks:
        if b.topic_key:
            by_topic[b.topic_key].append(b)
    topics: list[PlanTopicOut] = []
    for t in plan.topics:
        bl = by_topic.get(t.key, [])
        n_done = sum(1 for b in bl if b.status == TaskStatus.COMPLETED)
        st = plan.topic_stats.get(t.key)
        if bl and n_done == len(bl):
            state = "done"
        elif n_done or any(b.date == today for b in bl):
            state = "current"
        else:
            state = "upcoming"
        topics.append(PlanTopicOut(
            key=t.key, name=t.name, first_day=t.first_day, last_day=t.last_day, blocks_total=len(bl), blocks_done=n_done,
            mastery=round(st.score_sum / st.n) if st and st.n else None, help_requests=st.help_requests if st else 0, status=state))
    mins_total = sum(b.duration_minutes for b in blocks)
    mins_done = sum(b.duration_minutes for b in done)
    idx = count_days(plan.start_date, today, plan.skip_weekends)
    left = count_days(max(today, plan.start_date), plan.end_date, plan.skip_weekends)
    return PlanOut(
        id=str(plan.id), title=plan.title, track=plan.track, mode=plan.mode, level=plan.level, days=plan.days,
        minutes_per_day=plan.minutes_per_day, start_date=plan.start_date, end_date=plan.end_date, difficulty=plan.difficulty,
        language=plan.language, status=plan.status, skip_weekends=plan.skip_weekends, day_index=idx, days_left=left,
        blocks_total=len(blocks), blocks_done=len(done), minutes_total=mins_total, minutes_done=mins_done,
        progress_pct=round(mins_done * 100 / mins_total) if mins_total else 0,
        missed_count=len(missed), missed_minutes=sum(b.duration_minutes for b in missed), today_count=len(todays),
        next_task_id=str(nxt[0].id) if nxt else None, topics=topics, trimmed_topics=plan.trimmed_topics,
        rebalanced_count=plan.rebalanced_count, config=plan.config)


async def build_days(plan: LearningPlan, today: dt.date) -> list[PlanDayOut]:
    blocks = await plan_blocks(plan)
    scores: dict[str, int] = {}
    jids = [b.journal_id for b in blocks if b.journal_id]
    if jids:
        for e in await JournalEntry.find({"_id": {"$in": jids}}).to_list():
            scores[str(e.id)] = e.score
    by_date: dict[dt.date, list[TaskBlock]] = defaultdict(list)
    for b in blocks:
        if b.date:
            by_date[b.date].append(b)
    out = []
    for d in sorted(by_date):
        out.append(PlanDayOut(day=(d - plan.start_date).days + 1, date=d, is_today=d == today, blocks=[
            PlanBlockOut(id=str(b.id), title=b.title, mode=b.task_mode.value, phase=b.phase or "practice", minutes=b.duration_minutes,
                         status=b.status.value, topic_key=b.topic_key, difficulty=b.difficulty,
                         score=scores.get(str(b.journal_id)) if b.journal_id else None,
                         missed=b.status == TaskStatus.PENDING and d < today, practice_kind=b.practice_kind) for b in by_date[d]]))
    return out


# ───────────────────────── re-balancing ─────────────────────────
_PHASE_DROP = {"extra": 0, "review": 1, "practice": 2, "session": 2, "theory": 3, "mock": 4}


def _drop_key(b: TaskBlock, prio: dict[str, int]) -> tuple:
    return (_PHASE_DROP.get(b.phase or "practice", 2), -prio.get(b.topic_key or "", 0), DIFF_RANK.get(b.difficulty or "Medium", 1), -(b.plan_day or 0))


def _layout(blocks: list[TaskBlock], dates: list[dt.date], cap: int, first_cap: int) -> Optional[list[dt.date]]:
    """Greedy in-order packing. Returns a date per block, or None when it does not fit."""
    out: list[dt.date] = []
    i, used = 0, 0
    caps = lambda k: first_cap if k == 0 else cap
    for b in blocks:
        while used > 0 and used + b.duration_minutes > caps(i):
            i += 1; used = 0
            if i >= len(dates):
                return None
        if i >= len(dates):
            return None
        out.append(dates[i]); used += b.duration_minutes
    return out


async def rebalance(user: User, plan: LearningPlan, today: dt.date, extend_days: int) -> RebalanceOut:
    blocks = [b for b in await plan_blocks(plan) if b.status == TaskStatus.PENDING]
    if not blocks:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nothing left to re-plan — every block is done.")
    new_end = plan.end_date + dt.timedelta(days=extend_days)
    if new_end < today:
        if extend_days == 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "This plan's end date has passed — extend it by a few days.")
        new_end = today + dt.timedelta(days=extend_days - 1)
    dates = dates_between(today, new_end, plan.skip_weekends)
    if not dates:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No working days left — extend the plan.")
    all_done_today = [b for b in await plan_blocks(plan) if b.status == TaskStatus.COMPLETED and b.date == today]
    first_cap = max(0, plan.minutes_per_day - sum(b.duration_minutes for b in all_done_today))
    if first_cap < 15 and len(dates) > 1:
        dates = dates[1:]; first_cap = plan.minutes_per_day
    prio = {t.key: curriculum.DSA_BY_KEY[t.key].priority if t.key in curriculum.DSA_BY_KEY else 0 for t in plan.topics}
    blocks.sort(key=lambda b: ((b.plan_day or 0), b.order_index))
    dropped: list[TaskBlock] = []
    placed = _layout(blocks, dates, plan.minutes_per_day, first_cap)
    while placed is None and blocks:
        victim = min(blocks, key=lambda b: _drop_key(b, prio))
        blocks.remove(victim); dropped.append(victim)
        placed = _layout(blocks, dates, plan.minutes_per_day, first_cap)
    next_order = await _max_order(user, dates)
    moved = 0
    for b, d in zip(blocks, placed or []):
        next_order[d] = next_order.get(d, -1) + 1
        if b.date != d:
            moved += 1
        b.date, b.order_index, b.plan_day = d, next_order[d], (d - plan.start_date).days + 1
        await b.save()
    for b in dropped:
        await b.delete()
    plan.end_date = new_end
    plan.rebalanced_count += 1
    await _refresh_topic_ranges(plan)
    await plan.save()
    return RebalanceOut(moved=moved, dropped=[b.title for b in dropped], new_end_date=plan.end_date, plan=await build_out(plan, today))


async def _refresh_topic_ranges(plan: LearningPlan) -> None:
    by: dict[str, list[int]] = defaultdict(list)
    for b in await plan_blocks(plan):
        if b.topic_key and b.plan_day:
            by[b.topic_key].append(b.plan_day)
    for t in plan.topics:
        if by.get(t.key):
            t.first_day, t.last_day = min(by[t.key]), max(by[t.key])


async def drop_plan(user: User, plan: LearningPlan) -> None:
    await TaskBlock.find(TaskBlock.plan_id == plan.id, TaskBlock.status == TaskStatus.PENDING).delete()
    plan.status = "archived"
    await plan.save()


# ───────────────────────── adaptive hooks ─────────────────────────
async def _next_plan_date(plan: LearningPlan, today: dt.date) -> dt.date:
    return plan_dates(today + dt.timedelta(days=1), 1, plan.skip_weekends)[0]


async def add_extra_block(user: User, plan: LearningPlan, source: TaskBlock, title: str, mode: TaskMode, minutes: int,
                          gen_hint: str, today: dt.date, difficulty: Optional[str] = "Easy") -> TaskBlock:
    d = await _next_plan_date(plan, today)
    order = (await _max_order(user, [d])).get(d, -1) + 1
    t = TaskBlock(
        user_id=user.id, date=d, title=title, duration_minutes=minutes, order_index=order, task_mode=mode,
        category=source.category, language=source.language, difficulty=difficulty, tags=source.tags + ["extra"],
        description="Added automatically to reinforce this topic", plan_id=plan.id, topic_key=source.topic_key, phase="extra",
        plan_day=(d - plan.start_date).days + 1, gen_hint=gen_hint,
    )
    await t.insert()
    if d > plan.end_date:
        plan.end_date = d
    return t


async def on_block_evaluated(user: User, task: TaskBlock, score: int, today: dt.date) -> None:
    """Adaptive step after every evaluated plan block: track mastery, add support, ramp difficulty, finish the plan."""
    if not task.plan_id:
        return
    plan = await LearningPlan.get(task.plan_id)
    if plan is None or plan.status != "active":
        return
    key = task.topic_key or "_"
    st = plan.topic_stats.get(key) or TopicStat()
    first_time = not task.xp_awarded    # called before xp flag is set by the caller
    if first_time:
        st.n += 1
        st.score_sum += score
    if task.phase in ("practice", "extra"):
        st.high_streak = st.high_streak + 1 if score >= 90 else 0
        if score < 55 and st.extras_added < 2 and first_time and task.topic_key in curriculum.DSA_BY_KEY:
            st.extras_added += 1
            await add_extra_block(
                user, plan, task, f"Extra Practice: {task.title} (easier)", TaskMode.CODE, min(30, plan.minutes_per_day), 
                f"An EASIER warm-up on the same pattern as \"{task.title}\" ({task.category}). One small problem, 2-3 steps to solve, "
                "so the learner can rebuild confidence before the harder ones.", today)
        elif plan.difficulty == "adaptive" and st.high_streak >= 3:
            for b in await TaskBlock.find(TaskBlock.plan_id == plan.id, TaskBlock.topic_key == task.topic_key,
                                          TaskBlock.status == TaskStatus.PENDING).to_list():
                if b.difficulty == "Easy" and not b.content_ready and b.phase == "practice":
                    b.difficulty, b.cache_key = "Medium", None
                    b.gen_hint += " Make it a notch harder than the usual Easy version (Medium difficulty)."
                    await b.save()
            st.high_streak = 0
    plan.topic_stats[key] = st
    remaining = await TaskBlock.find(TaskBlock.plan_id == plan.id, TaskBlock.status == TaskStatus.PENDING).count()
    if remaining == 0:
        plan.status = "completed"
    await plan.save()


async def note_struggle(user: User, task: TaskBlock, today: dt.date, *, help_request: bool = False, failed_check: bool = False) -> None:
    """Called by the AI-help endpoints; two failed comprehension checks on a lesson queue a short recap block."""
    if not task.plan_id or not task.topic_key:
        return
    plan = await LearningPlan.get(task.plan_id)
    if plan is None or plan.status != "active":
        return
    st = plan.topic_stats.get(task.topic_key) or TopicStat()
    if help_request:
        st.help_requests += 1
    if failed_check:
        st.failed_checks += 1
        if st.failed_checks == 2 and task.task_mode == TaskMode.THEORY:
            await add_extra_block(user, plan, task, f"Recap: {task.category}", TaskMode.THEORY, min(20, plan.minutes_per_day),
                                  f"A short second-pass recap of '{task.category}' using DIFFERENT analogies than the main lesson. "
                                  "Max 400 words. End with 3 self-test questions.", today, difficulty="Foundational")
    plan.topic_stats[task.topic_key] = st
    await plan.save()


# ───────────────────────── placement quiz ─────────────────────────
def placement_questions() -> list[PlacementQuestion]:
    return [PlacementQuestion(id=q.id, topic=q.topic, topic_name=curriculum.DSA_BY_KEY[q.topic].name, prompt=q.prompt, options=list(q.options))
            for q in curriculum.PLACEMENT]


def grade_placement(answers: dict[str, int]) -> PlacementOut:
    by_topic: dict[str, bool] = {}
    for q in curriculum.PLACEMENT:
        by_topic[q.topic] = answers.get(q.id) == q.answer
    score = sum(by_topic.values())
    level = "advanced" if score >= 12 else "intermediate" if score >= 7 else "beginner"
    known = [k for k, ok in by_topic.items() if ok and score >= 7]       # only trust "known" when the overall result is decent
    weak = [k for k, ok in by_topic.items() if not ok]
    return PlacementOut(score=score, total=len(curriculum.PLACEMENT), level=level, known_topics=known, weak_topics=weak,
                        suggested_mode="PRACTICE" if score >= 11 else "LEARN", by_topic=by_topic)
