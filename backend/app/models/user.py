"""User document."""
from __future__ import annotations

import datetime as dt
from typing import Optional

from beanie import Document, Indexed
from pydantic import BaseModel, Field


class UserPreferences(BaseModel):
    day_start: str = "09:00"          # HH:MM, used to compute block start/end times
    binaural_enabled: bool = True     # 40Hz binaural beat in focus mode
    default_language: str = "python"
    ai_model: Optional[str] = None    # overrides OLLAMA_MODEL for this user
    ai_hints: bool = True             # escalating AI hints while coding / AI help panel


class User(Document):
    name: str
    email: Indexed(str, unique=True)  # type: ignore[valid-type]
    password_hash: str
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    streak_count: int = 0
    longest_streak: int = 0
    last_active_date: Optional[dt.date] = None
    daily_target_minutes: int = 240
    xp: int = 0
    onboarded: bool = False
    learner_level: Optional[str] = None   # beginner | intermediate | advanced
    goal: Optional[str] = None            # dsa | interview | english | explore
    is_demo: bool = False
    demo_seeded_on: Optional[dt.date] = None
    preferences: UserPreferences = Field(default_factory=UserPreferences)

    class Settings:
        name = "users"
