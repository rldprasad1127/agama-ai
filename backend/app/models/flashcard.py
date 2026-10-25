"""Flashcard document with Leitner-box spaced repetition."""
from __future__ import annotations

import datetime as dt
from typing import Optional

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel

# Days until the next review for each Leitner box (1..5)
LEITNER_INTERVALS = {1: 1, 2: 2, 3: 4, 4: 8, 5: 16}


class Flashcard(Document):
    user_id: PydanticObjectId
    task_id: Optional[PydanticObjectId] = None
    journal_id: Optional[PydanticObjectId] = None
    front: str
    back: str
    topic: str = ""
    box: int = 1
    due_date: dt.date = Field(default_factory=lambda: dt.date.today())
    reviews: int = 0
    correct: int = 0
    last_reviewed: Optional[dt.datetime] = None
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))

    class Settings:
        name = "flashcards"
        indexes = [IndexModel([("user_id", 1), ("due_date", 1)])]
