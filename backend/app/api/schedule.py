"""/api/schedule — dashboard & daily schedule builder."""
from __future__ import annotations

import datetime as dt
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import ClientToday, CurrentUser, get_owned_task, parse_oid
from app.models.enums import TaskStatus
from app.models.schemas import (
    GenerateIn, PresetOut, ReorderIn, ScheduleOut, ShapeIn, StatusIn, TaskContent, TaskCreate, TaskOut,
    TaskUpdate, task_to_out, testcases_to_docs,
)
from pydantic import BaseModel
from app.models.task import TaskBlock
from app.services.ai_evaluator import get_evaluator
from app.services.schedule_service import (
    PRESETS, annotate_times, build_schedule, day_tasks, get_preset, next_order_index,
)

router = APIRouter(prefix="/api/schedule", tags=["schedule"])


@router.get("/today", response_model=ScheduleOut)
async def get_today(user: CurrentUser, today: ClientToday, date: Optional[dt.date] = Query(default=None)) -> ScheduleOut:
    """Today's sorted TaskBlock sequence + totals (pass ``?date=`` for another day)."""
    return await build_schedule(user, date or today)


@router.get("/backlog", response_model=list[TaskOut])
async def get_backlog(user: CurrentUser) -> list[TaskOut]:
    tasks = await TaskBlock.find(TaskBlock.user_id == user.id, TaskBlock.date == None).sort("+created_at").to_list()  # noqa: E711
    return [task_to_out(t) for t in tasks]


@router.get("/presets", response_model=list[PresetOut])
async def list_presets(user: CurrentUser) -> list[PresetOut]:
    return PRESETS


class ApplyPresetIn(BaseModel):
    date: Optional[dt.date] = None


@router.post("/presets/{key}/apply", response_model=ScheduleOut, status_code=status.HTTP_201_CREATED)
async def apply_preset(key: str, body: ApplyPresetIn, user: CurrentUser, today: ClientToday) -> ScheduleOut:
    preset = get_preset(key)
    if preset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Preset not found")
    date = body.date or today
    idx = await next_order_index(user, date)
    for b in preset.blocks:
        await TaskBlock(
            user_id=user.id, date=date, title=b.title, task_mode=b.task_mode, duration_minutes=b.duration_minutes,
            category=b.category, order_index=idx, language=user.preferences.default_language if b.task_mode.value == "CODE" else None,
        ).insert()
        idx += 1
    return await build_schedule(user, date)


@router.post("/generate", response_model=TaskContent)
async def generate_preview(body: GenerateIn, user: CurrentUser) -> TaskContent:
    """Ask the AI to draft the workspace content (prompt, hints, tests…) for the New Block modal."""
    return await get_evaluator().generate_content(
        title=body.title, mode=body.task_mode, category=body.category, language=body.language,
        duration_minutes=body.duration_minutes, instructions=body.instructions, model=user.preferences.ai_model,
    )


@router.post("/", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
async def create_task(body: TaskCreate, user: CurrentUser, today: ClientToday) -> TaskOut:
    """Add a new task block (``backlog: true`` stores it unscheduled)."""
    date = None if body.backlog else (body.date or today)
    task = TaskBlock(
        user_id=user.id,
        date=date,
        title=body.title.strip(),
        task_mode=body.task_mode,
        duration_minutes=body.duration_minutes,
        order_index=await next_order_index(user, date),
        category=body.category.strip(),
        language=(body.language or (user.preferences.default_language if body.task_mode.value == "CODE" else None)),
        prompt_context=body.prompt_context,
        description=body.description,
        difficulty=body.difficulty,
        tags=body.tags,
        constraints=body.constraints,
        hints=body.hints,
        checklist=body.checklist,
        starter_code=body.starter_code,
        test_cases=testcases_to_docs(body.test_cases),
        word_target_min=body.word_target_min,
        word_target_max=body.word_target_max,
        target_wpm=body.target_wpm,
        content_ready=bool(body.prompt_context.strip()),
    )
    await task.insert()
    return task_to_out(task)


@router.patch("/reorder", response_model=ScheduleOut)
async def reorder(body: ReorderIn, user: CurrentUser, today: ClientToday) -> ScheduleOut:
    """Persist a drag-and-drop order: ``task_ids`` become order_index 0..n-1."""
    ids = [parse_oid(i, "Task") for i in body.task_ids]
    if len(set(ids)) != len(ids):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Duplicate task ids")
    tasks = await TaskBlock.find({"_id": {"$in": ids}, "user_id": user.id}).to_list()
    if len(tasks) != len(ids):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "One or more tasks were not found")
    by_id = {t.id: t for t in tasks}
    date = body.date or tasks[0].date or today
    for pos, oid in enumerate(ids):
        t = by_id[oid]
        if t.order_index != pos:
            t.order_index = pos
            await t.save()
    # tasks of that day that were not mentioned keep their relative order after the listed ones
    rest = [t for t in await day_tasks(user, date) if t.id not in by_id]
    for off, t in enumerate(rest):
        if t.order_index != len(ids) + off:
            t.order_index = len(ids) + off
            await t.save()
    return await build_schedule(user, date)


@router.post("/shape", response_model=ScheduleOut)
async def shape(body: ShapeIn, user: CurrentUser, today: ClientToday) -> ScheduleOut:
    """Schedule Shaper: lengthen the next pending block by 15/30/60 minutes."""
    date = body.date or today
    tasks = await day_tasks(user, date)
    target = next((t for t in tasks if t.status == TaskStatus.PENDING), None)
    if target is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No pending block to extend")
    target.duration_minutes = min(480, target.duration_minutes + body.minutes)
    await target.save()
    return await build_schedule(user, date)


@router.put("/{task_id}", response_model=TaskOut)
async def update_task(task_id: str, body: TaskUpdate, user: CurrentUser) -> TaskOut:
    """Edit duration, title, prompt, mode, date …"""
    task = await get_owned_task(task_id, user)
    data = body.model_dump(exclude_unset=True)
    move_to_backlog = data.pop("move_to_backlog", False)
    new_date = data.pop("date", None)
    if "test_cases" in data:
        task.test_cases = testcases_to_docs(body.test_cases or [])
        data.pop("test_cases")
    for k, v in data.items():
        if v is None and k in ("title", "task_mode", "duration_minutes"):
            continue
        setattr(task, k, v)
    if move_to_backlog:
        task.date, task.order_index = None, await next_order_index(user, None)
    elif new_date is not None and new_date != task.date:
        task.date, task.order_index = new_date, await next_order_index(user, new_date)
    if "prompt_context" in data:
        task.content_ready = bool((task.prompt_context or "").strip())
    await task.save()
    return task_to_out(task)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(task_id: str, user: CurrentUser) -> None:
    task = await get_owned_task(task_id, user)
    await task.delete()


@router.patch("/{task_id}/status", response_model=TaskOut)
async def set_status(task_id: str, body: StatusIn, user: CurrentUser) -> TaskOut:
    """Manually (re)open or complete a block without an AI review."""
    task = await get_owned_task(task_id, user)
    task.status = body.status
    task.completed_at = dt.datetime.now(dt.timezone.utc) if body.status == TaskStatus.COMPLETED else None
    await task.save()
    return task_to_out(task)


@router.post("/{task_id}/regenerate", response_model=TaskOut)
async def regenerate(task_id: str, user: CurrentUser, instructions: str = "") -> TaskOut:
    """(Re)generate the workspace content for a block with AI and save it."""
    task = await get_owned_task(task_id, user)
    from app.services.content_service import author_block
    await author_block(task, user, instructions)
    return task_to_out(task)
