"""Request/response models for /api/plans."""
from __future__ import annotations

import datetime as dt
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class OutlineExercise(BaseModel):
    title: str = Field(max_length=120)
    difficulty: Literal["Easy", "Medium", "Hard"] = "Medium"


class OutlineTopic(BaseModel):
    name: str = Field(max_length=80)
    theory: str = Field(default="", max_length=600)
    exercises: list[OutlineExercise] = Field(default_factory=list, max_length=6)


class OutlineIn(BaseModel):
    subject: str = Field(min_length=2, max_length=60)
    level: Literal["beginner", "intermediate", "advanced"] = "beginner"
    goal: str = Field(default="", max_length=200)          # e.g. "build dashboards for my job"
    known: str = Field(default="", max_length=200)         # what the learner already knows


class OutlineOut(BaseModel):
    subject: str
    summary: str
    topics: list[OutlineTopic]
    left_out: list[str] = Field(default_factory=list)      # topics dropped because the AI went over the limit
    reviewed: bool = False


class PlanCreate(BaseModel):
    track: Literal["DSA", "SUBJECT", "INTERVIEW", "ENGLISH"] = "DSA"
    subject: str = Field(default="", max_length=40)         # SUBJECT: catalog key, or "custom"
    custom_name: str = Field(default="", max_length=60)     # SUBJECT + custom
    custom_topics: list[OutlineTopic] = Field(default_factory=list, max_length=12)
    mode: Literal["LEARN", "PRACTICE"] = "LEARN"
    days: int = Field(default=30, ge=3, le=120)
    minutes_per_day: int = Field(default=60, ge=15, le=240)
    level: Literal["beginner", "intermediate", "advanced"] = "beginner"
    difficulty: Literal["easy", "medium", "hard", "mixed", "adaptive"] = "adaptive"
    topics: list[str] = Field(default_factory=list, max_length=30)
    known_topics: list[str] = Field(default_factory=list, max_length=30)
    weak_topics: list[str] = Field(default_factory=list, max_length=30)
    language: str = "python"
    skip_weekends: bool = False
    start_date: Optional[dt.date] = None
    # INTERVIEW
    role: str = Field(default="", max_length=80)
    experience: Literal["fresher", "junior", "senior"] = "fresher"
    company_type: str = Field(default="", max_length=60)
    # ENGLISH
    cefr: Literal["A1", "A2", "B1", "B2", "C1"] = "B1"
    focus_topics: list[str] = Field(default_factory=list, max_length=20)


class PreviewBlock(BaseModel):
    title: str
    mode: str
    minutes: int
    phase: str


class PreviewDay(BaseModel):
    day: int
    date: dt.date
    blocks: list[PreviewBlock]


class PlanPreview(BaseModel):
    title: str
    track: str
    mode: str
    days: int
    minutes_per_day: int
    start_date: dt.date
    end_date: dt.date
    topics: list[dict[str, Any]]
    trimmed_topics: list[str]
    total_blocks: int
    total_minutes: int
    by_phase: dict[str, int]
    sample_days: list[PreviewDay]
    other_minutes_per_day: int = 0        # daily minutes of the user's other active plans
    combined_minutes_per_day: int = 0
    over_budget: bool = False             # combined load is above a sustainable daily amount


class PlanTopicOut(BaseModel):
    key: str
    name: str
    first_day: int
    last_day: int
    blocks_total: int
    blocks_done: int
    mastery: Optional[int] = None
    help_requests: int = 0
    status: Literal["done", "current", "upcoming"]


class PlanOut(BaseModel):
    id: str
    title: str
    track: str
    mode: str
    level: str
    days: int
    minutes_per_day: int
    start_date: dt.date
    end_date: dt.date
    difficulty: str
    language: str
    status: str
    subject: str = "dsa"
    subject_name: str = ""
    icon: str = "school"
    color: int = 0
    custom: bool = False
    skip_weekends: bool
    day_index: int                  # today's 1-based day in the plan (0 = not started, >days = past the end)
    days_left: int
    blocks_total: int
    blocks_done: int
    minutes_total: int
    minutes_done: int
    progress_pct: int
    missed_count: int
    missed_minutes: int
    today_count: int
    next_task_id: Optional[str] = None
    topics: list[PlanTopicOut]
    trimmed_topics: list[str]
    rebalanced_count: int
    config: dict[str, Any]


class PlanBlockOut(BaseModel):
    id: str
    title: str
    mode: str
    phase: str
    minutes: int
    status: str
    topic_key: Optional[str] = None
    difficulty: Optional[str] = None
    score: Optional[int] = None
    missed: bool = False
    practice_kind: Optional[str] = None


class PlanDayOut(BaseModel):
    day: int
    date: dt.date
    is_today: bool
    blocks: list[PlanBlockOut]


class RebalanceIn(BaseModel):
    extend_days: int = Field(default=0, ge=0, le=60)


class RebalanceOut(BaseModel):
    moved: int
    dropped: list[str]
    new_end_date: dt.date
    plan: PlanOut


class PlacementQuestion(BaseModel):
    id: str
    topic: str
    topic_name: str
    prompt: str
    options: list[str]


class PlacementIn(BaseModel):
    answers: dict[str, int]


class PlacementOut(BaseModel):
    score: int
    total: int
    level: Literal["beginner", "intermediate", "advanced"]
    known_topics: list[str]
    weak_topics: list[str]
    suggested_mode: Literal["LEARN", "PRACTICE"]
    by_topic: dict[str, bool]
