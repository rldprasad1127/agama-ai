"""/api/focus — workspace, autosave, code runner and AI evaluation."""
from __future__ import annotations

import datetime as dt
import hashlib
from typing import Optional

from fastapi import APIRouter, HTTPException, status

from app.api.deps import ClientToday, CurrentUser, get_owned_task
from app.models.enums import TaskMode, TaskStatus
from app.models.flashcard import Flashcard
from app.models.journal import JournalEntry, TheoryMetrics
from app.models.schemas import (
    DraftIn, EvaluateIn, EvaluateOut, RunIn, RunOut, RuntimeInfo, TaskOut, flashcard_to_out, journal_to_out,
    task_to_out,
)
from app.models.task import Draft
from app.services import code_runner
from app.services.ai_evaluator import get_evaluator
from app.services.progress_service import apply_activity, xp_for
from app.services.schedule_service import effective_streak

router = APIRouter(prefix="/api/focus", tags=["focus"])


@router.get("/runtimes", response_model=list[RuntimeInfo])
async def runtimes(user: CurrentUser) -> list[RuntimeInfo]:
    """Which languages the server-side runner can execute right now."""
    return code_runner.list_runtimes()


@router.get("/{task_id}", response_model=TaskOut)
async def get_workspace(task_id: str, user: CurrentUser) -> TaskOut:
    """Load a block with its saved draft for the focus workspace."""
    return task_to_out(await get_owned_task(task_id, user))


@router.put("/{task_id}/draft")
async def save_draft(task_id: str, body: DraftIn, user: CurrentUser) -> dict:
    """Autosave work-in-progress (editor text, notes, checklist, timer)."""
    task = await get_owned_task(task_id, user)
    task.draft = Draft(**body.model_dump(), updated_at=dt.datetime.now(dt.timezone.utc))
    await task.save()
    return {"saved_at": task.draft.updated_at}


@router.delete("/{task_id}/draft", status_code=status.HTTP_204_NO_CONTENT)
async def clear_draft(task_id: str, user: CurrentUser) -> None:
    task = await get_owned_task(task_id, user)
    task.draft = None
    await task.save()


@router.post("/{task_id}/run", response_model=RunOut)
async def run(task_id: str, body: RunIn, user: CurrentUser) -> RunOut:
    """Execute code in the sandbox (and the block's test cases when supported)."""
    task = await get_owned_task(task_id, user)
    if task.task_mode != TaskMode.CODE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only CODE blocks can run code")
    if not body.code.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Write some code first")
    return await code_runner.run_code(
        body.code, body.language or task.language, body.stdin, task.test_cases if body.run_tests else None
    )


@router.post("/{task_id}/evaluate", response_model=EvaluateOut)
async def evaluate(task_id: str, body: EvaluateIn, user: CurrentUser, today: ClientToday) -> EvaluateOut:
    """Evaluate the submission with Ollama, store a JournalEntry, complete the block."""
    task = await get_owned_task(task_id, user)
    submission = body.user_submission
    if not submission.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nothing to evaluate — the submission is empty")
    if task.task_mode == TaskMode.SPEECH and len(submission.split()) < 5:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The transcript is too short to evaluate. Record a longer take.")

    seconds = body.time_spent_seconds or (task.draft.elapsed_seconds if task.draft else 0) or 60
    language = body.language or task.language

    # 1) deterministic test run for CODE blocks (ground truth for the LLM)
    run_result: Optional[RunOut] = None
    if task.task_mode == TaskMode.CODE and task.test_cases:
        lang_key = code_runner.normalise_language(language)
        if code_runner.LANGS[lang_key].supports_tests:
            run_result = await code_runner.run_code(submission, language, "", task.test_cases)
            if run_result.tests_total == 0 or (run_result.exit_code is None and not run_result.tests):
                run_result = None  # runner unavailable — let the LLM judge on its own

    # 2) LLM evaluation (raises AIServiceError -> 4xx/5xx with a clear message; nothing is saved)
    metrics = await get_evaluator().evaluate(
        task, submission, time_spent_seconds=seconds, language=language, meta=body.meta, run=run_result,
        model=user.preferences.ai_model,
    )

    # 3) persist
    first_completion = not task.xp_awarded
    xp = xp_for(metrics.score, seconds / 60) if first_completion else 0
    if xp and task.hint_level_used >= 4:
        xp = max(1, xp // 2)           # revealed the full solution: half XP
    entry = JournalEntry(
        user_id=user.id,
        task_id=task.id,
        task_title=task.title,
        task_mode=task.task_mode,
        category=task.category,
        language=language if task.task_mode == TaskMode.CODE else None,
        date=today,
        time_spent_seconds=seconds,
        planned_minutes=task.duration_minutes,
        user_submission=submission,
        notes=body.meta.notes,
        hints_used=body.meta.hints_used,
        metrics=metrics,
        score=metrics.score,
        xp_earned=xp,
        ai_model=user.preferences.ai_model or _model_name(),
        submission_sha=hashlib.sha256(submission.encode("utf-8")).hexdigest(),
        run_output=(body.meta.run_output or "")[:8000] or None,
    )
    await entry.insert()

    cards: list[Flashcard] = []
    if isinstance(metrics, TheoryMetrics):
        for c in metrics.flashcards:
            card = Flashcard(user_id=user.id, task_id=task.id, journal_id=entry.id, front=c.front, back=c.back,
                             topic=c.topic or task.title, due_date=today + dt.timedelta(days=1))
            await card.insert()
            cards.append(card)

    if task.plan_id:
        from app.services.plan_service import on_block_evaluated
        await on_block_evaluated(user, task, metrics.score, today)   # before xp_awarded flips (first-time detection)
    task.xp_awarded = True
    task.status = TaskStatus.COMPLETED
    task.completed_at = dt.datetime.now(dt.timezone.utc)
    task.time_spent_seconds = seconds
    task.journal_id = entry.id
    task.draft = None
    await task.save()

    apply_activity(user, today, xp)
    await user.save()

    nxt = None
    if task.date is not None:
        from app.services.schedule_service import day_tasks
        nxt = next((t for t in await day_tasks(user, task.date) if t.status == TaskStatus.PENDING), None)

    return EvaluateOut(
        entry=journal_to_out(entry),
        task=task_to_out(task),
        flashcards=[flashcard_to_out(c) for c in cards],
        streak_count=effective_streak(user, today),
        total_xp=user.xp,
        next_task_id=str(nxt.id) if nxt else None,
    )


def _model_name() -> str:
    from app.core.config import get_settings
    return get_settings().ollama_model
