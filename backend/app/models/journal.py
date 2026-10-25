"""JournalEntry — completed work plus the AI review.

``metrics`` is a Pydantic V2 *discriminated union* keyed on ``mode`` so a single
MongoDB collection stores four differently-shaped evaluation matrices.
"""
from __future__ import annotations

import datetime as dt
from typing import Annotated, Literal, Optional, Union

from beanie import Document, PydanticObjectId
from pydantic import BaseModel, ConfigDict, Field, field_validator
from pymongo import DESCENDING, IndexModel

from app.models.enums import TaskMode


def _clamp_int(v: object, lo: int = 0, hi: int = 100) -> int:
    try:
        n = int(round(float(v)))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        n = 0
    return max(lo, min(hi, n))


def _str_list(v: object) -> list[str]:
    if v is None:
        return []
    if isinstance(v, str):
        return [v] if v.strip() else []
    if isinstance(v, (list, tuple)):
        out: list[str] = []
        for x in v:
            if isinstance(x, str):
                out.append(x)
            elif isinstance(x, dict):  # tolerate {"title":..,"detail":..}
                out.append(" — ".join(str(y) for y in x.values() if y))
            elif x is not None:
                out.append(str(x))
        return [s for s in out if s.strip()]
    return [str(v)]


class Insight(BaseModel):
    """A single structured finding shown in the "Diagnostic Analysis" panel."""

    model_config = ConfigDict(extra="ignore")

    kind: Literal["strength", "warning", "tip"] = "tip"
    title: str = ""
    detail: str = ""

    @field_validator("kind", mode="before")
    @classmethod
    def _kind(cls, v: object) -> str:
        s = str(v or "tip").lower()
        if s in ("strength", "positive", "good", "success", "pass"):
            return "strength"
        if s in ("warning", "issue", "problem", "negative", "fail", "weakness"):
            return "warning"
        return "tip"


class _MetricsBase(BaseModel):
    """Fields shared by every metrics schema."""

    model_config = ConfigDict(extra="ignore")

    score: int = 0                                   # 0-100 overall
    verdict: str = ""                                # headline, e.g. "Algorithmic Contract Passed"
    feedback_bullets: list[str] = Field(default_factory=list)
    insights: list[Insight] = Field(default_factory=list)
    takeaway: str = ""                               # "Actionable takeaway"

    @field_validator("score", mode="before")
    @classmethod
    def _score(cls, v: object) -> int:
        return _clamp_int(v)

    @field_validator("feedback_bullets", mode="before")
    @classmethod
    def _bullets(cls, v: object) -> list[str]:
        return _str_list(v)

    @field_validator("insights", mode="before")
    @classmethod
    def _insights(cls, v: object) -> object:
        if v is None:
            return []
        if isinstance(v, list):
            return [x for x in v if isinstance(x, (dict, Insight))]
        return []


class CodeMetrics(_MetricsBase):
    mode: Literal["CODE"] = "CODE"
    logic_status: Literal["PASS", "PARTIAL", "FAIL"] = "PARTIAL"
    time_complexity: str = "unknown"
    space_complexity: str = "unknown"
    target_time_complexity: str = ""
    target_space_complexity: str = ""
    tests_passed: Optional[int] = None               # filled by the backend runner, not the LLM
    tests_total: Optional[int] = None

    @field_validator("logic_status", mode="before")
    @classmethod
    def _logic(cls, v: object) -> str:
        s = str(v or "PARTIAL").upper().strip()
        if s in ("PASS", "PASSED", "OK", "CORRECT"):
            return "PASS"
        if s in ("FAIL", "FAILED", "INCORRECT", "WRONG"):
            return "FAIL"
        return "PARTIAL"

    @field_validator("time_complexity", "space_complexity", mode="before")
    @classmethod
    def _cx(cls, v: object) -> str:
        return str(v).strip() if v not in (None, "") else "unknown"


class ProseMetrics(_MetricsBase):
    mode: Literal["PROSE"] = "PROSE"
    tone: str = ""
    pacing: str = ""
    voice_texture: str = ""
    word_count: int = 0                              # deterministic (backend)
    readability_grade: Optional[float] = None        # Flesch-Kincaid grade (backend)
    flesch_reading_ease: Optional[float] = None      # (backend)
    technical_accuracy: int = 0
    narrative_pacing: int = 0
    word_target_min: Optional[int] = None
    word_target_max: Optional[int] = None

    @field_validator("technical_accuracy", "narrative_pacing", mode="before")
    @classmethod
    def _sub(cls, v: object) -> int:
        return _clamp_int(v)

    @field_validator("tone", "pacing", "voice_texture", mode="before")
    @classmethod
    def _txt(cls, v: object) -> str:
        return "" if v is None else str(v)


class FlashcardDraft(BaseModel):
    model_config = ConfigDict(extra="ignore")
    front: str
    back: str
    topic: str = ""


class TheoryMetrics(_MetricsBase):
    mode: Literal["THEORY"] = "THEORY"
    comprehension_score: int = 0
    missed_concepts: list[str] = Field(default_factory=list)
    captured_concepts: list[str] = Field(default_factory=list)
    flashcards: list[FlashcardDraft] = Field(default_factory=list)
    next_review_days: int = 4

    @field_validator("comprehension_score", mode="before")
    @classmethod
    def _cs(cls, v: object) -> int:
        return _clamp_int(v)

    @field_validator("missed_concepts", "captured_concepts", mode="before")
    @classmethod
    def _cl(cls, v: object) -> list[str]:
        return _str_list(v)

    @field_validator("flashcards", mode="before")
    @classmethod
    def _fc(cls, v: object) -> object:
        if not isinstance(v, list):
            return []
        return [x for x in v if isinstance(x, dict) and x.get("front") and x.get("back")]

    @field_validator("next_review_days", mode="before")
    @classmethod
    def _nr(cls, v: object) -> int:
        return _clamp_int(v, 1, 60) or 4


class FillerCount(BaseModel):
    word: str
    count: int


class SpeechMetrics(_MetricsBase):
    mode: Literal["SPEECH"] = "SPEECH"
    wpm: int = 0                                     # deterministic (backend)
    target_wpm: int = 135
    filler_words: list[FillerCount] = Field(default_factory=list)   # deterministic (backend)
    filler_total: int = 0
    fluency_score: int = 0
    clarity_score: int = 0
    fluency_grade: str = ""
    speaking_ratio: Optional[float] = None           # 0-1, share of time actually speaking
    duration_seconds: int = 0

    @field_validator("fluency_score", "clarity_score", mode="before")
    @classmethod
    def _sub(cls, v: object) -> int:
        return _clamp_int(v)


Metrics = Annotated[
    Union[CodeMetrics, ProseMetrics, TheoryMetrics, SpeechMetrics],
    Field(discriminator="mode"),
]


class JournalEntry(Document):
    user_id: PydanticObjectId
    task_id: PydanticObjectId
    task_title: str
    task_mode: TaskMode
    category: str = ""
    language: Optional[str] = None
    date: dt.date
    time_spent_seconds: int = 0
    planned_minutes: int = 0
    user_submission: str = ""                        # raw text / code / transcript
    notes: str = ""                                  # freeform notes (theory)
    hints_used: int = 0
    metrics: Metrics
    score: int = 0                                   # denormalised from metrics.score for fast sorting
    xp_earned: int = 0
    ai_model: str = ""
    submission_sha: str = ""                         # sha256 of the submission
    run_output: Optional[str] = None                 # last code run output (CODE)
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))

    class Settings:
        name = "journal_entries"
        indexes = [
            IndexModel([("user_id", 1), ("date", DESCENDING)]),
            IndexModel([("user_id", 1), ("task_mode", 1), ("date", DESCENDING)]),
            IndexModel([("user_id", 1), ("task_id", 1)]),
        ]
