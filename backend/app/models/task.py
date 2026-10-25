"""TaskBlock — one block of the daily schedule."""
from __future__ import annotations

import datetime as dt
from typing import Optional

from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field
from pymongo import ASCENDING, IndexModel

from app.models.enums import TaskMode, TaskStatus


class TestCase(BaseModel):
    """A single executable check for CODE blocks.

    ``call`` is an expression evaluated after the user's code has been loaded
    (e.g. ``Solution().maxSlidingWindow([1,3,-1,-3,5,3,6,7], 3)``) and ``expected``
    is a literal the result is compared against (e.g. ``[3,3,5,5,6,7]``).
    """

    __test__ = False  # stop pytest from collecting this class

    name: str = ""
    call: str
    expected: str


class Draft(BaseModel):
    """Auto-saved work-in-progress for a block."""

    content: str = ""
    notes: str = ""
    checklist_done: list[int] = Field(default_factory=list)
    hints_used: int = 0
    elapsed_seconds: int = 0
    updated_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))


class TaskBlock(Document):
    user_id: PydanticObjectId
    date: Optional[dt.date] = None            # None => unscheduled backlog
    title: str
    duration_minutes: int = 45
    order_index: int = 0
    status: TaskStatus = TaskStatus.PENDING
    task_mode: TaskMode = TaskMode.CODE
    prompt_context: str = ""                  # Markdown: problem statement / reading / script

    # --- descriptive ---
    category: str = ""                        # "Domain / Category" (e.g. Algorithms & Complexity)
    description: str = ""                     # one-liner shown on the dashboard card
    language: Optional[str] = None            # CODE: python / javascript / ...
    difficulty: Optional[str] = None
    tags: list[str] = Field(default_factory=list)

    # --- structured prompt parts ---
    constraints: list[str] = Field(default_factory=list)
    hints: list[str] = Field(default_factory=list)
    checklist: list[str] = Field(default_factory=list)  # prose invariants / theory mastery list / speech key points
    starter_code: str = ""
    test_cases: list[TestCase] = Field(default_factory=list)
    word_target_min: Optional[int] = None
    word_target_max: Optional[int] = None
    target_wpm: Optional[int] = None

    # --- progress ---
    draft: Optional[Draft] = None
    time_spent_seconds: int = 0
    completed_at: Optional[dt.datetime] = None
    journal_id: Optional[PydanticObjectId] = None
    xp_awarded: bool = False                  # guards against XP farming on re-runs
    content_ready: bool = False               # True once the workspace prompt has been authored/generated

    # --- learning-path / practice linkage ---
    plan_id: Optional[PydanticObjectId] = None
    topic_key: Optional[str] = None           # curriculum topic this block belongs to
    phase: Optional[str] = None               # theory | practice | review | mock | extra | session
    plan_day: Optional[int] = None            # 1-based day inside the plan
    gen_hint: str = ""                        # curriculum instructions fed to the AI when authoring content
    cache_key: Optional[str] = None           # shared content-cache key (same lesson => same content)
    reference_solution: str = ""              # verified solution (never sent to the client directly)
    hint_level_used: int = 0                  # highest AI hint rung revealed (4 = full solution)
    practice_kind: Optional[str] = None       # INTERVIEW | ENGLISH => block is a Q&A speaking session
    practice_config: dict = Field(default_factory=dict)

    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))

    class Settings:
        name = "task_blocks"
        indexes = [
            IndexModel([("user_id", ASCENDING), ("date", ASCENDING), ("order_index", ASCENDING)]),
            IndexModel([("plan_id", ASCENDING), ("plan_day", ASCENDING)]),
        ]
