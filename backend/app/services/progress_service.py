"""XP + streak bookkeeping."""
from __future__ import annotations

import datetime as dt

from app.models.user import User


def xp_for(score: int, minutes: float) -> int:
    """≈ +13 XP for a good 45-minute block; never below 5 once submitted."""
    return max(5, round(score * max(minutes, 5) / 100 / 3))


def apply_activity(user: User, local_date: dt.date, xp: int) -> None:
    """Update streak/xp in memory (caller saves)."""
    last = user.last_active_date
    if last == local_date:
        pass
    elif last is not None and (local_date - last).days == 1:
        user.streak_count += 1
    elif last is not None and local_date < last:
        pass  # backfilling an old date never changes the streak
    else:
        user.streak_count = 1
    if last is None or local_date > last:
        user.last_active_date = local_date
    user.longest_streak = max(user.longest_streak, user.streak_count)
    user.xp += xp
