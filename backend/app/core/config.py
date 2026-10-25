"""Application settings, loaded from environment variables / a local ``.env`` file."""
from __future__ import annotations

from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- core ---
    app_name: str = "Agama AI"
    environment: str = "development"
    mongodb_url: str = "mongodb://localhost:27017"
    mongodb_db: str = "agama_ai"
    jwt_secret: str = "dev-only-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7
    cors_origins: str = "http://localhost:5173,http://localhost:3000,https://agama-ai.vercel.app"

    # --- ollama ---
    ollama_base_url: str = "https://ollama.com"
    ollama_api_key: str = ""
    ollama_model: str = "gpt-oss:120b"
    ollama_timeout_seconds: float = 120.0

    # --- AI help (free-tier guard) ---
    help_daily_limit: int = 40

    # --- code runner ---
    code_runner_enabled: bool = True
    code_run_timeout_seconds: float = 10.0
    code_run_memory_mb: int = 512

    # --- demo ---
    demo_mode: bool = True

    @field_validator("ollama_base_url")
    @classmethod
    def _strip_slash(cls, v: str) -> str:
        return v.rstrip("/")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
