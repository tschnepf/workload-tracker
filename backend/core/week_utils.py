"""
Week utilities for Sunday-only week key handling and basic business-day math.

All functions operate on date objects (UTC date-only) to avoid DST issues.

Added helpers (Step 1 of pre-deliverables plan):
- ``is_working_day(d)``: Monday–Friday check
- ``working_days_before(target_date, business_days)``: subtract N business days
- ``working_days_after(start_date, business_days)``: add N business days
- ``count_working_days_between(start_date, end_date)``: inclusive count of Mon–Fri

Implementation notes:
- Weekends (Saturday/Sunday) are excluded. Holidays are not considered.
- Functions validate inputs and raise ``ValueError`` for invalid or negative counts.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import List, Optional, Mapping, Any


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


# -----------------------------
# Business-day helper functions
# -----------------------------

def _require_date(obj: date, name: str) -> None:
    if not isinstance(obj, date):
        raise ValueError(f"{name} must be a datetime.date instance")


def is_working_day(d: date) -> bool:
    """Return True if ``d`` is a working day (Mon–Fri), False for weekends.

    Example:
    >>> is_working_day(date(2024, 1, 12))  # Friday
    True
    >>> is_working_day(date(2024, 1, 13))  # Saturday
    False
    """
    _require_date(d, "d")
    # Python: Monday=0..Sunday=6
    return d.weekday() < 5


def working_days_before(target_date: date, business_days: int) -> date:
    """Return the date that is ``business_days`` working days before ``target_date``.

    - Skips weekends (Sat/Sun). Does not include ``target_date`` itself in the count.
    - If ``target_date`` falls on a weekend, counting starts from the previous
      working day before the weekend.
    - ``business_days`` must be a non-negative integer.

    Examples:
    >>> working_days_before(date(2024, 1, 15), 3)  # Tue 2024-01-15 -> Wed 2024-01-10
    datetime.date(2024, 1, 10)
    >>> working_days_before(date(2024, 1, 8), 1)   # Mon -> previous Fri (2024-01-05)
    datetime.date(2024, 1, 5)
    >>> working_days_before(date(2024, 1, 7), 1)   # Sun -> Fri
    datetime.date(2024, 1, 5)
    """
    _require_date(target_date, "target_date")
    if not isinstance(business_days, int):
        raise ValueError("business_days must be an integer")
    if business_days < 0:
        raise ValueError("business_days cannot be negative")

    # Step backwards one day at a time, counting only working days
    cur = target_date
    remaining = business_days
    while remaining > 0:
        cur -= timedelta(days=1)
        if is_working_day(cur):
            remaining -= 1
    return cur


def working_days_after(start_date: date, business_days: int) -> date:
    """Return the date that is ``business_days`` working days after ``start_date``.

    - Skips weekends (Sat/Sun). Does not include ``start_date`` itself in the count.
    - If ``start_date`` falls on a weekend, counting starts from the next
      working day after the weekend.
    - ``business_days`` must be a non-negative integer.

    Examples:
    >>> working_days_after(date(2024, 1, 12), 1)  # Fri + 1 -> Mon 2024-01-15
    datetime.date(2024, 1, 15)
    >>> working_days_after(date(2023, 12, 29), 3) # Cross year to 2024-01-03
    datetime.date(2024, 1, 3)
    >>> working_days_after(date(2024, 1, 6), 1)   # Sat -> Mon 2024-01-08
    datetime.date(2024, 1, 8)
    """
    _require_date(start_date, "start_date")
    if not isinstance(business_days, int):
        raise ValueError("business_days must be an integer")
    if business_days < 0:
        raise ValueError("business_days cannot be negative")

    # Step forwards one day at a time, counting only working days
    cur = start_date
    remaining = business_days
    while remaining > 0:
        cur += timedelta(days=1)
        if is_working_day(cur):
            remaining -= 1
    return cur


def count_working_days_between(start_date: date, end_date: date) -> int:
    """Count working days between ``start_date`` and ``end_date`` (inclusive).

    - Returns 0 if the window contains no weekdays.
    - Supports equal dates.
    - Raises ``ValueError`` if ``start_date`` > ``end_date``.

    Examples:
    >>> count_working_days_between(date(2024, 1, 8), date(2024, 1, 12))  # Mon..Fri
    5
    >>> count_working_days_between(date(2024, 1, 13), date(2024, 1, 14)) # Weekend
    0
    >>> count_working_days_between(date(2023, 12, 29), date(2024, 1, 3))  # Cross year
    4
    """
    _require_date(start_date, "start_date")
    _require_date(end_date, "end_date")
    if start_date > end_date:
        raise ValueError("start_date cannot be after end_date")

    cur = start_date
    count = 0
    while cur <= end_date:
        if is_working_day(cur):
            count += 1
        cur += timedelta(days=1)
    return count


def get_week_value(weekly_hours: Optional[Mapping[str, Any]], sunday_date: date, window: int = 3) -> float:
    """Return numeric value from a weekly_hours dict for the given Sunday date.

    - weekly_hours keys are date strings (YYYY-MM-DD), ideally Sunday keys.
    - During transition, tolerate +/- `window` days to read Monday-based keys.
    - Returns 0.0 if no value or unparsable.
    """
    if not weekly_hours:
        return 0.0
    try:
        key = sunday_date.strftime('%Y-%m-%d')
        if key in weekly_hours:
            try:
                return float(weekly_hours.get(key) or 0)
            except Exception:
                return 0.0
        # Transition mode: read nearby dates within window days
        if window and window > 0:
            for off in range(-int(window), int(window) + 1):
                if off == 0:
                    continue
                k = (sunday_date + timedelta(days=off)).strftime('%Y-%m-%d')
                if k in weekly_hours:
                    try:
                        return float(weekly_hours.get(k) or 0)
                    except Exception:
                        return 0.0
    except Exception:
        return 0.0
    return 0.0
