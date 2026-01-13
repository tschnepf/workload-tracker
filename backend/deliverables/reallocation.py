from __future__ import annotations

from typing import Dict, Any, Optional, Tuple
from datetime import date
from math import ceil

from core.week_utils import sunday_of_week, shift_week_key


def reallocate_weekly_hours(
    weekly_hours: Dict[str, Any],
    old_date: Optional[date],
    new_date: Optional[date],
    window: Optional[Tuple[Optional[date], Optional[date]]] = None,
) -> Dict[str, int]:
    """Pure function: shift buckets between weeks by whole weeks, returning ints.

    - Computes delta_weeks based on Sunday-of-week(old_date) vs Sunday-of-week(new_date).
    - If either date is None or delta_weeks == 0, returns integer-ceil normalized map.
    - If a window (start_date, end_date) is provided, only keys within that Sunday-normalized
      inclusive window move; others remain unchanged.
    - Collisions are summed first; rounding is ceil after summation.
    - Negative/NaN inputs are treated as 0; zeros are dropped in output.
    """
    wh = weekly_hours or {}
    # Integer-ceil normalization helper
    def _ceil_norm(v: Any) -> int:
        try:
            n = ceil(float(v))
            return int(n if n > 0 else 0)
        except Exception:
            return 0

    if not wh:
        return {}

    # Normalize inputs to Sundays
    try:
        s_old = sunday_of_week(old_date) if old_date else None
        s_new = sunday_of_week(new_date) if new_date else None
    except Exception:
        s_old = None
        s_new = None

    if not s_old or not s_new:
        # Just normalize to integer Sundays (no shift)
        buckets: Dict[str, int] = {}
        for k, v in wh.items():
            try:
                sk = sunday_of_week(date.fromisoformat(k)).isoformat()
            except Exception:  # nosec B112
                continue
            buckets[sk] = buckets.get(sk, 0) + _ceil_norm(v)
        return {k: v for k, v in buckets.items() if v > 0}

    delta_weeks = (s_new - s_old).days // 7
    if delta_weeks == 0:
        # No change, just normalize/ceil
        buckets: Dict[str, int] = {}
        for k, v in wh.items():
            try:
                sk = sunday_of_week(date.fromisoformat(k)).isoformat()
            except Exception:  # nosec B112
                continue
            buckets[sk] = buckets.get(sk, 0) + _ceil_norm(v)
        return {k: v for k, v in buckets.items() if v > 0}

    # Determine window boundaries if provided
    win_start: Optional[date] = None
    win_end: Optional[date] = None
    if window:
        try:
            (w0, w1) = window
            win_start = sunday_of_week(w0) if w0 else None
            win_end = sunday_of_week(w1) if w1 else None
        except Exception:
            win_start = None
            win_end = None

    moved: Dict[str, float] = {}
    kept: Dict[str, float] = {}

    for k, v in wh.items():
        # Normalize key to Sunday
        try:
            sk = sunday_of_week(date.fromisoformat(k)).isoformat()
        except Exception:  # nosec B112
            continue
        try:
            hours = float(v)
            if hours < 0:
                hours = 0.0
        except Exception:
            hours = 0.0

        in_window = True
        if win_start and sk < win_start.isoformat():
            in_window = False
        if win_end and sk > win_end.isoformat():
            in_window = False

        if in_window:
            target = shift_week_key(sk, delta_weeks)
            moved[target] = moved.get(target, 0.0) + hours
        else:
            kept[sk] = kept.get(sk, 0.0) + hours

    # Merge moved and kept; ceil after sum; drop zeros
    out: Dict[str, int] = {}
    for m in moved:
        out[m] = int(ceil(moved[m])) if moved[m] > 0 else 0
    for k in kept:
        out[k] = out.get(k, 0) + int(ceil(kept[k])) if kept[k] > 0 else out.get(k, 0)
    return {k: v for k, v in out.items() if v > 0}

