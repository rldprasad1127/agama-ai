from __future__ import annotations

from enum import Enum


class TaskMode(str, Enum):
    CODE = "CODE"
    PROSE = "PROSE"
    THEORY = "THEORY"
    SPEECH = "SPEECH"


class TaskStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
