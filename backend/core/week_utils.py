"""
Week utilities for Sunday-only week key handling.

All functions operate on date objects (UTC date-only) to avoid DST issues.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import List


def sunday_of_week(d: date) -> date:
    """Return the Sunday date for the week containing the given date.

    Uses ISO weekday where Monday=0..Sunday=6 and subtracts the appropriate
    number of days to get to Sunday. Input is treated as a naive UTC date.
    """
    # Monday=0..Sunday=6; for Sunday we subtract 0 days
    days_to_subtract = (d.weekday() + 1) % 7
    return d - timedelta(days=days_to_subtract)


def week_key(d: date) -> str:
    """Return canonical Sunday week key (YYYY-MM-DD) for the given date."""
    return sunday_of_week(d).isoformat()


def shift_week_key(week_key_str: str, delta_weeks: int) -> str:
    """Shift a week key (YYYY-MM-DD) by a number of weeks and return a new key.

    If the input is not a Sunday, it is normalized to Sunday first.
    """
    try:
        base = date.fromisoformat(week_key_str)
    except Exception:
        # Fallback: treat as date(1970-01-01) if malformed; callers should validate
        base = date(1970, 1, 1)
    base_sunday = sunday_of_week(base)
    shifted = base_sunday + timedelta(weeks=int(delta_weeks or 0))
    return shifted.isoformat()


def list_sundays_between(start: date, end: date, inclusive: bool = True) -> List[str]:
    """List Sunday week keys between two dates, ascending.

    - Normalizes both endpoints to Sundays.
    - Always returns ascending keys. If start > end, returns an empty list unless
      inclusive and both are the same Sunday, in which case returns that one key.
    """
    s0 = sunday_of_week(start)
    s1 = sunday_of_week(end)
    if s0 > s1:
        # No implicit reversal; keep semantics simple for callers
        return [s0.isoformat()] if inclusive and s0 == s1 else []
    keys: List[str] = []
    cur = s0
    last = s1 if inclusive else (s1 - timedelta(days=7))
    while cur <= last:
        keys.append(cur.isoformat())
        cur = cur + timedelta(days=7)
    return keys

