"""Analytics aggregation for the Journal / Analytics screens."""
from __future__ import annotations

import datetime as dt
from collections import defaultdict
from typing import Any

from pydantic import BaseModel

from app.models.enums import TaskMode, TaskStatus
from app.models.journal import (
    CodeMetrics, JournalEntry, ProseMetrics, SpeechMetrics, TheoryMetrics,
)
from app.models.schemas import (
    HeatmapDay, HeatmapItem, HeatmapOut, PerformanceOut, SeriesPoint, StatsOut, TopicMastery,
)
from app.models.task import TaskBlock
from app.models.user import User
from app.services.schedule_service import effective_streak

PASS_SCORE = 70


class HeatmapProjection(BaseModel):
    date: dt.date
    task_title: str
    task_mode: TaskMode
    time_spent_seconds: int


def _dt(d: dt.date) -> dt.datetime:
    return dt.datetime.combine(d, dt.time.min)


async def heatmap(user: User, today: dt.date, days: int = 90) -> HeatmapOut:
    """Daily focus minutes for the last ``days`` days (GitHub-style), via a Mongo aggregation."""
    start = today - dt.timedelta(days=days - 1)
    match = {"user_id": user.id, "date": {"$gte": _dt(start), "$lte": _dt(today)}}
    # Per-user volumes are small (a handful of docs per day), so we project just the needed fields
    # and fold them in Python. This stays portable across MongoDB-compatible servers.
    detail = await JournalEntry.find(match).sort("+created_at").project(HeatmapProjection).to_list()
    by_day: dict[dt.date, dict[str, Any]] = {}
    for e in detail:
        r = by_day.setdefault(e.date, {"seconds": 0, "sessions": 0, "items": []})
        r["seconds"] += e.time_spent_seconds
        r["sessions"] += 1
        r["items"].append(HeatmapItem(title=e.task_title, mode=e.task_mode.value, minutes=round(e.time_spent_seconds / 60)))
    out: list[HeatmapDay] = []
    for i in range(days):
        d = start + dt.timedelta(days=i)
        r = by_day.get(d)
        if r:
            out.append(HeatmapDay(date=d, minutes=round(r["seconds"] / 60), sessions=r["sessions"], items=r["items"]))
        else:
            out.append(HeatmapDay(date=d, minutes=0, sessions=0))
    # longest consecutive active run
    best = cur = 0
    for d in out:
        cur = cur + 1 if d.minutes > 0 else 0
        best = max(best, cur)
    return HeatmapOut(
        days=out,
        total_minutes=sum(d.minutes for d in out),
        active_days=sum(1 for d in out if d.minutes > 0),
        longest_streak=best,
        max_minutes=max((d.minutes for d in out), default=0),
    )


async def stats(user: User, today: dt.date, range_days: int = 30) -> StatsOut:
    start = today - dt.timedelta(days=range_days - 1)
    entries = await JournalEntry.find(JournalEntry.user_id == user.id, JournalEntry.date >= start, JournalEntry.date <= today).to_list()
    total_sec = sum(e.time_spent_seconds for e in entries)
    week_start = today - dt.timedelta(days=6)
    week_sec = sum(e.time_spent_seconds for e in entries if e.date >= week_start)

    tasks = await TaskBlock.find(TaskBlock.user_id == user.id, TaskBlock.date >= start, TaskBlock.date <= today).to_list()
    blocks_total = len(tasks)
    blocks_done = sum(1 for t in tasks if t.status == TaskStatus.COMPLETED)

    active_days = {e.date for e in entries}
    last7 = [(today - dt.timedelta(days=6 - i)) in active_days for i in range(7)]

    n = len(entries)
    mean_actual = (sum(e.time_spent_seconds for e in entries) / 60 / n) if n else 0.0
    mean_planned = (sum(e.planned_minutes for e in entries) / n) if n else 0.0

    by_mode: dict[str, dict[str, float]] = {}
    for m in TaskMode:
        es = [e for e in entries if e.task_mode == m]
        by_mode[m.value] = {
            "count": len(es),
            "minutes": round(sum(e.time_spent_seconds for e in es) / 60),
            "avg_score": round(sum(e.score for e in es) / len(es), 1) if es else 0.0,
        }

    return StatsOut(
        range_days=range_days,
        total_focus_minutes=round(total_sec / 60),
        focus_minutes_this_week=round(week_sec / 60),
        sessions=n,
        blocks_completed=blocks_done,
        blocks_total=blocks_total,
        completion_rate=round(blocks_done * 100 / blocks_total, 1) if blocks_total else 0.0,
        streak_count=effective_streak(user, today),
        longest_streak=user.longest_streak,
        active_last_7=last7,
        mean_block_minutes=round(mean_actual, 1),
        planned_mean_minutes=round(mean_planned, 1),
        pace_delta_minutes=round(mean_actual - mean_planned, 1) if n else 0.0,
        avg_score=round(sum(e.score for e in entries) / n, 1) if n else 0.0,
        total_xp=user.xp,
        by_mode=by_mode,
    )


def _level(pct: int) -> str:
    return "Mastered" if pct >= 85 else "Proficient" if pct >= 70 else "Developing" if pct >= 50 else "Foundational"


async def performance(user: User, mode: TaskMode, today: dt.date, limit: int = 10) -> PerformanceOut:
    entries = await JournalEntry.find(JournalEntry.user_id == user.id, JournalEntry.task_mode == mode).sort("+date", "+created_at").to_list()
    groups: dict[str, list[JournalEntry]] = defaultdict(list)
    for e in entries:
        groups[e.category or "General"].append(e)
    topics: list[TopicMastery] = []
    for cat, es in groups.items():
        avg = sum(e.score for e in es) / len(es)
        pct = round(avg)
        topics.append(TopicMastery(category=cat, attempts=len(es), passed=sum(1 for e in es if e.score >= PASS_SCORE),
                                   avg_score=round(avg, 1), mastery_pct=pct, level=_level(pct)))
    topics.sort(key=lambda t: (-t.attempts, -t.mastery_pct))

    recent = entries[-limit:]
    series = [
        SeriesPoint(label=f"S{i + 1}", date=e.date, minutes=round(e.time_spent_seconds / 60, 1), score=e.score, hints_used=e.hints_used)
        for i, e in enumerate(recent)
    ]
    n = len(entries)
    extras: dict[str, Any] = {}
    if entries:
        if mode == TaskMode.CODE:
            tp = [(e.metrics.tests_passed, e.metrics.tests_total) for e in entries if isinstance(e.metrics, CodeMetrics) and e.metrics.tests_total]
            extras["test_pass_rate"] = round(100 * sum(a for a, _ in tp) / max(1, sum(b for _, b in tp)), 1) if tp else None
            extras["optimal_complexity_rate"] = round(100 * sum(1 for e in entries if isinstance(e.metrics, CodeMetrics) and e.metrics.logic_status == "PASS") / n, 1)
        elif mode == TaskMode.PROSE:
            ps = [e for e in entries if isinstance(e.metrics, ProseMetrics)]
            wc = [e.metrics.word_count for e in ps]
            extras["avg_words"] = round(sum(wc) / len(wc)) if wc else 0
            extras["words_per_minute"] = round(sum(wc) / max(1, sum(e.time_spent_seconds for e in ps) / 60), 1) if ps else 0
            grades = [e.metrics.readability_grade for e in ps if e.metrics.readability_grade is not None]
            extras["avg_readability_grade"] = round(sum(grades) / len(grades), 1) if grades else None
        elif mode == TaskMode.THEORY:
            ts = [e.metrics.comprehension_score for e in entries if isinstance(e.metrics, TheoryMetrics)]
            extras["avg_comprehension"] = round(sum(ts) / len(ts), 1) if ts else 0
        elif mode == TaskMode.SPEECH:
            ss = [e.metrics for e in entries if isinstance(e.metrics, SpeechMetrics)]
            extras["avg_wpm"] = round(sum(s.wpm for s in ss) / len(ss)) if ss else 0
            extras["avg_fluency"] = round(sum(s.fluency_score for s in ss) / len(ss), 1) if ss else 0
            extras["avg_fillers"] = round(sum(s.filler_total for s in ss) / len(ss), 1) if ss else 0
    return PerformanceOut(
        mode=mode, topics=topics, series=series, attempts=n,
        avg_score=round(sum(e.score for e in entries) / n, 1) if n else 0.0,
        no_hint_rate=round(100 * sum(1 for e in entries if e.hints_used == 0) / n, 1) if n else 0.0,
        avg_minutes=round(sum(e.time_spent_seconds for e in entries) / 60 / n, 1) if n else 0.0,
        mean_score=round(sum(e.score for e in entries) / n, 1) if n else 0.0,
        extras=extras,
    )
