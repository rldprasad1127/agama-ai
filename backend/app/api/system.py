"""/api/system — health and AI connectivity."""
from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser
from app.models.user import User
from app.services.ollama_client import get_ollama

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/health")
async def health() -> dict:
    try:
        await User.find().limit(1).to_list()
        db = "ok"
    except Exception as e:  # pragma: no cover
        db = f"error: {e.__class__.__name__}"
    return {"status": "ok" if db == "ok" else "degraded", "db": db}


@router.get("/ai/status")
async def ai_status(user: CurrentUser) -> dict:
    """Reports whether the Ollama endpoint/key work and which models are available."""
    return await get_ollama().status(user.preferences.ai_model)
