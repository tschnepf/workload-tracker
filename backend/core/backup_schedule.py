from __future__ import annotations

import calendar
from datetime import datetime, timedelta, timezone as dt_timezone
from zoneinfo import ZoneInfo


def _coerce_int(value, default: int, *, min_value: int, max_value: int) -> int:
    try:
        raw = int(value)
    except Exception:
        raw = default
    return max(min_value, min(max_value, raw))


def _coerce_schedule_type(raw: str | None) -> str:
    token = str(raw or '').strip().lower()
    if token in {'daily', 'weekly', 'monthly'}:
        return token
    return 'daily'


def _coerce_timezone(raw: str | None) -> ZoneInfo:
    name = str(raw or '').strip() or 'UTC'
    try:
        return ZoneInfo(name)
    except Exception:
        return ZoneInfo('UTC')


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=dt_timezone.utc)
    return value.astimezone(dt_timezone.utc)


def _month_shift(year: int, month: int, delta: int) -> tuple[int, int]:
    index = (year * 12 + (month - 1)) + delta
    out_year = index // 12
    out_month = (index % 12) + 1
    return out_year, out_month


def _month_day(year: int, month: int, preferred_day: int) -> int:
    last_day = calendar.monthrange(year, month)[1]
    return max(1, min(last_day, preferred_day))


def _current_period_run_local(settings_obj, now_local: datetime) -> datetime:
    schedule_type = _coerce_schedule_type(getattr(settings_obj, 'schedule_type', 'daily'))
    hour = _coerce_int(getattr(settings_obj, 'schedule_hour', 2), 2, min_value=0, max_value=23)
    minute = _coerce_int(getattr(settings_obj, 'schedule_minute', 0), 0, min_value=0, max_value=59)

    if schedule_type == 'weekly':
        day_of_week = _coerce_int(getattr(settings_obj, 'schedule_day_of_week', 6), 6, min_value=0, max_value=6)
        days_from_monday = int(now_local.weekday())
        monday = (now_local - timedelta(days=days_from_monday)).date()
        run_date = monday + timedelta(days=day_of_week)
        return datetime(
            run_date.year,
            run_date.month,
            run_date.day,
            hour,
            minute,
            tzinfo=now_local.tzinfo,
        )

    if schedule_type == 'monthly':
        preferred_day = _coerce_int(getattr(settings_obj, 'schedule_day_of_month', 1), 1, min_value=1, max_value=31)
        run_day = _month_day(now_local.year, now_local.month, preferred_day)
        return datetime(
            now_local.year,
            now_local.month,
            run_day,
            hour,
            minute,
            tzinfo=now_local.tzinfo,
        )

    return datetime(
        now_local.year,
        now_local.month,
        now_local.day,
        hour,
        minute,
        tzinfo=now_local.tzinfo,
    )


def current_period_run_at(settings_obj, *, now_utc: datetime | None = None) -> datetime:
    now_utc = _as_utc(now_utc or datetime.now(dt_timezone.utc))
    tz = _coerce_timezone(getattr(settings_obj, 'schedule_timezone', 'UTC'))
    now_local = now_utc.astimezone(tz)
    return _as_utc(_current_period_run_local(settings_obj, now_local))


def next_scheduled_run(settings_obj, *, now_utc: datetime | None = None) -> datetime | None:
    if not bool(getattr(settings_obj, 'enabled', True)):
        return None

    now_utc = _as_utc(now_utc or datetime.now(dt_timezone.utc))
    tz = _coerce_timezone(getattr(settings_obj, 'schedule_timezone', 'UTC'))
    now_local = now_utc.astimezone(tz)
    current_local = _current_period_run_local(settings_obj, now_local)

    if now_local < current_local:
        return _as_utc(current_local)

    schedule_type = _coerce_schedule_type(getattr(settings_obj, 'schedule_type', 'daily'))
    if schedule_type == 'weekly':
        return _as_utc(current_local + timedelta(days=7))
    if schedule_type == 'monthly':
        preferred_day = _coerce_int(getattr(settings_obj, 'schedule_day_of_month', 1), 1, min_value=1, max_value=31)
        year, month = _month_shift(current_local.year, current_local.month, 1)
        run_day = _month_day(year, month, preferred_day)
        future_local = datetime(
            year,
            month,
            run_day,
            current_local.hour,
            current_local.minute,
            tzinfo=current_local.tzinfo,
        )
        return _as_utc(future_local)
    return _as_utc(current_local + timedelta(days=1))


def evaluate_due(settings_obj, *, now_utc: datetime | None = None, last_run_at: datetime | None = None) -> dict:
    now_utc = _as_utc(now_utc or datetime.now(dt_timezone.utc))
    current_run_at = current_period_run_at(settings_obj, now_utc=now_utc)
    next_run_at = next_scheduled_run(settings_obj, now_utc=now_utc)
    last_utc = _as_utc(last_run_at) if last_run_at else None
    enabled = bool(getattr(settings_obj, 'enabled', True))
    due = bool(enabled and now_utc >= current_run_at and (last_utc is None or last_utc < current_run_at))
    return {
        'enabled': enabled,
        'due': due,
        'currentRunAt': current_run_at,
        'nextRunAt': next_run_at,
    }

