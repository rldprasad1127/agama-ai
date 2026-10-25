"""LangGraph workflow shared by every AI task (evaluation, content generation, flashcards).

    ┌────────┐   ┌──────────┐  valid   ┌─────┐
    │ call   │──▶│ validate │─────────▶│ END │
    └────────┘   └──────────┘          └─────┘
        ▲             │ invalid & attempts left
        │        ┌────▼───┐              invalid & no attempts left
        └────────│ repair │              ┌────────┐
                 └────────┘     ───────▶ │  fail  │ → AIServiceError (HTTP 502)
                                         └────────┘

* ``call``     asks Ollama for a JSON object (network/auth errors propagate immediately).
* ``validate`` runs a task-specific parser (Pydantic schema + deterministic post-processing).
* ``repair``   re-prompts the model with the precise validation error, then loops.
"""
from __future__ import annotations

from typing import Any, Callable, Optional, TypedDict

from langgraph.graph import END, StateGraph

from app.core.errors import AIServiceError
from app.services.ollama_client import OllamaClient


class LLMState(TypedDict, total=False):
    system: str
    prompt: str
    base_prompt: str
    model: Optional[str]
    temperature: float
    attempts: int
    max_attempts: int
    data: Optional[dict[str, Any]]
    result: Any
    error: Optional[str]
    error_code: str


# A parser returns the final result or raises AIServiceError(code="ai_schema" | "ai_empty").
Parser = Callable[[dict[str, Any]], Any]


def build_graph(client_getter: Callable[[], OllamaClient], parser: Parser):
    async def call(state: LLMState) -> LLMState:
        try:
            data = await client_getter().chat_json(
                state["system"], state["prompt"], model=state.get("model"),
                temperature=state.get("temperature", 0.2), retries=0,
            )
            return {"data": data, "error": None}
        except AIServiceError as e:
            if e.code == "ai_invalid_json":   # recoverable → repair loop
                return {"data": None, "error": e.message, "error_code": e.code}
            raise                              # auth / network / rate-limit: fail fast

    async def validate(state: LLMState) -> LLMState:
        if state.get("data") is None:
            return {}  # `call` already recorded the error
        try:
            return {"result": parser(state["data"]), "error": None}
        except AIServiceError as e:
            return {"result": None, "error": e.message, "error_code": e.code}

    async def repair(state: LLMState) -> LLMState:
        n = state.get("attempts", 0) + 1
        return {
            "attempts": n,
            "temperature": min(0.7, state.get("temperature", 0.2) + 0.2),
            "prompt": state["base_prompt"]
            + f"\n\nYour previous reply was rejected: {state.get('error')}. "
            "Reply again with ONLY one valid JSON object that follows the required shape exactly, "
            "with real, non-empty content.",
        }

    async def fail(state: LLMState) -> LLMState:
        raise AIServiceError(state.get("error") or "The AI reply was unusable.", 502, state.get("error_code") or "ai_error")

    def route(state: LLMState) -> str:
        if state.get("result") is not None and not state.get("error"):
            return "done"
        return "repair" if state.get("attempts", 0) < state.get("max_attempts", 1) else "fail"

    g = StateGraph(LLMState)
    g.add_node("call", call)
    g.add_node("validate", validate)
    g.add_node("repair", repair)
    g.add_node("fail", fail)
    g.set_entry_point("call")
    g.add_edge("call", "validate")
    g.add_conditional_edges("validate", route, {"done": END, "repair": "repair", "fail": "fail"})
    g.add_edge("repair", "call")
    g.add_edge("fail", END)
    return g.compile()


async def run_graph(
    client_getter: Callable[[], OllamaClient], parser: Parser, *, system: str, prompt: str,
    model: Optional[str] = None, temperature: float = 0.2, max_repairs: int = 1,
) -> Any:
    graph = build_graph(client_getter, parser)
    final: LLMState = await graph.ainvoke({
        "system": system, "prompt": prompt, "base_prompt": prompt, "model": model, "temperature": temperature,
        "attempts": 0, "max_attempts": max_repairs, "data": None, "result": None, "error": None,
    })
    return final["result"]
