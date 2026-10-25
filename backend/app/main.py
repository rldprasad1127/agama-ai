"""Agama AI — FastAPI application entrypoint."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import auth, flashcards, focus, help, metrics, plans, practice, schedule, system
from app.core.config import get_settings
from app.core.db import close_db, init_db
from app.core.errors import AIServiceError
from app.services.ollama_client import close_ollama

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("agama")


@asynccontextmanager
async def lifespan(app: FastAPI):
    s = get_settings()
    if s.is_production and s.jwt_secret.startswith(("dev-only", "change-me")):
        raise RuntimeError("JWT_SECRET must be set to a strong random value in production")
    await init_db()
    if not s.ollama_api_key and "ollama.com" in s.ollama_base_url:
        log.warning("OLLAMA_API_KEY is not set — AI features will return 503 until it is configured.")
    yield
    await close_ollama()
    await close_db()


def create_app() -> FastAPI:
    s = get_settings()
    print(s.cors_origin_list)
    app = FastAPI(title=s.app_name, version="1.0.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware, allow_origins=s.cors_origin_list, allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
    )

    @app.exception_handler(AIServiceError)
    async def _ai_error(_: Request, exc: AIServiceError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.message, "code": exc.code})

    for r in (auth.router, schedule.router, focus.router, metrics.router, flashcards.router, help.router, plans.router, practice.router, system.router):
        app.include_router(r)
    return app


app = create_app()
