"""/api/metrics — journal, heat-map and KPIs."""
from __future__ import annotations

import datetime as dt
import math
import re
from typing import Any, Optional

from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import ClientToday, CurrentUser, parse_oid
from app.models.enums import TaskMode, TaskStatus
from app.models.journal import JournalEntry
from app.models.schemas import (
    HeatmapOut, JournalOut, JournalPage, PerformanceOut, StatsOut, TaskOut, journal_to_out, task_to_out,
)
from app.models.task import Draft, TaskBlock
from app.services.schedule_service import next_order_index
from app.services import stats_service
from app.services.stats_service import PASS_SCORE

router = APIRouter(prefix="/api/metrics", tags=["metrics"])


class SummaryProjection(BaseModel):
    task_mode: TaskMode
    time_spent_seconds: int
    score: int


def _dtm(d: dt.date, end: bool = False) -> dt.datetime:
    return dt.datetime.combine(d, dt.time.max if end else dt.time.min)


def _base_filter(user_id: Any, date_from: Optional[dt.date], date_to: Optional[dt.date], q: Optional[str]) -> dict[str, Any]:
    f: dict[str, Any] = {"user_id": user_id}
    if date_from or date_to:
        rng: dict[str, Any] = {}
        if date_from:
            rng["$gte"] = _dtm(date_from)
        if date_to:
            rng["$lte"] = _dtm(date_to)
        f["date"] = rng
    if q and q.strip():
        f["task_title"] = {"$regex": re.escape(q.strip()), "$options": "i"}
    return f


@router.get("/journal", response_model=JournalPage)
async def journal(
    user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    mode: Optional[TaskMode] = None,
    date_from: Optional[dt.date] = None,
    date_to: Optional[dt.date] = None,
    q: Optional[str] = Query(default=None, max_length=100),
) -> JournalPage:
    """Paginated history, filterable by date range, mode and title search."""
    base = _base_filter(user.id, date_from, date_to, q)
    flt = {**base, **({"task_mode": mode.value} if mode else {})}

    total = await JournalEntry.find(flt).count()
    items = await JournalEntry.find(flt).sort("-date", "-created_at").skip((page - 1) * page_size).limit(page_size).to_list()

    # tab badges + header KPIs ignore the mode filter / pagination
    rows = await JournalEntry.find(base).project(SummaryProjection).to_list()
    counts = {m.value: 0 for m in TaskMode}
    n_all = len(rows)
    sec_all = sum(r.time_spent_seconds for r in rows)
    score_sum = sum(r.score for r in rows)
    passed = sum(1 for r in rows if r.score >= PASS_SCORE)
    for r in rows:
        counts[r.task_mode.value] += 1
    counts["ALL"] = n_all
    summary = {
        "blocks_logged": n_all,
        "focus_seconds": sec_all,
        "pass_rate": round(passed * 100 / n_all, 1) if n_all else 0.0,
        "avg_score": round(score_sum / n_all, 1) if n_all else 0.0,
    }
    return JournalPage(
        items=[journal_to_out(i) for i in items], total=total, page=page, page_size=page_size,
        pages=max(1, math.ceil(total / page_size)), counts_by_mode=counts, summary=summary,
    )


@router.get("/journal/export")
async def export_journal(user: CurrentUser) -> dict[str, Any]:
    """Full JSON export of the user's journal (the SPA turns it into a download)."""
    items = await JournalEntry.find(JournalEntry.user_id == user.id).sort("-date", "-created_at").to_list()
    return {
        "exported_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "user": {"name": user.name, "email": user.email},
        "count": len(items),
        "entries": [journal_to_out(i).model_dump(mode="json") for i in items],
    }


@router.get("/journal/{entry_id}", response_model=JournalOut)
async def journal_entry(entry_id: str, user: CurrentUser) -> JournalOut:
    e = await JournalEntry.get(parse_oid(entry_id, "Entry"))
    if e is None or e.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Journal entry not found")
    return journal_to_out(e)


@router.delete("/journal/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entry(entry_id: str, user: CurrentUser) -> None:
    e = await JournalEntry.get(parse_oid(entry_id, "Entry"))
    if e is None or e.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Journal entry not found")
    await e.delete()
    # re-open the block if this was its recorded evaluation
    t = await TaskBlock.get(e.task_id)
    if t is not None and t.journal_id == e.id:
        t.journal_id = None
        await t.save()


@router.get("/heatmap", response_model=HeatmapOut)
async def heatmap(user: CurrentUser, today: ClientToday, days: int = Query(90, ge=7, le=366)) -> HeatmapOut:
    """Daily total focus minutes for the last N days (GitHub-style contribution data)."""
    return await stats_service.heatmap(user, today, days)


@router.get("/stats", response_model=StatsOut)
async def stats(user: CurrentUser, today: ClientToday, range_days: int = Query(30, ge=1, le=366)) -> StatsOut:
    """Global KPIs: total hours, completion rate, average pace, streak."""
    return await stats_service.stats(user, today, range_days)


@router.get("/performance", response_model=PerformanceOut)
async def performance(user: CurrentUser, today: ClientToday, mode: TaskMode = TaskMode.CODE) -> PerformanceOut:
    """Per-mode mastery by category + recent-session series (Analytics tabs)."""
    return await stats_service.performance(user, mode, today)


@router.post("/journal/{entry_id}/rerun", response_model=TaskOut)
async def rerun(entry_id: str, user: CurrentUser, today: ClientToday) -> TaskOut:
    """“Re-run Review in Focus”: re-open the linked block with the old submission as the draft
    (or clone it into today's schedule if the block no longer exists)."""
    e = await JournalEntry.get(parse_oid(entry_id, "Entry"))
    if e is None or e.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Journal entry not found")
    draft = Draft(content=e.user_submission, notes=e.notes, hints_used=e.hints_used)
    t = await TaskBlock.get(e.task_id)
    if t is not None and t.user_id == user.id:
        t.status, t.completed_at, t.draft = TaskStatus.PENDING, None, draft
        if t.date is None:
            t.date, t.order_index = today, await next_order_index(user, today)
        await t.save()
    else:
        t = TaskBlock(
            user_id=user.id, date=today, title=e.task_title, task_mode=e.task_mode, category=e.category, language=e.language,
            duration_minutes=e.planned_minutes or 45, order_index=await next_order_index(user, today), draft=draft,
            content_ready=False,
        )
        await t.insert()
    return task_to_out(t)
