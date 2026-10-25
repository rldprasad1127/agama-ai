"""/api/help — AI study help (explain, ask, comprehension check) and escalating coding hints."""
from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import ClientToday, CurrentUser, get_owned_task
from app.core.config import get_settings
from app.models.help_schemas import (
    AskIn, CheckAnswerIn, CheckAnswerOut, CheckIn, CheckOut, ExplainIn, HelpConfig, HelpOut, HintIn, HintOut,
)
from app.services import help_service as hs
from app.services.plan_service import note_struggle

router = APIRouter(prefix="/api/help", tags=["help"])


@router.get("/config", response_model=HelpConfig)
async def config(user: CurrentUser, today: ClientToday) -> HelpConfig:
    return HelpConfig(daily_limit=get_settings().help_daily_limit, remaining_today=await hs.remaining(user, today),
                      hints_enabled=user.preferences.ai_hints, thresholds=hs.THRESHOLDS)


@router.post("/explain", response_model=HelpOut)
async def explain(body: ExplainIn, user: CurrentUser, today: ClientToday) -> HelpOut:
    task = await get_owned_task(body.task_id, user)
    text, cached, left = await hs.explain(user, task, body.kind, body.passage, today)
    await note_struggle(user, task, today, help_request=True)
    return HelpOut(text=text, cached=cached, remaining_today=left)


@router.post("/ask", response_model=HelpOut)
async def ask(body: AskIn, user: CurrentUser, today: ClientToday) -> HelpOut:
    task = await get_owned_task(body.task_id, user)
    text, left = await hs.ask(user, task, body.question, body.history, today)
    await note_struggle(user, task, today, help_request=True)
    return HelpOut(text=text, cached=False, remaining_today=left)


@router.post("/check", response_model=CheckOut)
async def check(body: CheckIn, user: CurrentUser, today: ClientToday) -> CheckOut:
    task = await get_owned_task(body.task_id, user)
    q, pts, left = await hs.make_check(user, task, body.passage, today)
    return CheckOut(question=q, key_points=pts, remaining_today=left)


@router.post("/check/answer", response_model=CheckAnswerOut)
async def check_answer(body: CheckAnswerIn, user: CurrentUser, today: ClientToday) -> CheckAnswerOut:
    task = await get_owned_task(body.task_id, user)
    ok, fb, re, left = await hs.grade_check(user, task, body.question, body.key_points, body.answer, today)
    if not ok:
        await note_struggle(user, task, today, failed_check=True)
    return CheckAnswerOut(understood=ok, feedback=fb, reexplain=re, remaining_today=left)


@router.post("/hint", response_model=HintOut)
async def hint(body: HintIn, user: CurrentUser, today: ClientToday) -> HintOut:
    task = await get_owned_task(body.task_id, user)
    text, sol, left = await hs.hint(user, task, body.level, body.code, body.run_output, body.elapsed_seconds,
                                    body.failed_runs, body.confirm_solution, today)
    return HintOut(level=body.level, hint=text, solution=sol, remaining_today=left)
