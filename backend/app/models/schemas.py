"""Request / response schemas (kept separate from the Beanie documents)."""
from __future__ import annotations

import datetime as dt
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.enums import TaskMode, TaskStatus
from app.models.flashcard import LEITNER_INTERVALS, Flashcard
from app.models.journal import JournalEntry, Metrics
from app.models.task import Draft, TaskBlock, TestCase
from app.models.user import User, UserPreferences


# ───────────────────────── auth ─────────────────────────
class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name is required")
        return v


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    created_at: dt.datetime
    streak_count: int
    longest_streak: int
    daily_target_minutes: int
    xp: int
    is_demo: bool
    onboarded: bool = False
    learner_level: Optional[str] = None
    goal: Optional[str] = None
    preferences: UserPreferences


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class PreferencesUpdate(BaseModel):
    day_start: Optional[str] = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    binaural_enabled: Optional[bool] = None
    default_language: Optional[str] = None
    ai_model: Optional[str] = None
    ai_hints: Optional[bool] = None
    theme: Optional[Literal["light", "dark", "system"]] = None


class UserUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    daily_target_minutes: Optional[int] = Field(default=None, ge=15, le=960)
    onboarded: Optional[bool] = None
    learner_level: Optional[Literal["beginner", "intermediate", "advanced"]] = None
    goal: Optional[Literal["dsa", "interview", "english", "explore"]] = None
    preferences: Optional[PreferencesUpdate] = None


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


# ───────────────────────── tasks ─────────────────────────
class TestCaseIO(BaseModel):
    __test__ = False
    name: str = ""
    call: str
    expected: str


class TaskContent(BaseModel):
    """Structured workspace content shared by create / update / AI generation."""

    prompt_context: str = ""
    constraints: list[str] = Field(default_factory=list)
    hints: list[str] = Field(default_factory=list)
    checklist: list[str] = Field(default_factory=list)
    starter_code: str = ""
    test_cases: list[TestCaseIO] = Field(default_factory=list)
    word_target_min: Optional[int] = None
    word_target_max: Optional[int] = None
    target_wpm: Optional[int] = None
    description: str = ""
    difficulty: Optional[str] = None
    tags: list[str] = Field(default_factory=list)


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    task_mode: TaskMode = TaskMode.CODE
    duration_minutes: int = Field(default=45, ge=5, le=480)
    date: Optional[dt.date] = None
    backlog: bool = False                        # True => create without a date
    category: str = ""
    language: Optional[str] = None
    prompt_context: str = ""
    description: str = ""
    difficulty: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    hints: list[str] = Field(default_factory=list)
    checklist: list[str] = Field(default_factory=list)
    starter_code: str = ""
    test_cases: list[TestCaseIO] = Field(default_factory=list)
    word_target_min: Optional[int] = None
    word_target_max: Optional[int] = None
    target_wpm: Optional[int] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    task_mode: Optional[TaskMode] = None
    duration_minutes: Optional[int] = Field(default=None, ge=5, le=480)
    date: Optional[dt.date] = None
    move_to_backlog: bool = False
    category: Optional[str] = None
    language: Optional[str] = None
    prompt_context: Optional[str] = None
    description: Optional[str] = None
    difficulty: Optional[str] = None
    tags: Optional[list[str]] = None
    constraints: Optional[list[str]] = None
    hints: Optional[list[str]] = None
    checklist: Optional[list[str]] = None
    starter_code: Optional[str] = None
    test_cases: Optional[list[TestCaseIO]] = None
    word_target_min: Optional[int] = None
    word_target_max: Optional[int] = None
    target_wpm: Optional[int] = None


class ReorderIn(BaseModel):
    task_ids: list[str] = Field(min_length=1)
    date: Optional[dt.date] = None


class StatusIn(BaseModel):
    status: TaskStatus


class GenerateIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    task_mode: TaskMode
    category: str = ""
    language: Optional[str] = None
    duration_minutes: int = 45
    instructions: str = ""                       # extra guidance from the user


class ShapeIn(BaseModel):
    minutes: Literal[15, 30, 60]
    date: Optional[dt.date] = None


class TaskOut(BaseModel):
    id: str
    date: Optional[dt.date]
    title: str
    duration_minutes: int
    order_index: int
    status: TaskStatus
    task_mode: TaskMode
    prompt_context: str
    category: str
    description: str
    language: Optional[str]
    difficulty: Optional[str]
    tags: list[str]
    constraints: list[str]
    hints: list[str]
    checklist: list[str]
    starter_code: str
    test_cases: list[TestCaseIO]
    word_target_min: Optional[int]
    word_target_max: Optional[int]
    target_wpm: Optional[int]
    draft: Optional[Draft]
    time_spent_seconds: int
    completed_at: Optional[dt.datetime]
    journal_id: Optional[str]
    content_ready: bool
    plan_id: Optional[str] = None
    topic_key: Optional[str] = None
    phase: Optional[str] = None
    plan_day: Optional[int] = None
    plan_name: Optional[str] = None       # filled on the daily schedule so blocks of different plans can be told apart
    plan_color: Optional[int] = None
    hint_level_used: int = 0
    practice_kind: Optional[str] = None
    practice_config: dict = Field(default_factory=dict)
    start_time: Optional[str] = None             # HH:MM, computed from the day's order
    end_time: Optional[str] = None


class ScheduleOut(BaseModel):
    date: dt.date
    tasks: list[TaskOut]
    total_planned_minutes: int
    completed_minutes: int
    remaining_minutes: int
    completed_count: int
    total_count: int
    progress_pct: int
    daily_target_minutes: int
    streak_count: int
    next_task_id: Optional[str]
    mode_minutes: dict[str, int]


class PresetBlock(BaseModel):
    title: str
    task_mode: TaskMode
    duration_minutes: int
    category: str = ""


class PresetOut(BaseModel):
    key: str
    name: str
    subtitle: str
    total_minutes: int
    blocks: list[PresetBlock]


# ───────────────────────── focus ─────────────────────────
class DraftIn(BaseModel):
    content: str = ""
    notes: str = ""
    checklist_done: list[int] = Field(default_factory=list)
    hints_used: int = 0
    elapsed_seconds: int = 0


class RunIn(BaseModel):
    code: str = Field(max_length=200_000)
    language: Optional[str] = None
    stdin: str = Field(default="", max_length=100_000)
    run_tests: bool = True


class TestResult(BaseModel):
    __test__ = False
    name: str
    call: str
    expected: str
    actual: Optional[str] = None
    passed: bool
    error: Optional[str] = None


class RunOut(BaseModel):
    language: str
    stdout: str
    stderr: str
    exit_code: Optional[int]
    timed_out: bool
    duration_ms: int
    tests: list[TestResult] = Field(default_factory=list)
    tests_passed: int = 0
    tests_total: int = 0


class EvaluateMeta(BaseModel):
    """Optional signals captured by the client during the session."""

    duration_seconds: Optional[int] = None      # SPEECH: length of the recording
    speaking_seconds: Optional[float] = None    # SPEECH: seconds with voice activity
    checklist_done: list[int] = Field(default_factory=list)
    hints_used: int = 0
    notes: str = ""
    run_output: Optional[str] = None


class EvaluateIn(BaseModel):
    user_submission: str = Field(max_length=200_000)
    time_spent_seconds: int = Field(default=0, ge=0, le=60 * 60 * 24)
    language: Optional[str] = None
    meta: EvaluateMeta = Field(default_factory=EvaluateMeta)


class RuntimeInfo(BaseModel):
    key: str
    label: str
    available: bool
    supports_tests: bool
    monaco: str


# ───────────────────────── journal / metrics ─────────────────────────
class JournalOut(BaseModel):
    id: str
    task_id: str
    task_title: str
    task_mode: TaskMode
    category: str
    language: Optional[str]
    date: dt.date
    time_spent_seconds: int
    planned_minutes: int
    user_submission: str
    notes: str
    hints_used: int
    metrics: Metrics
    score: int
    xp_earned: int
    ai_model: str
    submission_sha: str
    run_output: Optional[str]
    created_at: dt.datetime


class FlashcardOut(BaseModel):
    id: str
    task_id: Optional[str]
    journal_id: Optional[str]
    front: str
    back: str
    topic: str
    box: int
    due_date: dt.date
    reviews: int
    correct: int
    interval_days: int
    next_intervals: dict[str, int] = Field(default_factory=dict)   # days until next review per rating


class EvaluateOut(BaseModel):
    entry: JournalOut
    task: TaskOut
    flashcards: list[FlashcardOut]
    streak_count: int
    total_xp: int
    next_task_id: Optional[str]


class JournalPage(BaseModel):
    items: list[JournalOut]
    total: int
    page: int
    page_size: int
    pages: int
    counts_by_mode: dict[str, int]
    summary: dict[str, Any]


class HeatmapItem(BaseModel):
    title: str
    mode: str
    minutes: int


class HeatmapDay(BaseModel):
    date: dt.date
    minutes: int
    sessions: int
    items: list[HeatmapItem] = Field(default_factory=list)


class HeatmapOut(BaseModel):
    days: list[HeatmapDay]
    total_minutes: int
    active_days: int
    longest_streak: int
    max_minutes: int


class StatsOut(BaseModel):
    range_days: int
    total_focus_minutes: int
    focus_minutes_this_week: int
    sessions: int
    blocks_completed: int
    blocks_total: int
    completion_rate: float                      # 0-100
    streak_count: int
    longest_streak: int
    active_last_7: list[bool]
    mean_block_minutes: float
    planned_mean_minutes: float
    pace_delta_minutes: float                   # actual - planned (negative = faster)
    avg_score: float
    total_xp: int
    by_mode: dict[str, dict[str, float]]


class TopicMastery(BaseModel):
    category: str
    attempts: int
    passed: int
    avg_score: float
    mastery_pct: int
    level: str


class SeriesPoint(BaseModel):
    label: str
    date: dt.date
    minutes: float
    score: int
    hints_used: int


class PerformanceOut(BaseModel):
    mode: TaskMode
    topics: list[TopicMastery]
    series: list[SeriesPoint]
    attempts: int
    avg_score: float
    no_hint_rate: float
    avg_minutes: float
    mean_score: float
    extras: dict[str, Any]


class FlashcardCreate(BaseModel):
    front: str = Field(min_length=1, max_length=2000)
    back: str = Field(min_length=1, max_length=4000)
    topic: str = ""
    task_id: Optional[str] = None


class FlashcardGenerateIn(BaseModel):
    task_id: str
    text: str = ""                               # optional highlight / notes to build cards from
    count: int = Field(default=3, ge=1, le=10)


class FlashcardReviewIn(BaseModel):
    rating: Literal["hard", "good", "easy"]


# ───────────────────────── conversions ─────────────────────────
def user_to_out(u: User) -> UserOut:
    return UserOut(
        id=str(u.id),
        name=u.name,
        email=u.email,
        created_at=u.created_at,
        streak_count=u.streak_count,
        longest_streak=u.longest_streak,
        daily_target_minutes=u.daily_target_minutes,
        xp=u.xp,
        is_demo=u.is_demo,
        onboarded=u.onboarded,
        learner_level=u.learner_level,
        goal=u.goal,
        preferences=u.preferences,
    )


def task_to_out(t: TaskBlock, start: Optional[str] = None, end: Optional[str] = None) -> TaskOut:
    return TaskOut(
        id=str(t.id),
        date=t.date,
        title=t.title,
        duration_minutes=t.duration_minutes,
        order_index=t.order_index,
        status=t.status,
        task_mode=t.task_mode,
        prompt_context=t.prompt_context,
        category=t.category,
        description=t.description,
        language=t.language,
        difficulty=t.difficulty,
        tags=t.tags,
        constraints=t.constraints,
        hints=t.hints,
        checklist=t.checklist,
        starter_code=t.starter_code,
        test_cases=[TestCaseIO(name=c.name, call=c.call, expected=c.expected) for c in t.test_cases],
        word_target_min=t.word_target_min,
        word_target_max=t.word_target_max,
        target_wpm=t.target_wpm,
        draft=t.draft,
        time_spent_seconds=t.time_spent_seconds,
        completed_at=t.completed_at,
        journal_id=str(t.journal_id) if t.journal_id else None,
        content_ready=t.content_ready,
        plan_id=str(t.plan_id) if t.plan_id else None,
        topic_key=t.topic_key,
        phase=t.phase,
        plan_day=t.plan_day,
        hint_level_used=t.hint_level_used,
        practice_kind=t.practice_kind,
        practice_config=t.practice_config or {},
        start_time=start,
        end_time=end,
    )


def journal_to_out(j: JournalEntry) -> JournalOut:
    return JournalOut(
        id=str(j.id),
        task_id=str(j.task_id),
        task_title=j.task_title,
        task_mode=j.task_mode,
        category=j.category,
        language=j.language,
        date=j.date,
        time_spent_seconds=j.time_spent_seconds,
        planned_minutes=j.planned_minutes,
        user_submission=j.user_submission,
        notes=j.notes,
        hints_used=j.hints_used,
        metrics=j.metrics,
        score=j.score,
        xp_earned=j.xp_earned,
        ai_model=j.ai_model,
        submission_sha=j.submission_sha,
        run_output=j.run_output,
        created_at=j.created_at,
    )


def flashcard_to_out(c: Flashcard) -> FlashcardOut:
    return FlashcardOut(
        id=str(c.id),
        task_id=str(c.task_id) if c.task_id else None,
        journal_id=str(c.journal_id) if c.journal_id else None,
        front=c.front,
        back=c.back,
        topic=c.topic,
        box=c.box,
        due_date=c.due_date,
        reviews=c.reviews,
        correct=c.correct,
        interval_days=LEITNER_INTERVALS.get(c.box, 1),
        next_intervals={
            "hard": 0,
            "good": LEITNER_INTERVALS[min(5, c.box + 1)],
            "easy": LEITNER_INTERVALS[min(5, c.box + 2)],
        },
    )


def testcases_to_docs(items: list[TestCaseIO]) -> list[TestCase]:
    return [TestCase(name=i.name, call=i.call, expected=i.expected) for i in items]
