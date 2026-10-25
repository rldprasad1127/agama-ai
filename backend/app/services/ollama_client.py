"""Thin async client for Ollama (cloud or local) using the ``/api/chat`` endpoint.

Ollama Cloud:   base_url=https://ollama.com   + ``Authorization: Bearer <API key>``
Local Ollama:   base_url=http://localhost:11434 (no key required)
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Optional

import httpx

from app.core.config import Settings, get_settings
from app.core.errors import AIServiceError

log = logging.getLogger("agama.ollama")

_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


def extract_json(text: str) -> dict[str, Any]:
    """Parse a JSON object out of an LLM reply (tolerates code fences / chatter)."""
    if not text or not text.strip():
        raise ValueError("empty response")
    s = _FENCE.sub("", text.strip()).strip()
    try:
        data = json.loads(s)
    except json.JSONDecodeError:
        start, end = s.find("{"), s.rfind("}")
        if start == -1 or end <= start:
            raise ValueError("no JSON object found")
        data = json.loads(s[start : end + 1])
    if not isinstance(data, dict):
        raise ValueError("JSON root is not an object")
    return data


class OllamaClient:
    def __init__(self, settings: Optional[Settings] = None, client: Optional[httpx.AsyncClient] = None):
        self.s = settings or get_settings()
        self._client = client
        self._owns_client = client is None

    # -- lifecycle -------------------------------------------------------
    async def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.s.ollama_base_url,
                timeout=httpx.Timeout(self.s.ollama_timeout_seconds, connect=15.0),
            )
        return self._client

    async def aclose(self) -> None:
        if self._client is not None and self._owns_client:
            await self._client.aclose()
            self._client = None

    def _headers(self) -> dict[str, str]:
        h = {"Content-Type": "application/json"}
        if self.s.ollama_api_key:
            h["Authorization"] = f"Bearer {self.s.ollama_api_key}"
        return h

    @property
    def is_cloud(self) -> bool:
        return "ollama.com" in self.s.ollama_base_url

    def _check_configured(self) -> None:
        if self.is_cloud and not self.s.ollama_api_key:
            raise AIServiceError(
                "OLLAMA_API_KEY is not set on the server. Add your Ollama Cloud key to backend/.env.",
                status_code=503,
                code="ai_not_configured",
            )

    # -- chat ------------------------------------------------------------
    async def chat(
        self,
        system: str,
        user: str,
        *,
        model: Optional[str] = None,
        json_mode: bool = True,
        temperature: float = 0.2,
    ) -> str:
        self._check_configured()
        payload: dict[str, Any] = {
            "model": model or self.s.ollama_model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "stream": False,
            "options": {"temperature": temperature},
        }
        if json_mode:
            payload["format"] = "json"
        client = await self._http()
        try:
            resp = await client.post("/api/chat", json=payload, headers=self._headers())
        except httpx.TimeoutException as e:
            raise AIServiceError("The AI model timed out. Try again in a moment.", 504, "ai_timeout") from e
        except httpx.HTTPError as e:
            raise AIServiceError(
                f"Could not reach Ollama at {self.s.ollama_base_url}: {e.__class__.__name__}", 503, "ai_unreachable"
            ) from e

        if resp.status_code == 401 or resp.status_code == 403:
            raise AIServiceError("Ollama rejected the API key (401/403). Check OLLAMA_API_KEY.", 503, "ai_auth")
        if resp.status_code == 404:
            raise AIServiceError(
                f"Model '{payload['model']}' was not found on the Ollama server.", 503, "ai_model_missing"
            )
        if resp.status_code == 429:
            raise AIServiceError("Ollama rate limit reached. Please wait and retry.", 429, "ai_rate_limited")
        if resp.status_code >= 400:
            detail = resp.text[:300]
            raise AIServiceError(f"Ollama returned HTTP {resp.status_code}: {detail}", 502, "ai_http_error")

        try:
            body = resp.json()
            content = (body.get("message") or {}).get("content") or body.get("response") or ""
        except ValueError as e:
            raise AIServiceError("Ollama returned a non-JSON HTTP body.", 502, "ai_bad_response") from e
        return content

    async def chat_json(
        self,
        system: str,
        user: str,
        *,
        model: Optional[str] = None,
        temperature: float = 0.2,
        retries: int = 1,
    ) -> dict[str, Any]:
        """Chat and parse JSON, re-asking once with a repair instruction on failure."""
        last_err = "unknown"
        prompt = user
        for attempt in range(retries + 1):
            text = await self.chat(system, prompt, model=model, json_mode=True, temperature=temperature)
            try:
                return extract_json(text)
            except (ValueError, json.JSONDecodeError) as e:
                last_err = str(e)
                log.warning("Ollama JSON parse failed (attempt %s): %s", attempt + 1, last_err)
                prompt = (
                    user
                    + "\n\nYour previous reply was not valid JSON. Reply again with ONLY one valid JSON object "
                    "and nothing else (no markdown, no commentary)."
                )
        raise AIServiceError(f"The AI returned invalid JSON ({last_err}).", 502, "ai_invalid_json")

    # -- diagnostics -----------------------------------------------------
    async def status(self, model: Optional[str] = None) -> dict[str, Any]:
        info: dict[str, Any] = {
            "base_url": self.s.ollama_base_url,
            "model": model or self.s.ollama_model,
            "configured": bool(self.s.ollama_api_key) or not self.is_cloud,
            "is_cloud": self.is_cloud,
            "reachable": False,
            "models": [],
            "error": None,
        }
        if not info["configured"]:
            info["error"] = "OLLAMA_API_KEY is not set."
            return info
        client = await self._http()
        try:
            r = await client.get("/api/tags", headers=self._headers())
            if r.status_code in (401, 403):
                info["error"] = "API key rejected."
            elif r.status_code >= 400:
                info["error"] = f"HTTP {r.status_code}"
            else:
                info["reachable"] = True
                info["models"] = sorted(m.get("name") or m.get("model") for m in r.json().get("models", []))
        except httpx.HTTPError as e:
            info["error"] = f"{e.__class__.__name__}: unreachable"
        return info


_client: Optional[OllamaClient] = None


def get_ollama() -> OllamaClient:
    global _client
    if _client is None:
        _client = OllamaClient()
    return _client


async def close_ollama() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
