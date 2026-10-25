"""MongoDB (Motor) + Beanie initialisation."""
from __future__ import annotations

import logging
from typing import Optional

from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import get_settings
from app.models.flashcard import Flashcard
from app.models.journal import JournalEntry
from app.models.learning import AIUsage, ContentCache, HelpCache, LearningPlan, MistakeNote, PracticeSession
from app.models.task import TaskBlock
from app.models.user import User

log = logging.getLogger("agama.db")
DOCUMENT_MODELS = [
    User, TaskBlock, JournalEntry, Flashcard, LearningPlan, ContentCache, HelpCache, AIUsage, PracticeSession, MistakeNote,
]
_client: Optional[AsyncIOMotorClient] = None


async def init_db(client: Optional[AsyncIOMotorClient] = None, db_name: Optional[str] = None) -> AsyncIOMotorClient:
    global _client
    s = get_settings()
    _client = client or AsyncIOMotorClient(s.mongodb_url, serverSelectionTimeoutMS=8000)
    await init_beanie(database=_client[db_name or s.mongodb_db], document_models=DOCUMENT_MODELS)
    log.info("MongoDB ready (db=%s)", db_name or s.mongodb_db)
    return _client


async def close_db() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None
