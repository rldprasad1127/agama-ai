"""Schedule building helpers + presets."""
from __future__ import annotations

import datetime as dt
from typing import Optional

from app.models.enums import TaskMode, TaskStatus
from app.models.schemas import PresetBlock, PresetOut, ScheduleOut, TaskOut, task_to_out
from app.models.task import TaskBlock
from app.models.user import User


def _hhmm_to_min(s: str) -> int:
    try:
        h, m = s.split(":")
        return int(h) * 60 + int(m)
    except (ValueError, AttributeError):
        return 9 * 60


def _min_to_hhmm(n: int) -> str:
    n %= 24 * 60
    return f"{n // 60:02d}:{n % 60:02d}"


def annotate_times(tasks: list[TaskBlock], day_start: str) -> list[TaskOut]:
    """Lay blocks end-to-end from the user's day start."""
    cursor = _hhmm_to_min(day_start)
    out: list[TaskOut] = []
    for t in tasks:
        start, end = cursor, cursor + t.duration_minutes
        out.append(task_to_out(t, _min_to_hhmm(start), _min_to_hhmm(end)))
        cursor = end
    return out


async def day_tasks(user: User, date: dt.date) -> list[TaskBlock]:
    return await TaskBlock.find(TaskBlock.user_id == user.id, TaskBlock.date == date).sort("+order_index", "+created_at").to_list()


async def build_schedule(user: User, date: dt.date) -> ScheduleOut:
    tasks = await day_tasks(user, date)
    outs = annotate_times(tasks, user.preferences.day_start)
    total = sum(t.duration_minutes for t in tasks)
    done = [t for t in tasks if t.status == TaskStatus.COMPLETED]
    done_min = sum(t.duration_minutes for t in done)
    nxt: Optional[TaskBlock] = next((t for t in tasks if t.status == TaskStatus.PENDING), None)
    mode_minutes: dict[str, int] = {m.value: 0 for m in TaskMode}
    for t in tasks:
        mode_minutes[t.task_mode.value] += t.duration_minutes
    return ScheduleOut(
        date=date,
        tasks=outs,
        total_planned_minutes=total,
        completed_minutes=done_min,
        remaining_minutes=total - done_min,
        completed_count=len(done),
        total_count=len(tasks),
        progress_pct=round(done_min * 100 / total) if total else 0,
        daily_target_minutes=user.daily_target_minutes,
        streak_count=effective_streak(user, date),
        next_task_id=str(nxt.id) if nxt else None,
        mode_minutes=mode_minutes,
    )


def effective_streak(user: User, today: dt.date) -> int:
    """Streak shown to the user: broken if they missed yesterday."""
    if user.last_active_date and (today - user.last_active_date).days > 1:
        return 0
    return user.streak_count


async def next_order_index(user: User, date: Optional[dt.date]) -> int:
    last = await TaskBlock.find(TaskBlock.user_id == user.id, TaskBlock.date == date).sort("-order_index").first_or_none()
    return (last.order_index + 1) if last else 0


# ───────────────────────── presets ─────────────────────────
PRESETS: list[PresetOut] = [
    PresetOut(
        key="deep-systems", name="Deep Systems Focus", subtitle="2x 90m Blocks + 20m Recess", total_minutes=180,
        blocks=[
            PresetBlock(title="Systems Deep Dive: Reading & Recall", task_mode=TaskMode.THEORY, duration_minutes=90, category="Systems"),
            PresetBlock(title="Systems Deep Dive: Written Synthesis", task_mode=TaskMode.PROSE, duration_minutes=90, category="Systems"),
        ],
    ),
    PresetOut(
        key="algo-gauntlet", name="Algorithm Gauntlet", subtitle="3x 45m DSA + 1x Mock Speech", total_minutes=180,
        blocks=[
            PresetBlock(title="DSA Warm-up: Arrays & Hashing", task_mode=TaskMode.CODE, duration_minutes=45, category="Algorithms & Complexity"),
            PresetBlock(title="DSA: Two Pointers & Sliding Window", task_mode=TaskMode.CODE, duration_minutes=45, category="Algorithms & Complexity"),
            PresetBlock(title="DSA: Trees & Graph Traversal", task_mode=TaskMode.CODE, duration_minutes=45, category="Algorithms & Complexity"),
            PresetBlock(title="Mock Speech: Explain Your Solution", task_mode=TaskMode.SPEECH, duration_minutes=45, category="Technical Communication"),
        ],
    ),
]


def get_preset(key: str) -> Optional[PresetOut]:
    return next((p for p in PRESETS if p.key == key), None)
