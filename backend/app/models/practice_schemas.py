"""Request/response models for /api/practice."""
from __future__ import annotations

import datetime as dt
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class SessionCreate(BaseModel):
    kind: Literal["INTERVIEW", "ENGLISH"]
    task_id: Optional[str] = None                 # start the session that belongs to a scheduled plan block
    # INTERVIEW
    role: str = Field(default="Software Engineer", max_length=80)
    round: Literal["hr", "behavioral", "technical", "mixed"] = "mixed"
    experience: Literal["fresher", "junior", "senior"] = "fresher"
    company_type: str = Field(default="", max_length=60)
    # ENGLISH
    cefr: Literal["A1", "A2", "B1", "B2", "C1"] = "B1"
    topic: str = Field(default="Introduce yourself", max_length=120)
    style: str = Field(default="answer everyday questions", max_length=80)
    num_questions: int = Field(default=5, ge=2, le=12)
    instant_feedback: Optional[bool] = None       # default: English yes, Interview no (realistic)


class AnswerIn(BaseModel):
    answer: str = Field(default="", max_length=8000)
    duration_seconds: float = Field(default=0, ge=0, le=3600)
    speaking_seconds: Optional[float] = Field(default=None, ge=0, le=3600)
    skip: bool = False


class FeedbackOut(BaseModel):
    score: int
    strengths: list[str]
    improvements: list[str]
    better_answer: str
    grammar_fixes: list[dict[str, str]]
    new_vocabulary: list[str]


class TurnOut(BaseModel):
    index: int
    kind: str
    question: str
    answer: Optional[str] = None
    words: int = 0
    wpm: int = 0
    fillers: list[dict[str, Any]] = Field(default_factory=list)
    feedback: Optional[FeedbackOut] = None
    rubric: Optional[str] = None                  # only after the session is completed


class SessionOut(BaseModel):
    id: str
    kind: str
    task_id: Optional[str]
    config: dict[str, Any]
    status: str
    instant_feedback: bool
    turns: list[TurnOut]
    current_index: Optional[int]
    answered: int
    total: int
    score: int
    xp_earned: int
    report: Optional[dict[str, Any]] = None
    created_at: dt.datetime
    completed_at: Optional[dt.datetime] = None


class AnswerOut(BaseModel):
    session: SessionOut
    feedback: Optional[FeedbackOut] = None         # present only with instant feedback
    done: bool


class FinishOut(BaseModel):
    session: SessionOut
    streak_count: int
    total_xp: int


class MistakeOut(BaseModel):
    id: str
    wrong: str
    right: str
    rule: str
    times: int
    last_seen: dt.date
    mastered: bool


class MistakeUpdate(BaseModel):
    mastered: bool
