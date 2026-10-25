"""Request/response models for /api/help."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

ExplainKind = Literal["simpler", "analogy", "example", "diagram", "why"]


class ExplainIn(BaseModel):
    task_id: str
    kind: ExplainKind
    passage: str = Field(default="", max_length=2000)


class HelpOut(BaseModel):
    text: str
    cached: bool = False
    remaining_today: int


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=1500)


class AskIn(BaseModel):
    task_id: str
    question: str = Field(min_length=2, max_length=800)
    history: list[ChatTurn] = Field(default_factory=list, max_length=8)


class CheckIn(BaseModel):
    task_id: str
    passage: str = Field(default="", max_length=2000)


class CheckOut(BaseModel):
    question: str
    key_points: list[str]
    remaining_today: int


class CheckAnswerIn(BaseModel):
    task_id: str
    question: str = Field(max_length=500)
    key_points: list[str] = Field(default_factory=list, max_length=8)
    answer: str = Field(min_length=1, max_length=2000)


class CheckAnswerOut(BaseModel):
    understood: bool
    feedback: str
    reexplain: str = ""
    remaining_today: int


class HintIn(BaseModel):
    task_id: str
    level: int = Field(ge=1, le=4)
    code: str = Field(default="", max_length=20000)
    run_output: str = Field(default="", max_length=4000)
    elapsed_seconds: int = Field(default=0, ge=0)
    failed_runs: int = Field(default=0, ge=0)
    confirm_solution: bool = False


class HintOut(BaseModel):
    level: int
    hint: str
    solution: Optional[str] = None
    remaining_today: int


class HintThreshold(BaseModel):
    level: int
    label: str
    seconds: int
    failed_runs: int


class HelpConfig(BaseModel):
    daily_limit: int
    remaining_today: int
    hints_enabled: bool
    thresholds: list[HintThreshold]
