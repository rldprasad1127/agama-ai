from __future__ import annotations

import httpx
import pytest

from app.core.config import Settings
from app.core.errors import AIServiceError
from app.models.journal import CodeMetrics, SpeechMetrics
from app.services import text_metrics as tm
from app.services.ollama_client import OllamaClient, extract_json


def test_extract_json_variants():
    assert extract_json('{"a": 1}') == {"a": 1}
    assert extract_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert extract_json('Sure! Here it is:\n{"a": {"b": 2}}\nHope that helps') == {"a": {"b": 2}}
    for bad in ("", "no json", "[1,2]"):
        with pytest.raises(ValueError):
            extract_json(bad)


def test_metrics_are_lenient():
    m = CodeMetrics.model_validate({"mode": "CODE", "logic_status": "passed", "score": "88.6", "feedback_bullets": "one", "insights": [{"kind": "good", "title": "t"}, "junk"], "time_complexity": None})
    assert m.logic_status == "PASS" and m.score == 89 and m.feedback_bullets == ["one"] and m.insights[0].kind == "strength" and m.time_complexity == "unknown"
    assert CodeMetrics.model_validate({"mode": "CODE", "score": 400}).score == 100
    s = SpeechMetrics.model_validate({"mode": "SPEECH", "fluency_score": -5})
    assert s.fluency_score == 0


def test_text_metrics():
    assert tm.word_count("Hello **world**, it's `code` fine.") == 4
    g, e = tm.readability("The cat sat on the mat. " * 5)
    assert g is not None and g < 3 and e > 90
    assert tm.readability("too short") == (None, None)
    assert tm.wpm(150, 60) == 150 and tm.wpm(10, 0) == 0
    assert tm.filler_counts("Um, so basically you know it is, uh, basically fine") == [("basically", 2), ("uh", 1), ("um", 1), ("you know", 1)]


def _client(handler, **kw):
    s = Settings(ollama_base_url="https://ollama.com", ollama_api_key=kw.get("key", "k123"), ollama_model="gpt-oss:120b")
    http = httpx.AsyncClient(base_url=s.ollama_base_url, transport=httpx.MockTransport(handler))
    return OllamaClient(s, http)


async def test_ollama_request_shape_and_parse():
    seen = {}

    def handler(req: httpx.Request) -> httpx.Response:
        import json
        seen["url"], seen["auth"], seen["body"] = str(req.url), req.headers.get("authorization"), json.loads(req.content)
        return httpx.Response(200, json={"message": {"role": "assistant", "content": '```json\n{"ok": true}\n```'}})

    c = _client(handler)
    assert await c.chat_json("sys", "usr") == {"ok": True}
    assert seen["url"] == "https://ollama.com/api/chat" and seen["auth"] == "Bearer k123"
    b = seen["body"]
    assert b["model"] == "gpt-oss:120b" and b["stream"] is False and b["format"] == "json"
    assert [m["role"] for m in b["messages"]] == ["system", "user"]


async def test_ollama_retry_on_bad_json_then_fail():
    n = {"c": 0}

    def handler(req):
        n["c"] += 1
        return httpx.Response(200, json={"message": {"content": "not json"}})

    with pytest.raises(AIServiceError) as ei:
        await _client(handler).chat_json("s", "u")
    assert n["c"] == 2 and ei.value.code == "ai_invalid_json"


@pytest.mark.parametrize("status,code", [(401, "ai_auth"), (403, "ai_auth"), (404, "ai_model_missing"), (429, "ai_rate_limited"), (500, "ai_http_error")])
async def test_ollama_http_errors(status, code):
    with pytest.raises(AIServiceError) as ei:
        await _client(lambda r: httpx.Response(status, text="x")).chat("s", "u")
    assert ei.value.code == code


async def test_ollama_missing_key_and_unreachable():
    with pytest.raises(AIServiceError) as ei:
        await _client(lambda r: httpx.Response(200), key="").chat("s", "u")
    assert ei.value.code == "ai_not_configured" and ei.value.status_code == 503

    def boom(req):
        raise httpx.ConnectError("nope")

    with pytest.raises(AIServiceError) as ei:
        await _client(boom).chat("s", "u")
    assert ei.value.code == "ai_unreachable"

    def slow(req):
        raise httpx.ReadTimeout("slow")

    with pytest.raises(AIServiceError) as ei:
        await _client(slow).chat("s", "u")
    assert ei.value.code == "ai_timeout"


async def test_ollama_status():
    c = _client(lambda r: httpx.Response(200, json={"models": [{"name": "b"}, {"name": "a"}]}))
    st = await c.status()
    assert st["reachable"] and st["models"] == ["a", "b"]
    st = await _client(lambda r: httpx.Response(401), key="x").status()
    assert not st["reachable"] and "rejected" in st["error"]
