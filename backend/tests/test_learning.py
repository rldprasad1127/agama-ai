"""Learning paths, adaptive planning, AI help and speaking practice."""
from __future__ import annotations

import datetime as dt

import pytest

from app.core.errors import AIServiceError

from app.models.enums import TaskMode
from app.services import planner
from app.services.planner import PlanError, dates_between, plan_dates, plan_dsa, plan_english, plan_interview


# ───────────────────────── planner (pure) ─────────────────────────
def _per_day(blocks):
    out = {}
    for b in blocks:
        out[b.day] = out.get(b.day, 0) + b.minutes
    return out


@pytest.mark.parametrize("days,minutes,mode,level", [(30, 60, "LEARN", "beginner"), (14, 90, "PRACTICE", "advanced"), (7, 45, "LEARN", "beginner"),
                                                     (90, 30, "LEARN", "intermediate"), (3, 15, "LEARN", "beginner"), (120, 240, "PRACTICE", "intermediate")])
def test_dsa_plan_respects_daily_budget(days, minutes, mode, level):
    r = plan_dsa(mode=mode, level=level, days=days, minutes=minutes)
    per = _per_day(r.blocks)
    assert all(m <= minutes for m in per.values())
    assert set(per) <= set(range(1, days + 1))
    assert all(b.minutes >= 5 for b in r.blocks)
    # every day carries real work (no empty days) when minutes >= 30
    if minutes >= 30:
        assert len(per) == days


def test_learn_mode_puts_theory_before_coding_per_topic():
    r = plan_dsa(mode="LEARN", level="beginner", days=30, minutes=60)
    for t in r.topics:
        mine = [b for b in r.blocks if b.topic_key == t["key"] and b.phase in ("theory", "practice")]
        assert mine[0].phase == "theory" and mine[0].day == t["first_day"]
        assert any(b.phase == "practice" for b in mine)
    assert not any(b.phase == "theory" for b in plan_dsa(mode="PRACTICE", level="advanced", days=14, minutes=60).blocks)


def test_review_and_mock_days():
    r = plan_dsa(mode="LEARN", level="beginner", days=30, minutes=60)
    reviews = {b.day for b in r.blocks if b.phase == "review"}
    assert reviews == {7, 14, 21, 28}
    assert {b.day for b in r.blocks if b.phase == "mock"} == {30}
    short = plan_dsa(mode="LEARN", level="beginner", days=5, minutes=45)
    assert not any(b.phase == "mock" for b in short.blocks)


def test_short_plans_trim_lowest_priority_topics_and_report_them():
    r = plan_dsa(mode="LEARN", level="beginner", days=7, minutes=45)
    assert r.trimmed and len(r.topics) <= 6
    kept = {t["key"] for t in r.topics}
    assert "arrays" in kept and "hashing" in kept          # core topics survive


def test_known_topics_are_skipped_and_empty_plan_rejected():
    r = plan_dsa(mode="LEARN", level="intermediate", days=20, minutes=60, known=["arrays", "hashing"])
    assert "arrays" not in {t["key"] for t in r.topics}
    with pytest.raises(PlanError):
        plan_dsa(mode="LEARN", level="beginner", days=20, minutes=60, topics=["dp"], known=["dp"])
    with pytest.raises(PlanError):
        plan_dsa(mode="LEARN", level="beginner", days=20, minutes=60, topics=["nope"])


def test_weak_topics_get_more_days_and_difficulty_preference():
    base = {t["key"]: t["days"] for t in plan_dsa(mode="PRACTICE", level="intermediate", days=30, minutes=60).topics}
    boosted = {t["key"]: t["days"] for t in plan_dsa(mode="PRACTICE", level="intermediate", days=30, minutes=60, weak=["graphs"]).topics}
    assert boosted["graphs"] >= base["graphs"]
    hard = plan_dsa(mode="PRACTICE", level="advanced", days=14, minutes=60, difficulty="hard", topics=["dp"])
    assert [b.difficulty for b in hard.blocks if b.phase == "practice"][0] == "Hard"


def test_weekend_skipping_and_date_helpers():
    d = dt.date(2026, 10, 23)    # Friday
    ds = plan_dates(d, 4, True)
    assert [x.weekday() for x in ds] == [4, 0, 1, 2]
    assert dates_between(d, d + dt.timedelta(days=3), True) == ds[:2]


def test_interview_and_english_plans():
    r = plan_interview(days=10, minutes=30, role="Backend Developer", experience="junior")
    assert len(r.blocks) == 10 and all(b.practice_kind == "INTERVIEW" and b.mode == TaskMode.SPEECH for b in r.blocks)
    assert r.blocks[0].practice_config["round"] in ("hr", "behavioral") and r.blocks[-1].practice_config["round"] == "mixed"
    with pytest.raises(PlanError):
        plan_interview(days=5, minutes=30, role=" ")
    e = plan_english(days=5, minutes=20, cefr="A2")
    assert len({b.practice_config["topic"] for b in e.blocks}) == 5 and all(b.practice_config["instant_feedback"] for b in e.blocks)


# ───────────────────────── plans API ─────────────────────────
H = {"X-Client-Date": "2026-10-21"}
BODY = {"track": "DSA", "mode": "LEARN", "days": 14, "minutes_per_day": 60, "level": "beginner", "language": "python"}


async def test_placement_and_preview(client, auth):
    qs = (await client.get("/api/plans/placement")).json()
    assert len(qs) == 14 and "answer" not in qs[0]
    from app.services.curriculum import PLACEMENT
    perfect = (await client.post("/api/plans/placement", json={"answers": {q.id: q.answer for q in PLACEMENT}})).json()
    assert perfect["score"] == 14 and perfect["level"] == "advanced" and perfect["suggested_mode"] == "PRACTICE" and not perfect["weak_topics"]
    zero = (await client.post("/api/plans/placement", json={"answers": {}})).json()
    assert zero["level"] == "beginner" and zero["known_topics"] == [] and zero["suggested_mode"] == "LEARN"
    p = await client.post("/api/plans/preview", json=BODY)
    assert p.status_code == 200
    j = p.json()
    assert j["start_date"] == "2026-10-21" and j["end_date"] == "2026-11-03" and len(j["sample_days"]) == 7 and j["total_blocks"] > 14
    assert (await client.get("/api/plans/active")).json() is None            # preview wrote nothing
    assert (await client.post("/api/plans/preview", json={**BODY, "days": 2})).status_code == 422
    assert (await client.post("/api/plans/preview", json={**BODY, "topics": ["zzz"]})).status_code == 422
    assert (await client.post("/api/plans/preview", json={"track": "INTERVIEW", "days": 5, "minutes_per_day": 30})).status_code == 422


async def test_create_plan_schedules_blocks_and_updates_profile(client, auth):
    r = await client.post("/api/plans/", json=BODY)
    assert r.status_code == 201, r.text
    plan = r.json()
    assert plan["blocks_total"] > 14 and plan["progress_pct"] == 0 and plan["day_index"] == 1 and plan["days_left"] == 14
    assert plan["today_count"] >= 2 and plan["next_task_id"]
    today = (await client.get("/api/schedule/today")).json()
    assert today["total_count"] == plan["today_count"]
    first = today["tasks"][0]
    assert first["task_mode"] == "THEORY" and first["phase"] == "theory" and first["plan_id"] == plan["id"] and not first["content_ready"]
    me = (await client.get("/api/auth/me")).json()
    assert me["onboarded"] and me["goal"] == "dsa" and me["daily_target_minutes"] == 60
    days = (await client.get(f"/api/plans/{plan['id']}/days")).json()
    assert len(days) == 14 and days[0]["is_today"] and days[0]["day"] == 1
    # creating another plan archives the first and removes its pending blocks
    r2 = await client.post("/api/plans/", json={**BODY, "days": 7, "mode": "PRACTICE", "level": "advanced"})
    assert r2.status_code == 201
    assert (await client.get("/api/plans/active")).json()["id"] == r2.json()["id"]
    assert (await client.get(f"/api/plans/{plan['id']}/days")).json() == []


async def test_plan_isolated_between_users(client, auth):
    plan = (await client.post("/api/plans/", json=BODY)).json()
    other = await client.post("/api/auth/register", json={"name": "B", "email": "b@example.com", "password": "supersecret1"})
    tok = other.json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    assert (await client.get(f"/api/plans/{plan['id']}/days", headers=h)).status_code == 404
    assert (await client.delete(f"/api/plans/{plan['id']}", headers=h)).status_code == 404
    assert (await client.get("/api/plans/active", headers=h)).json() is None


async def test_lessons_are_cached_and_tests_verified_against_reference(client, auth, fake_ai):
    await client.post("/api/plans/", json={**BODY, "days": 7, "minutes_per_day": 60})
    tasks = (await client.get("/api/schedule/today")).json()["tasks"]
    code = next(t for t in tasks if t["task_mode"] == "CODE")
    # a wrong expected value must be dropped because the reference solution disagrees
    fake_ai.override = {"description": "d", "difficulty": "Easy", "tags": ["x"], "prompt_context": "### Problem\nDouble it.", "constraints": [],
                        "hints": ["h"], "checklist": [], "starter_code": "def f(x):\n    pass\n",
                        "test_cases": [{"name": "a", "call": "f(2)", "expected": "4"}, {"name": "b", "call": "f(3)", "expected": "6"},
                                       {"name": "c", "call": "f(5)", "expected": "10"}, {"name": "bad", "call": "f(4)", "expected": "9"}],
                        "reference_solution": "def f(x):\n    return x * 2\n"}
    r = await client.post(f"/api/schedule/{code['id']}/regenerate")
    assert r.status_code == 200, r.text
    assert [t["name"] for t in r.json()["test_cases"]] == ["a", "b", "c"]
    assert "reference_solution" not in r.json()
    # second user with the same curriculum block reuses the cached problem without calling the AI
    calls_before = len(fake_ai.calls)
    other = await client.post("/api/auth/register", json={"name": "B", "email": "b2@example.com", "password": "supersecret1"})
    h = {"Authorization": f"Bearer {other.json()['access_token']}"}
    await client.post("/api/plans/", json={**BODY, "days": 7, "minutes_per_day": 60}, headers=h)
    t2 = next(t for t in (await client.get("/api/schedule/today", headers=h)).json()["tasks"] if t["id"] != code["id"] and t["title"] == code["title"])
    r2 = await client.post(f"/api/schedule/{t2['id']}/regenerate", headers=h)
    assert r2.status_code == 200 and len(fake_ai.calls) == calls_before
    assert [t["name"] for t in r2.json()["test_cases"]] == ["a", "b", "c"]


async def test_unreliable_problem_is_rejected(client, auth, fake_ai):
    t = (await client.post("/api/schedule/", json={"title": "Bad", "task_mode": "CODE", "duration_minutes": 30})).json()
    fake_ai.override = {"description": "d", "prompt_context": "### P", "starter_code": "def f(x):\n    pass\n", "reference_solution": "def f(x):\n    return 0\n",
                        "test_cases": [{"name": "a", "call": "f(2)", "expected": "4"}, {"name": "b", "call": "f(3)", "expected": "6"}, {"name": "c", "call": "f(5)", "expected": "10"}]}
    r = await client.post(f"/api/schedule/{t['id']}/regenerate")
    assert r.status_code == 502 and r.json()["code"] == "ai_unverified"


async def test_rebalance_after_missed_days(client, auth):
    plan = (await client.post("/api/plans/", json={**BODY, "start_date": "2026-10-14"})).json()   # started a week ago
    assert plan["missed_count"] > 0 and plan["day_index"] == 8
    r = await client.post(f"/api/plans/{plan['id']}/rebalance", json={"extend_days": 0})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["plan"]["missed_count"] == 0 and j["moved"] > 0 and j["plan"]["rebalanced_count"] == 1
    days = (await client.get(f"/api/plans/{plan['id']}/days")).json()
    pending_dates = [d["date"] for d in days for b in d["blocks"] if b["status"] == "pending"]
    assert min(pending_dates) >= "2026-10-21" and max(pending_dates) <= j["new_end_date"]
    assert all(sum(b["minutes"] for b in d["blocks"]) <= 60 for d in days)
    if j["dropped"]:                                   # lowest-value blocks go first, theory/mocks last
        assert not any("Mock" in x or "Concept Lesson" in x for x in j["dropped"][:1])
    ext = await client.post(f"/api/plans/{plan['id']}/rebalance", json={"extend_days": 5})
    assert ext.json()["new_end_date"] > j["new_end_date"]
    assert (await client.post(f"/api/plans/{plan['id']}/rebalance", json={"extend_days": 99})).status_code == 422


async def test_adaptive_extra_practice_after_a_bad_score(client, auth, fake_ai):
    await client.post("/api/plans/", json={**BODY, "mode": "PRACTICE", "level": "intermediate", "days": 7})
    tasks = (await client.get("/api/schedule/today")).json()["tasks"]
    code = next(t for t in tasks if t["phase"] == "practice")
    await client.post(f"/api/schedule/{code['id']}/regenerate")
    fake_ai.override = {"score": 20, "verdict": "Needs work", "feedback_bullets": ["a"], "insights": [{"kind": "warning", "title": "t", "detail": "d"}],
                        "takeaway": "t", "logic_status": "FAIL", "time_complexity": "O(n^2)", "space_complexity": "O(1)"}
    ev = await client.post(f"/api/focus/{code['id']}/evaluate", json={"user_submission": "def f(x):\n    return 1\n", "time_spent_seconds": 600})
    assert ev.status_code == 200, ev.text
    plan = (await client.get("/api/plans/active")).json()
    days = (await client.get(f"/api/plans/{plan['id']}/days")).json()
    extras = [b for d in days for b in d["blocks"] if b["phase"] == "extra"]
    assert len(extras) == 1 and extras[0]["difficulty"] == "Easy"
    assert plan["topics"][0]["mastery"] is not None and plan["blocks_done"] == 1


async def test_stop_plan_keeps_completed_work(client, auth):
    plan = (await client.post("/api/plans/", json=BODY)).json()
    t = (await client.get("/api/schedule/today")).json()["tasks"][0]
    await client.patch(f"/api/schedule/{t['id']}/status", json={"status": "completed"})
    assert (await client.delete(f"/api/plans/{plan['id']}")).status_code == 204
    assert (await client.get("/api/plans/active")).json() is None
    assert (await client.get("/api/schedule/today")).json()["total_count"] == 1


# ───────────────────────── AI help ─────────────────────────
async def _lesson(client):
    return (await client.post("/api/schedule/", json={"title": "Queues", "task_mode": "THEORY", "duration_minutes": 30,
                                                       "prompt_context": "## Queues\nA queue is first in, first out."})).json()


async def test_explain_is_cached_across_users_and_quota_only_counts_ai_calls(client, auth, fake_ai):
    t = await _lesson(client)
    r = await client.post("/api/help/explain", json={"task_id": t["id"], "kind": "analogy", "passage": "first in, first out"})
    assert r.status_code == 200 and r.json()["cached"] is False and r.json()["remaining_today"] == 39
    r2 = await client.post("/api/help/explain", json={"task_id": t["id"], "kind": "analogy", "passage": "first in, first out"})
    assert r2.json()["cached"] is True and r2.json()["remaining_today"] == 39
    assert (await client.get("/api/help/config")).json()["remaining_today"] == 39
    bad = await client.post("/api/help/explain", json={"task_id": t["id"], "kind": "poem"})
    assert bad.status_code == 422
    assert (await client.post("/api/help/explain", json={"task_id": "000000000000000000000000", "kind": "simpler"})).status_code == 404


async def test_ask_and_daily_limit(client, auth, fake_ai, monkeypatch):
    from app.core.config import get_settings
    monkeypatch.setattr(get_settings(), "help_daily_limit", 2)
    t = await _lesson(client)
    body = {"task_id": t["id"], "question": "Why first in first out?", "history": [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "hello"}]}
    assert (await client.post("/api/help/ask", json=body)).json()["remaining_today"] == 1
    assert (await client.post("/api/help/ask", json=body)).json()["remaining_today"] == 0
    r = await client.post("/api/help/ask", json=body)
    assert r.status_code == 429 and r.json()["code"] == "help_limit"


async def test_comprehension_check_and_recap_after_two_failures(client, auth, fake_ai):
    await client.post("/api/plans/", json=BODY)
    th = next(t for t in (await client.get("/api/schedule/today")).json()["tasks"] if t["task_mode"] == "THEORY")
    await client.post(f"/api/schedule/{th['id']}/regenerate")
    q = (await client.post("/api/help/check", json={"task_id": th["id"]})).json()
    assert q["question"] and q["key_points"]
    fake_ai.understood = True
    ok = (await client.post("/api/help/check/answer", json={"task_id": th["id"], "question": q["question"], "key_points": q["key_points"], "answer": "first in first out"})).json()
    assert ok["understood"] and ok["reexplain"] == ""
    fake_ai.understood = False
    for _ in range(2):
        r = (await client.post("/api/help/check/answer", json={"task_id": th["id"], "question": q["question"], "key_points": q["key_points"], "answer": "no idea"})).json()
        assert not r["understood"] and r["reexplain"]
    plan = (await client.get("/api/plans/active")).json()
    days = (await client.get(f"/api/plans/{plan['id']}/days")).json()
    assert sum(1 for d in days for b in d["blocks"] if b["phase"] == "extra" and b["mode"] == "THEORY") == 1


async def test_hint_ladder_gating_and_solution_penalty(client, auth, fake_ai):
    t = (await client.post("/api/schedule/", json={"title": "Dbl", "task_mode": "CODE", "duration_minutes": 30})).json()
    await client.post(f"/api/schedule/{t['id']}/regenerate")
    h = lambda **k: client.post("/api/help/hint", json={"task_id": t["id"], "code": "def f(x):\n    return 0", **k})
    early = await h(level=1, elapsed_seconds=30, failed_runs=0)
    assert early.status_code == 403 and "unlocks" in early.json()["detail"]
    assert (await h(level=1, elapsed_seconds=301)).json()["hint"]
    assert (await h(level=2, elapsed_seconds=100, failed_runs=3)).status_code == 200            # failed runs also unlock
    assert (await h(level=3, elapsed_seconds=400)).status_code == 403                           # can't skip ahead
    assert (await h(level=4, elapsed_seconds=2000)).status_code == 400                          # needs confirmation
    sol = (await h(level=4, elapsed_seconds=2000, confirm_solution=True)).json()
    assert "return x * 2" in sol["solution"]
    full = await client.post(f"/api/focus/{t['id']}/evaluate", json={"user_submission": "def f(x):\n    return x * 2\n", "time_spent_seconds": 1800})
    assert full.json()["task"]["hint_level_used"] == 4
    ordinary = (await client.post("/api/schedule/", json={"title": "Dbl2", "task_mode": "CODE", "duration_minutes": 30})).json()
    await client.post(f"/api/schedule/{ordinary['id']}/regenerate")
    plain = await client.post(f"/api/focus/{ordinary['id']}/evaluate", json={"user_submission": "def f(x):\n    return x * 2\n", "time_spent_seconds": 1800})
    assert full.json()["entry"]["xp_earned"] * 2 - 1 <= plain.json()["entry"]["xp_earned"] <= full.json()["entry"]["xp_earned"] * 2 + 1
    off = await client.patch("/api/auth/me", json={"preferences": {"ai_hints": False}})
    assert off.status_code == 200
    assert (await h(level=1, elapsed_seconds=999)).status_code == 403
    th = await _lesson(client)
    assert (await client.post("/api/help/hint", json={"task_id": th["id"], "level": 1, "elapsed_seconds": 999})).status_code in (400, 403)


# ───────────────────────── speaking practice ─────────────────────────
ANS = {"answer": "I goed to the market yesterday and, um, I bought some fresh vegetables for my family dinner.", "duration_seconds": 12}


async def test_english_session_full_flow(client, auth, fake_ai):
    r = await client.post("/api/practice/sessions", json={"kind": "ENGLISH", "cefr": "A2", "topic": "Food", "num_questions": 3})
    assert r.status_code == 201, r.text
    s = r.json()
    assert s["total"] == 3 and s["instant_feedback"] and s["current_index"] == 0 and len(s["turns"]) == 1 and s["turns"][0]["rubric"] is None
    sid = s["id"]
    assert (await client.post(f"/api/practice/sessions/{sid}/answer", json={"answer": "", "duration_seconds": 3})).status_code == 400
    assert (await client.post(f"/api/practice/sessions/{sid}/answer", json={"answer": "yes ok", "duration_seconds": 3})).status_code == 400
    a1 = (await client.post(f"/api/practice/sessions/{sid}/answer", json=ANS)).json()
    assert a1["feedback"]["score"] == 80 and a1["feedback"]["grammar_fixes"][0]["right"] == "I went" and not a1["done"]
    assert a1["session"]["current_index"] == 1 and a1["session"]["turns"][0]["wpm"] > 0 and a1["session"]["turns"][0]["fillers"][0]["word"]
    await client.post(f"/api/practice/sessions/{sid}/answer", json={"skip": True})
    assert (await client.post(f"/api/practice/sessions/{sid}/answer", json=ANS)).json()["done"]
    fin = await client.post(f"/api/practice/sessions/{sid}/finish")
    assert fin.status_code == 200, fin.text
    out = fin.json()
    assert out["session"]["status"] == "completed" and out["session"]["report"]["cefr_estimate"] == "B1" and out["session"]["xp_earned"] > 0
    assert out["session"]["report"]["answered"] == 2 and out["session"]["report"]["skipped"] == 1 and out["streak_count"] >= 1
    assert out["session"]["turns"][0]["rubric"] == "point a; point b"
    assert (await client.post(f"/api/practice/sessions/{sid}/answer", json=ANS)).status_code == 400
    again = await client.post(f"/api/practice/sessions/{sid}/finish")
    assert again.status_code == 200 and again.json()["total_xp"] == out["total_xp"]           # idempotent: no double XP
    # journal + schedule + mistakes tracker all see it
    j = (await client.get("/api/metrics/journal")).json()
    assert j["total"] == 1 and j["items"][0]["task_mode"] == "SPEECH" and j["items"][0]["score"] == out["session"]["score"]
    assert (await client.get("/api/schedule/today")).json()["completed_count"] == 1
    m = (await client.get("/api/practice/mistakes")).json()
    assert m[0]["wrong"] == "i goed" and m[0]["times"] == 2
    assert (await client.patch(f"/api/practice/mistakes/{m[0]['id']}", json={"mastered": True})).json()["mastered"]
    assert (await client.get("/api/practice/mistakes")).json() == []
    assert len((await client.get("/api/practice/sessions")).json()) == 1


async def test_interview_follow_up_and_hidden_feedback(client, auth, fake_ai):
    fake_ai.follow_up = True
    s = (await client.post("/api/practice/sessions", json={"kind": "INTERVIEW", "role": "Backend Developer", "round": "hr", "num_questions": 2})).json()
    assert s["instant_feedback"] is False
    a = (await client.post(f"/api/practice/sessions/{s['id']}/answer", json={"answer": "I am a developer with two years of experience building APIs and I love solving problems.", "duration_seconds": 20})).json()
    assert a["feedback"] is None and a["session"]["total"] == 3 and a["session"]["turns"][0]["feedback"] is None
    assert a["session"]["turns"][1]["question"] == "Can you give a concrete example of that?" or a["session"]["current_index"] == 1
    cur = (await client.get(f"/api/practice/sessions/{s['id']}")).json()
    nxt = cur["turns"][-1]
    assert nxt["kind"] == "followup" and nxt["answer"] is None
    # an early finish is allowed once something was answered; feedback appears in the report
    fin = (await client.post(f"/api/practice/sessions/{s['id']}/finish")).json()
    assert fin["session"]["report"]["readiness"] == "Almost there" and fin["session"]["turns"][0]["feedback"]["score"] == 80


async def test_finish_requires_an_answer_and_abandon_cleans_up(client, auth, fake_ai):
    s = (await client.post("/api/practice/sessions", json={"kind": "ENGLISH", "num_questions": 2})).json()
    assert (await client.post(f"/api/practice/sessions/{s['id']}/finish")).status_code == 400
    assert (await client.delete(f"/api/practice/sessions/{s['id']}")).status_code == 204
    assert (await client.get("/api/schedule/today")).json()["total_count"] == 0
    assert (await client.get("/api/practice/sessions/000000000000000000000000")).status_code == 404


async def test_ai_failure_does_not_corrupt_a_session(client, auth, fake_ai):
    s = (await client.post("/api/practice/sessions", json={"kind": "ENGLISH", "num_questions": 2})).json()
    fake_ai.fail_with = AIServiceError("down", 503, "ai_unreachable")
    r = await client.post(f"/api/practice/sessions/{s['id']}/answer", json=ANS)
    assert r.status_code == 503
    fake_ai.fail_with = None
    assert (await client.get(f"/api/practice/sessions/{s['id']}")).json()["answered"] == 0       # can simply retry
    assert (await client.post(f"/api/practice/sessions/{s['id']}/answer", json=ANS)).status_code == 200
    fake_ai.fail_with = AIServiceError("down", 503, "ai_unreachable")
    assert (await client.post("/api/practice/sessions", json={"kind": "ENGLISH"})).status_code == 503
    assert (await client.get("/api/schedule/today")).json()["total_count"] == 1                   # no orphan block from the failed start


async def test_scheduled_interview_block_resumes_and_completes(client, auth, fake_ai):
    plan = (await client.post("/api/plans/", json={"track": "INTERVIEW", "days": 5, "minutes_per_day": 30, "role": "Data Analyst", "experience": "fresher"})).json()
    blk = (await client.get("/api/schedule/today")).json()["tasks"][0]
    assert blk["practice_kind"] == "INTERVIEW" and blk["content_ready"] and blk["practice_config"]["role"] == "Data Analyst"
    s1 = (await client.post("/api/practice/sessions", json={"kind": "INTERVIEW", "task_id": blk["id"]})).json()
    n_calls = len(fake_ai.calls)
    s2 = (await client.post("/api/practice/sessions", json={"kind": "INTERVIEW", "task_id": blk["id"]})).json()
    assert s2["id"] == s1["id"] and len(fake_ai.calls) == n_calls                       # resumed, no new questions generated
    assert (await client.post("/api/practice/sessions", json={"kind": "ENGLISH", "task_id": blk["id"]})).status_code == 400
    await client.post(f"/api/practice/sessions/{s1['id']}/answer", json={"answer": "I enjoy working with data and telling stories with it every day.", "duration_seconds": 15})
    await client.post(f"/api/practice/sessions/{s1['id']}/finish")
    p = (await client.get("/api/plans/active")).json()
    assert p["blocks_done"] == 1 and p["topics"][0]["blocks_done"] == 0 or p["blocks_done"] == 1
    assert plan["track"] == "INTERVIEW"
