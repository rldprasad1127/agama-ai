from __future__ import annotations

import pytest

from app.core.errors import AIServiceError

H = {"X-Client-Date": "2026-10-21"}


# ───────────────────────── auth ─────────────────────────
async def test_register_login_me(client):
    r = await client.post("/api/auth/register", json={"name": "Ram", "email": "Ram@Example.com", "password": "supersecret1"})
    assert r.status_code == 201
    assert r.json()["user"]["email"] == "ram@example.com"
    dup = await client.post("/api/auth/register", json={"name": "X", "email": "ram@example.com", "password": "supersecret1"})
    assert dup.status_code == 409
    bad = await client.post("/api/auth/login", json={"email": "ram@example.com", "password": "nope-nope"})
    assert bad.status_code == 401
    ok = await client.post("/api/auth/login", json={"email": "RAM@example.com", "password": "supersecret1"})
    assert ok.status_code == 200
    tok = ok.json()["access_token"]
    me = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {tok}"})
    assert me.status_code == 200 and me.json()["name"] == "Ram"
    assert (await client.get("/api/auth/me")).status_code == 401
    short = await client.post("/api/auth/register", json={"name": "A", "email": "a@b.co", "password": "short"})
    assert short.status_code == 422


async def test_profile_update_and_password(client, auth):
    r = await client.patch("/api/auth/me", json={"name": "Ramu", "daily_target_minutes": 180, "preferences": {"day_start": "08:30", "ai_model": "qwen3:8b"}})
    assert r.status_code == 200
    j = r.json()
    assert j["name"] == "Ramu" and j["daily_target_minutes"] == 180 and j["preferences"]["day_start"] == "08:30"
    assert j["preferences"]["ai_model"] == "qwen3:8b"
    r = await client.patch("/api/auth/me", json={"preferences": {"day_start": "25:99"}})
    assert r.status_code == 422
    r = await client.post("/api/auth/change-password", json={"current_password": "wrongwrong", "new_password": "newpassword1"})
    assert r.status_code == 400
    r = await client.post("/api/auth/change-password", json={"current_password": "supersecret1", "new_password": "newpassword1"})
    assert r.status_code == 204
    r = await client.post("/api/auth/login", json={"email": "ram@example.com", "password": "newpassword1"})
    assert r.status_code == 200


# ───────────────────────── schedule ─────────────────────────
async def _mk(client, title="Block", mode="CODE", minutes=45, **kw):
    r = await client.post("/api/schedule/", json={"title": title, "task_mode": mode, "duration_minutes": minutes, **kw})
    assert r.status_code == 201, r.text
    return r.json()


async def test_schedule_crud_reorder_times(client, auth):
    a = await _mk(client, "A", "CODE", 45, prompt_context="x")
    b = await _mk(client, "B", "THEORY", 50)
    c = await _mk(client, "C", "SPEECH", 30)
    s = (await client.get("/api/schedule/today")).json()
    assert [t["title"] for t in s["tasks"]] == ["A", "B", "C"]
    assert s["total_planned_minutes"] == 125 and s["total_count"] == 3 and s["progress_pct"] == 0
    assert [(t["start_time"], t["end_time"]) for t in s["tasks"]] == [("09:00", "09:45"), ("09:45", "10:35"), ("10:35", "11:05")]
    assert s["next_task_id"] == a["id"] and s["date"] == "2026-10-21"
    assert a["content_ready"] is True and b["content_ready"] is False

    r = await client.patch("/api/schedule/reorder", json={"task_ids": [c["id"], a["id"], b["id"]]})
    assert r.status_code == 200
    assert [t["title"] for t in r.json()["tasks"]] == ["C", "A", "B"]
    # partial reorder keeps the rest after
    r = await client.patch("/api/schedule/reorder", json={"task_ids": [b["id"]]})
    assert [t["title"] for t in r.json()["tasks"]][0] == "B"
    assert (await client.patch("/api/schedule/reorder", json={"task_ids": ["nope"]})).status_code == 404
    assert (await client.patch("/api/schedule/reorder", json={"task_ids": [a["id"], a["id"]]})).status_code == 400

    u = await client.put(f"/api/schedule/{a['id']}", json={"title": "A2", "duration_minutes": 60, "prompt_context": ""})
    assert u.status_code == 200 and u.json()["title"] == "A2" and u.json()["duration_minutes"] == 60 and u.json()["content_ready"] is False
    assert (await client.put(f"/api/schedule/{a['id']}", json={"duration_minutes": 1})).status_code == 422
    assert (await client.put("/api/schedule/000000000000000000000000", json={"title": "x"})).status_code == 404

    sh = await client.post("/api/schedule/shape", json={"minutes": 30})
    assert sh.status_code == 200 and sh.json()["total_planned_minutes"] == 125 + 15 + 30

    assert (await client.delete(f"/api/schedule/{c['id']}")).status_code == 204
    assert (await client.get("/api/schedule/today")).json()["total_count"] == 2


async def test_backlog_and_move(client, auth):
    t = await _mk(client, "Later", backlog=True)
    assert t["date"] is None
    assert [x["id"] for x in (await client.get("/api/schedule/backlog")).json()] == [t["id"]]
    assert (await client.get("/api/schedule/today")).json()["total_count"] == 0
    r = await client.put(f"/api/schedule/{t['id']}", json={"date": "2026-10-21"})
    assert r.json()["date"] == "2026-10-21"
    assert (await client.get("/api/schedule/backlog")).json() == []
    r = await client.put(f"/api/schedule/{t['id']}", json={"move_to_backlog": True})
    assert r.json()["date"] is None


async def test_user_isolation(client, auth):
    t = await _mk(client, "Mine")
    other = await client.post("/api/auth/register", json={"name": "O", "email": "o@x.io", "password": "password123"})
    h = {"Authorization": f"Bearer {other.json()['access_token']}"}
    assert (await client.put(f"/api/schedule/{t['id']}", json={"title": "hack"}, headers=h)).status_code == 404
    assert (await client.get(f"/api/focus/{t['id']}", headers=h)).status_code == 404
    assert (await client.delete(f"/api/schedule/{t['id']}", headers=h)).status_code == 404


async def test_presets(client, auth):
    p = (await client.get("/api/schedule/presets")).json()
    assert {x["key"] for x in p} == {"deep-systems", "algo-gauntlet"}
    r = await client.post("/api/schedule/presets/algo-gauntlet/apply", json={})
    assert r.status_code == 201 and r.json()["total_count"] == 4
    assert (await client.post("/api/schedule/presets/nope/apply", json={})).status_code == 404


async def test_generate_preview_and_regenerate(client, auth, fake_ai):
    r = await client.post("/api/schedule/generate", json={"title": "Squares", "task_mode": "CODE", "language": "python"})
    assert r.status_code == 200
    j = r.json()
    assert j["prompt_context"].startswith("### Problem") and j["test_cases"][0]["call"] == "f(2)" and j["starter_code"]
    t = await _mk(client, "Empty", "PROSE")
    r = await client.post(f"/api/schedule/{t['id']}/regenerate")
    assert r.status_code == 200 and r.json()["content_ready"] and r.json()["word_target_max"] == 200 and r.json()["checklist"] == ["k1", "k2"]
    fake_ai.fail_with = AIServiceError("down", 503, "ai_unreachable")
    r = await client.post("/api/schedule/generate", json={"title": "x", "task_mode": "THEORY"})
    assert r.status_code == 503 and r.json()["code"] == "ai_unreachable"


# ───────────────────────── focus / evaluate ─────────────────────────
SOLUTION = """
from typing import List
from collections import deque
class Solution:
    def maxSlidingWindow(self, nums: List[int], k: int) -> List[int]:
        q, out = deque(), []
        for i, v in enumerate(nums):
            while q and nums[q[-1]] <= v: q.pop()
            q.append(i)
            if q[0] <= i - k: q.popleft()
            if i >= k - 1: out.append(nums[q[0]])
        return out
"""
TESTS = [
    {"name": "std", "call": "Solution().maxSlidingWindow([1,3,-1,-3,5,3,6,7], 3)", "expected": "[3,3,5,5,6,7]"},
    {"name": "one", "call": "Solution().maxSlidingWindow([1], 1)", "expected": "[1]"},
]


async def test_draft_and_run_code(client, auth):
    t = await _mk(client, "Code", "CODE", language="python", prompt_context="p", test_cases=TESTS)
    d = await client.put(f"/api/focus/{t['id']}/draft", json={"content": "abc", "notes": "n", "checklist_done": [0], "hints_used": 1, "elapsed_seconds": 90})
    assert d.status_code == 200
    w = (await client.get(f"/api/focus/{t['id']}")).json()
    assert w["draft"]["content"] == "abc" and w["draft"]["elapsed_seconds"] == 90

    r = await client.post(f"/api/focus/{t['id']}/run", json={"code": SOLUTION + "\nprint('hello')"})
    j = r.json()
    assert r.status_code == 200 and j["tests_passed"] == 2 and j["tests_total"] == 2 and "hello" in j["stdout"] and "__AGAMA" not in j["stdout"]
    bad = (await client.post(f"/api/focus/{t['id']}/run", json={"code": SOLUTION.replace("out.append(nums[q[0]])", "out.append(nums[q[-1]] + 1)")})).json()
    assert bad["tests_total"] == 2 and bad["tests_passed"] < 2
    syn = (await client.post(f"/api/focus/{t['id']}/run", json={"code": "def x(:"})).json()
    assert syn["tests_passed"] == 0 and syn["tests_total"] == 2 and "SyntaxError" in syn["stderr"]
    loop = (await client.post(f"/api/focus/{t['id']}/run", json={"code": "while True: pass", "run_tests": False})).json()
    assert loop["timed_out"] is True
    plain = (await client.post(f"/api/focus/{t['id']}/run", json={"code": "print(input()[::-1])", "stdin": "abc", "run_tests": False})).json()
    assert plain["stdout"].strip() == "cba" and plain["exit_code"] == 0
    assert (await client.post(f"/api/focus/{t['id']}/run", json={"code": "  "})).status_code == 400
    th = await _mk(client, "Theory", "THEORY")
    assert (await client.post(f"/api/focus/{th['id']}/run", json={"code": "1"})).status_code == 400


async def test_evaluate_code_full_flow(client, auth, fake_ai):
    t = await _mk(client, "Code", "CODE", language="python", prompt_context="Solve", test_cases=TESTS)
    r = await client.post(f"/api/focus/{t['id']}/evaluate", json={"user_submission": SOLUTION, "time_spent_seconds": 2700, "meta": {"hints_used": 1}})
    assert r.status_code == 200, r.text
    j = r.json()
    m = j["entry"]["metrics"]
    assert m["mode"] == "CODE" and m["logic_status"] == "PASS" and m["tests_passed"] == 2 and m["tests_total"] == 2
    assert j["entry"]["score"] == 86 and j["entry"]["xp_earned"] == round(86 * 45 / 300)
    assert j["task"]["status"] == "completed" and j["streak_count"] == 1 and j["total_xp"] == j["entry"]["xp_earned"]
    assert len(j["entry"]["submission_sha"]) == 64
    assert "Solution" in fake_ai.calls[-1][1] and "AUTOMATED TESTS: 2/2" in fake_ai.calls[-1][1]
    # re-evaluate does not farm XP
    r2 = await client.post(f"/api/focus/{t['id']}/evaluate", json={"user_submission": SOLUTION, "time_spent_seconds": 600})
    assert r2.json()["entry"]["xp_earned"] == 0 and r2.json()["total_xp"] == j["total_xp"]
    # failing tests cap the score / status
    fake_ai.override = None
    t2 = await _mk(client, "Code2", "CODE", language="python", prompt_context="Solve", test_cases=TESTS)
    r3 = await client.post(f"/api/focus/{t2['id']}/evaluate", json={"user_submission": "class Solution:\n    def maxSlidingWindow(self, n, k): return []", "time_spent_seconds": 300})
    m3 = r3.json()["entry"]["metrics"]
    assert m3["logic_status"] == "FAIL" and m3["score"] <= 55 and m3["tests_passed"] == 0


async def test_evaluate_validation_and_ai_failures(client, auth, fake_ai):
    t = await _mk(client, "Prose", "PROSE", prompt_context="p")
    assert (await client.post(f"/api/focus/{t['id']}/evaluate", json={"user_submission": "   "})).status_code == 400
    fake_ai.fail_with = AIServiceError("Ollama rejected the API key", 503, "ai_auth")
    r = await client.post(f"/api/focus/{t['id']}/evaluate", json={"user_submission": "Some words here to evaluate properly.", "time_spent_seconds": 120})
    assert r.status_code == 503 and r.json()["code"] == "ai_auth"
    # nothing was saved and the block is still pending
    assert (await client.get(f"/api/focus/{t['id']}")).json()["status"] == "pending"
    assert (await client.get("/api/metrics/journal")).json()["total"] == 0
    # malformed-but-parseable LLM output -> schema error 502, not a crash
    fake_ai.fail_with = None
    fake_ai.override = {"score": "n/a"}
    r = await client.post(f"/api/focus/{t['id']}/evaluate", json={"user_submission": "Some words here to evaluate properly.", "time_spent_seconds": 120})
    assert r.status_code == 502 and r.json()["code"] == "ai_empty"


async def test_prose_theory_speech(client, auth, fake_ai):
    p = await _mk(client, "Prose", "PROSE", prompt_context="p", word_target_min=10, word_target_max=50)
    text = "The silence came first. " * 12
    r = await client.post(f"/api/focus/{p['id']}/evaluate", json={"user_submission": text, "time_spent_seconds": 600})
    m = r.json()["entry"]["metrics"]
    assert m["mode"] == "PROSE" and m["word_count"] == 48 and m["readability_grade"] is not None and m["word_target_max"] == 50

    th = await _mk(client, "Theory", "THEORY", prompt_context="reading", checklist=["a", "b"])
    r = await client.post(f"/api/focus/{th['id']}/evaluate", json={"user_submission": "my notes", "time_spent_seconds": 900, "meta": {"checklist_done": [0], "notes": "n"}})
    j = r.json()
    assert j["entry"]["metrics"]["mode"] == "THEORY" and j["entry"]["metrics"]["comprehension_score"] == 82
    assert len(j["flashcards"]) == 2 and j["flashcards"][0]["box"] == 1 and j["flashcards"][0]["due_date"] == "2026-10-22"

    sp = await _mk(client, "Speech", "SPEECH", prompt_context="script", target_wpm=135)
    tr = "um good morning panel today we basically eliminate tail latency in our distributed state machine and um we do it well"
    assert (await client.post(f"/api/focus/{sp['id']}/evaluate", json={"user_submission": "hi there", "time_spent_seconds": 10})).status_code == 400
    r = await client.post(f"/api/focus/{sp['id']}/evaluate", json={"user_submission": tr, "time_spent_seconds": 60, "meta": {"duration_seconds": 30, "speaking_seconds": 24}})
    m = r.json()["entry"]["metrics"]
    assert m["mode"] == "SPEECH" and m["wpm"] == 42 and m["filler_total"] == 3 and m["speaking_ratio"] == pytest.approx(0.8)
    assert {f["word"]: f["count"] for f in m["filler_words"]} == {"um": 2, "basically": 1}
    # streak after three completions on the same day is still 1
    assert r.json()["streak_count"] == 1


# ───────────────────────── metrics / journal ─────────────────────────
async def test_journal_stats_heatmap(client, auth, fake_ai):
    for title, mode in [("Alpha code", "CODE"), ("Beta prose", "PROSE"), ("Gamma theory", "THEORY")]:
        t = await _mk(client, title, mode, prompt_context="p", category="Cat " + mode)
        r = await client.post(f"/api/focus/{t['id']}/evaluate", json={"user_submission": "x = 1\n" * 12, "time_spent_seconds": 1800})
        assert r.status_code == 200, r.text
    await _mk(client, "Never done", "CODE")

    j = (await client.get("/api/metrics/journal")).json()
    assert j["total"] == 3 and j["counts_by_mode"]["ALL"] == 3 and j["counts_by_mode"]["CODE"] == 1
    assert j["summary"]["blocks_logged"] == 3 and j["summary"]["focus_seconds"] == 5400 and j["summary"]["pass_rate"] == 100.0
    assert (await client.get("/api/metrics/journal?mode=PROSE")).json()["total"] == 1
    assert (await client.get("/api/metrics/journal?q=gamma")).json()["items"][0]["task_title"] == "Gamma theory"
    assert (await client.get("/api/metrics/journal?date_from=2026-10-22")).json()["total"] == 0
    assert (await client.get("/api/metrics/journal?date_from=2026-10-21&date_to=2026-10-21")).json()["total"] == 3
    pg = (await client.get("/api/metrics/journal?page_size=2&page=2")).json()
    assert len(pg["items"]) == 1 and pg["pages"] == 2

    eid = j["items"][0]["id"]
    assert (await client.get(f"/api/metrics/journal/{eid}")).status_code == 200
    assert (await client.get("/api/metrics/journal/zzz")).status_code == 404
    ex = (await client.get("/api/metrics/journal/export")).json()
    assert ex["count"] == 3

    hm = (await client.get("/api/metrics/heatmap?days=90")).json()
    assert len(hm["days"]) == 90 and hm["days"][-1]["date"] == "2026-10-21" and hm["days"][-1]["minutes"] == 90
    assert hm["days"][-1]["sessions"] == 3 and len(hm["days"][-1]["items"]) == 3 and hm["active_days"] == 1 and hm["days"][0]["minutes"] == 0

    st = (await client.get("/api/metrics/stats?range_days=30")).json()
    assert st["total_focus_minutes"] == 90 and st["sessions"] == 3 and st["blocks_total"] == 4 and st["blocks_completed"] == 3
    assert st["completion_rate"] == 75.0 and st["active_last_7"][-1] is True and st["streak_count"] == 1
    assert st["mean_block_minutes"] == 30.0 and st["by_mode"]["CODE"]["count"] == 1

    pf = (await client.get("/api/metrics/performance?mode=CODE")).json()
    assert pf["attempts"] == 1 and pf["topics"][0]["category"] == "Cat CODE" and len(pf["series"]) == 1

    rr = await client.post(f"/api/metrics/journal/{eid}/rerun")
    assert rr.status_code == 200 and rr.json()["status"] == "pending" and rr.json()["draft"]["content"]
    assert (await client.delete(f"/api/metrics/journal/{eid}")).status_code == 204
    assert (await client.get("/api/metrics/journal")).json()["total"] == 2


async def test_flashcards(client, auth, fake_ai):
    t = await _mk(client, "Theory", "THEORY", prompt_context="reading about raft")
    r = await client.post("/api/flashcards/generate", json={"task_id": t["id"], "count": 3})
    assert r.status_code == 201 and len(r.json()) == 3
    cards = (await client.get("/api/flashcards/?due=true")).json()
    assert len(cards) == 3 and cards[0]["next_intervals"] == {"hard": 0, "good": 2, "easy": 4}
    cid = cards[0]["id"]
    g = (await client.post(f"/api/flashcards/{cid}/review", json={"rating": "good"})).json()
    assert g["box"] == 2 and g["due_date"] == "2026-10-23"
    e = (await client.post(f"/api/flashcards/{cid}/review", json={"rating": "easy"})).json()
    assert e["box"] == 4 and e["due_date"] == "2026-10-29"
    h = (await client.post(f"/api/flashcards/{cid}/review", json={"rating": "hard"})).json()
    assert h["box"] == 1 and h["due_date"] == "2026-10-21"
    assert len((await client.get("/api/flashcards/?due=true")).json()) == 3
    st = (await client.get("/api/flashcards/stats")).json()
    assert st["total"] == 3 and st["accuracy"] == 67
    m = (await client.post("/api/flashcards/", json={"front": "F", "back": "B", "task_id": t["id"]})).json()
    assert (await client.delete(f"/api/flashcards/{m['id']}")).status_code == 204
    assert (await client.post("/api/flashcards/zzz/review", json={"rating": "good"})).status_code == 404


async def test_streak_logic(client, auth, fake_ai):
    async def do(date: str):
        t = await _mk(client, f"T{date}", "THEORY", prompt_context="p")
        r = await client.post(f"/api/focus/{t['id']}/evaluate", json={"user_submission": "notes", "time_spent_seconds": 600}, headers={"X-Client-Date": date})
        assert r.status_code == 200, r.text
        return r.json()["streak_count"]
    assert await do("2026-10-19") == 1
    assert await do("2026-10-20") == 2
    assert await do("2026-10-21") == 3
    assert await do("2026-10-21") == 3
    assert await do("2026-10-25") == 1  # gap resets
    s = (await client.get("/api/schedule/today", headers={"X-Client-Date": "2026-11-30"})).json()
    assert s["streak_count"] == 0  # displayed streak is broken when you've missed days


async def test_demo_and_health_and_ai_status(client, fake_ai, monkeypatch):
    r = await client.post("/api/auth/demo")
    assert r.status_code == 200
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    s = (await client.get("/api/schedule/today", headers=h)).json()
    assert s["total_count"] == 5 and s["completed_count"] == 1 and s["streak_count"] == 14
    assert any(t["test_cases"] for t in s["tasks"])
    hm = (await client.get("/api/metrics/heatmap", headers=h)).json()
    assert hm["active_days"] > 30
    st = (await client.get("/api/metrics/stats", headers=h)).json()
    assert st["total_focus_minutes"] > 1000
    for mode in ("CODE", "PROSE", "THEORY", "SPEECH"):
        p = (await client.get(f"/api/metrics/performance?mode={mode}", headers=h)).json()
        assert p["attempts"] > 0
    assert (await client.get("/api/flashcards/?due=true", headers=h)).json()
    # idempotent on the same day
    r2 = await client.post("/api/auth/demo")
    assert (await client.get("/api/schedule/today", headers={"Authorization": f"Bearer {r2.json()['access_token']}"})).json()["total_count"] == 5
    assert (await client.get("/api/system/health")).json()["status"] == "ok"
    # demo account can't be deleted
    assert (await client.post("/api/auth/delete-account", json={"password": "x"}, headers=h)).status_code == 400


async def test_delete_account(client, auth, fake_ai):
    await _mk(client, "x")
    r = await client.post("/api/auth/delete-account", json={"password": "wrong"})
    assert r.status_code == 400
    r = await client.post("/api/auth/delete-account", json={"password": "supersecret1"})
    assert r.status_code == 204
    assert (await client.get("/api/auth/me")).status_code == 401


async def test_langgraph_repair_loop(client, auth, fake_ai):
    """Empty/invalid first reply → graph re-prompts with the error → good second reply is used."""
    t = await _mk(client, "Theory", "THEORY", prompt_context="p")
    good = {"score": 77, "comprehension_score": 77, "verdict": "ok", "feedback_bullets": ["x"], "flashcards": []}
    fake_ai.sequence = [{"score": 0}, good]
    r = await client.post(f"/api/focus/{t['id']}/evaluate", json={"user_submission": "notes", "time_spent_seconds": 300})
    assert r.status_code == 200 and r.json()["entry"]["score"] == 77
    assert len(fake_ai.calls) == 2 and "rejected" in fake_ai.calls[1][1]
    # invalid JSON error from the client is also repaired
    t2 = await _mk(client, "Theory2", "THEORY", prompt_context="p")
    fake_ai.calls.clear()
    fake_ai.sequence = [AIServiceError("bad json", 502, "ai_invalid_json"), good]
    r = await client.post(f"/api/focus/{t2['id']}/evaluate", json={"user_submission": "notes", "time_spent_seconds": 300})
    assert r.status_code == 200 and len(fake_ai.calls) == 2
    # two bad replies in a row → 502 and nothing saved
    t3 = await _mk(client, "Theory3", "THEORY", prompt_context="p")
    fake_ai.sequence = [{"score": 0}, {"score": 0}]
    r = await client.post(f"/api/focus/{t3['id']}/evaluate", json={"user_submission": "notes", "time_spent_seconds": 300})
    assert r.status_code == 502 and r.json()["code"] == "ai_empty"
    assert (await client.get(f"/api/focus/{t3['id']}")).json()["status"] == "pending"
    # network/auth errors fail fast (no repair loop)
    fake_ai.calls.clear()
    fake_ai.sequence = [AIServiceError("key", 503, "ai_auth"), good]
    r = await client.post(f"/api/focus/{t3['id']}/evaluate", json={"user_submission": "notes", "time_spent_seconds": 300})
    assert r.status_code == 503 and len(fake_ai.calls) == 1
