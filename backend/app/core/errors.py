"""Domain errors that map cleanly onto HTTP responses."""
from __future__ import annotations


class AIServiceError(Exception):
    """Raised when the Ollama call fails or returns unusable output."""

    def __init__(self, message: str, status_code: int = 502, code: str = "ai_error"):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code
