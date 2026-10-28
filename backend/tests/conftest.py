"""Test harness: real MongoDB wire protocol (mongod / FerretDB) + a fake Ollama."""
from __future__ import annotations

import os
from typing import Any

import httpx
import pytest
import pytest_asyncio
from motor.motor_asyncio import AsyncIOMotorClient

os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("OLLAMA_API_KEY", "test-key")

from app.core import db as dbmod  # noqa: E402
from app.main import create_app  # noqa: E402
from app.services import ai_evaluator  # noqa: E402

MONGO_URL = os.environ.get("TEST_MONGODB_URL", "mongodb://127.0.0.1:27017")
TEST_DB = "agama_test"


class FakeOllama:
    """Returns canned JSON per persona so the whole flow runs offline."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []
        self.fail_with: Exception | None = None
        self.override: dict[str, Any] | None = None
        self.sequence: list[Any] = []   # popped first; Exceptions are raised
        self.understood = True
        self.follow_up = False

    async def chat_json(self, system: str, user: str, **kw: Any) -> dict[str, Any]:
        self.calls.append((system, user))
        if self.fail_with:
            raise self.fail_with
        if self.sequence:
            nxt = self.sequence.pop(0)
            if isinstance(nxt, Exception):
                raise nxt
            return nxt
        if self.override is not None:
            return self.override
        import re
        if "study roadmap" in system:
            if "<subject>malware" in user:
                return {"refused": True, "reason": "harmful"}
            return {"summary": "Build dashboards.", "topics": [
                {"name": f"Topic {i}", "theory": f"Learn idea {i}.", "exercises": [{"title": f"Exercise {i}.{j}", "difficulty": "Easy"} for j in range(1, 4)]}
                for i in range(1, 7)]}
        if "patient, encouraging tutor" in system:
            return {"text": "Think of it like a queue at a shop: first in, first out."}
        if "answering a learner's question" in system:
            return {"answer": "Because it keeps the items in order."}
        if "comprehension question" in system:
            return {"question": "Why does a queue serve people in order?", "key_points": ["first in", "first out"]}
        if "gently grade" in system:
            return {"understood": self.understood, "feedback": "Good effort.", "reexplain": "" if self.understood else "Imagine a line at a bus stop."}
        if "coding mentor" in system:
            return {"hint": "Consider using a hash map."}
        if "seasoned interviewer" in system or "warm English speaking coach" in system:
            n = int(re.search(r"N = (\d+)", user).group(1))
            return {"questions": [{"question": f"Question number {i + 1}, please answer in detail?", "rubric": "point a; point b"} for i in range(n)]}
        if "evaluating ONE answer" in system or "English speaking coach for a" in system:
            fb = {"score": 80, "strengths": ["Clear"], "improvements": ["Add detail"], "better_answer": "A better way to say it.",
                  "grammar_fixes": [{"wrong": "I goed", "right": "I went", "rule": "irregular past tense"}] if "English" in system else [],
                  "new_vocabulary": ["moreover"], "follow_up": ""}
            if self.follow_up and "one short natural follow-up" in system:
                fb["follow_up"] = "Can you give a concrete example of that?"
            return fb
        if "final review of a practice session" in system:
            cats = ["grammar", "vocabulary", "fluency", "relevance"] if "grammar" in system else ["communication", "content", "structure", "confidence"]
            return {"overall_score": 78, "summary": "A solid session.", "category_scores": {c: 75 for c in cats},
                    "top_strengths": ["Clear voice", "Good pace", "On topic"], "top_improvements": ["More examples", "Fewer fillers", "Stronger close"],
                    "action_plan": ["Practise STAR daily", "Record yourself", "Read aloud"], "readiness": "Almost there", "cefr_estimate": "B1"}
        common = {"score": 86, "verdict": "Solid", "feedback_bullets": ["a", "b", "c"],
                  "insights": [{"kind": "strength", "title": "Good", "detail": "Detail"}, {"kind": "warning", "title": "Watch", "detail": "Detail2"}],
                  "takeaway": "Keep going."}
        if "Code Reviewer" in system:
            return {**common, "logic_status": "PASS", "time_complexity": "O(n)", "space_complexity": "O(k)"}
        if "Developmental Editor" in system:
            return {**common, "tone": "Conversational", "pacing": "Strong", "voice_texture": "Cinematic", "technical_accuracy": 90, "narrative_pacing": 80}
        if "Tutor" in system:
            return {**common, "comprehension_score": 82, "captured_concepts": ["A"], "missed_concepts": ["B"], "next_review_days": 4,
                    "flashcards": [{"front": "Why?", "back": "Because.", "topic": "T"}, {"front": "What?", "back": "That.", "topic": "T"}]}
        if "Speech Coach" in system:
            return {**common, "fluency_score": 88, "clarity_score": 90, "fluency_grade": "A-"}
        if "curriculum designer" in system:
            return {"description": "d", "difficulty": "Medium", "tags": ["x"], "prompt_context": "### Problem\nDo it.",
                    "constraints": ["c1"], "hints": ["h1", "h2"], "checklist": ["k1", "k2"],
                    "starter_code": "def f(x):\n    pass\n", "test_cases": [{"name": "t", "call": "f(2)", "expected": "4"}, {"name": "u", "call": "f(0)", "expected": "0"}, {"name": "v", "call": "f(-3)", "expected": "-6"}],
                    "reference_solution": "def f(x):\n    return x * 2\n",
                    "word_target_min": 100, "word_target_max": 200, "target_wpm": 130}
        if "flashcards" in system:
            return {"flashcards": [{"front": f"Q{i}", "back": f"A{i}", "topic": "Raft"} for i in range(5)]}
        raise AssertionError("unexpected prompt")


@pytest_asyncio.fixture
async def fake_ai():
    fake = FakeOllama()
    ai_evaluator._evaluator = ai_evaluator.AIEvaluator(fake)  # type: ignore[arg-type]
    yield fake
    ai_evaluator._evaluator = None


@pytest_asyncio.fixture
async def client(fake_ai):
    mongo = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    await mongo.drop_database(TEST_DB)
    await dbmod.init_db(mongo, TEST_DB)
    app = create_app()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test", headers={"X-Client-Date": "2026-10-21"}) as c:
        yield c
    await mongo.drop_database(TEST_DB)
    mongo.close()


@pytest_asyncio.fixture
async def auth(client):
    r = await client.post("/api/auth/register", json={"name": "Ram", "email": "Ram@Example.com", "password": "supersecret1"})
    assert r.status_code == 201, r.text
    tok = r.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {tok}"
    return r.json()["user"]
