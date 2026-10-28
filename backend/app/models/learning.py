"""Learning plans, shared AI caches, usage counters and speaking-practice sessions."""
from __future__ import annotations

import datetime as dt
from typing import Any, Optional

from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field
from pymongo import ASCENDING, DESCENDING, IndexModel


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


# ───────────────────────── learning plans ─────────────────────────
class PlanTopic(BaseModel):
    key: str
    name: str
    days: int = 1
    first_day: int = 1            # 1-based plan day on which the topic starts
    last_day: int = 1
    priority: int = 0             # 1 = keep first when the schedule is squeezed (0 = unknown)


class TopicStat(BaseModel):
    n: int = 0                    # evaluated blocks
    score_sum: int = 0
    help_requests: int = 0
    failed_checks: int = 0
    extras_added: int = 0
    high_streak: int = 0          # consecutive practice scores >= 90


class LearningPlan(Document):
    user_id: PydanticObjectId
    track: str = "DSA"                       # DSA | SUBJECT | INTERVIEW | ENGLISH
    subject: str = "dsa"                     # catalog key, "custom", "interview" or "english"
    subject_name: str = ""
    icon: str = "school"
    color: int = 0                           # index into the UI's plan colour palette
    custom: bool = False                     # AI-drafted syllabus (unreviewed)
    paused_at: Optional[dt.datetime] = None
    mode: str = "LEARN"                      # LEARN | PRACTICE
    title: str = ""
    level: str = "beginner"
    days: int = 30
    minutes_per_day: int = 60
    skip_weekends: bool = False
    start_date: dt.date
    end_date: dt.date
    difficulty: str = "mixed"                # easy | medium | hard | mixed | adaptive
    language: str = "python"
    topics: list[PlanTopic] = Field(default_factory=list)
    trimmed_topics: list[str] = Field(default_factory=list)   # topics left out because the time was too short
    config: dict[str, Any] = Field(default_factory=dict)      # track-specific options (role, topic, level…)
    topic_stats: dict[str, TopicStat] = Field(default_factory=dict)
    status: str = "active"                   # active | paused | completed | archived
    rebalanced_count: int = 0
    created_at: dt.datetime = Field(default_factory=_now)

    class Settings:
        name = "learning_plans"
        indexes = [IndexModel([("user_id", ASCENDING), ("status", ASCENDING)])]


# ───────────────────────── shared caches / counters ─────────────────────────
class ContentCache(Document):
    """AI-authored lesson / problem payloads shared by every learner who gets the same topic + level."""

    key: str
    payload: dict[str, Any]
    hits: int = 0
    created_at: dt.datetime = Field(default_factory=_now)

    class Settings:
        name = "content_cache"
        indexes = [IndexModel([("key", ASCENDING)], unique=True)]


class HelpCache(Document):
    """Cached explanations (simpler / analogy / example …) keyed by lesson-text hash."""

    key: str
    text: str
    hits: int = 0
    created_at: dt.datetime = Field(default_factory=_now)

    class Settings:
        name = "help_cache"
        indexes = [IndexModel([("key", ASCENDING)], unique=True)]


class AIUsage(Document):
    """Per-user daily counter of un-cached AI help calls (free-tier guard)."""

    user_id: PydanticObjectId
    date: dt.date
    calls: int = 0

    class Settings:
        name = "ai_usage"
        indexes = [IndexModel([("user_id", ASCENDING), ("date", ASCENDING)], unique=True)]


# ───────────────────────── speaking practice ─────────────────────────
class TurnFeedback(BaseModel):
    score: int = 0
    strengths: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)
    better_answer: str = ""
    grammar_fixes: list[dict[str, str]] = Field(default_factory=list)   # {wrong, right, rule}
    new_vocabulary: list[str] = Field(default_factory=list)


class Turn(BaseModel):
    index: int
    kind: str = "main"                       # main | followup
    question: str
    rubric: str = ""                         # what a strong answer covers (hidden from the learner)
    answer: Optional[str] = None
    duration_seconds: float = 0
    speaking_seconds: Optional[float] = None
    words: int = 0
    wpm: int = 0
    fillers: list[dict[str, Any]] = Field(default_factory=list)
    feedback: Optional[TurnFeedback] = None


class PracticeSession(Document):
    user_id: PydanticObjectId
    task_id: Optional[PydanticObjectId] = None
    kind: str                                # INTERVIEW | ENGLISH
    config: dict[str, Any] = Field(default_factory=dict)
    instant_feedback: bool = False
    num_questions: int = 5
    turns: list[Turn] = Field(default_factory=list)
    status: str = "active"                   # active | completed | abandoned
    report: Optional[dict[str, Any]] = None
    score: int = 0
    xp_earned: int = 0
    journal_id: Optional[PydanticObjectId] = None
    date: dt.date
    created_at: dt.datetime = Field(default_factory=_now)
    completed_at: Optional[dt.datetime] = None

    class Settings:
        name = "practice_sessions"
        indexes = [IndexModel([("user_id", ASCENDING), ("created_at", DESCENDING)])]


class MistakeNote(Document):
    """A recurring English mistake (wrong → right) and how often it was seen."""

    user_id: PydanticObjectId
    wrong: str
    right: str
    rule: str = ""
    times: int = 1
    last_seen: dt.date
    mastered: bool = False

    class Settings:
        name = "mistake_notes"
        indexes = [IndexModel([("user_id", ASCENDING), ("times", DESCENDING)])]
