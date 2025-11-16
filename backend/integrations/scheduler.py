from __future__ import annotations

import random
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from celery import current_app as celery_app
from croniter import croniter
from django.core.cache import cache
from django.utils import timezone

from .models import IntegrationRule

LOCK_TEMPLATE = "integration-lock:{connection}:{object}"
LOCK_MIN_TTL_SECONDS = 60
LOCK_MAX_TTL_SECONDS = 60 * 30


def _interval_minutes(config: Dict[str, Any]) -> Optional[int]:
    interval = config.get('intervalMinutes')
    try:
        return int(interval) if interval is not None else None
    except (TypeError, ValueError):
        return None


def _cron_expression(config: Dict[str, Any]) -> Optional[str]:
    expr = config.get('cronExpression')
    if isinstance(expr, str) and expr.strip():
        return expr.strip()
    return None


def compute_next_run(config: Dict[str, Any], *, from_time: Optional[datetime] = None) -> datetime:
    base = from_time or timezone.now()
    interval = _interval_minutes(config)
    if interval:
        jitter_window = max(1.0, interval * 0.1)
        jitter_minutes = random.uniform(-jitter_window, jitter_window)
        minutes = max(1.0, interval + jitter_minutes)
        return base + timedelta(minutes=minutes)

    expr = _cron_expression(config)
    if expr:
        iterator = croniter(expr, base)
        next_dt = iterator.get_next(datetime)
        if timezone.is_naive(next_dt):
            next_dt = timezone.make_aware(next_dt, timezone=timezone.utc)
        return next_dt

    raise ValueError('Rule config missing schedule information')


def lock_ttl_seconds(config: Dict[str, Any]) -> int:
    interval = _interval_minutes(config)
    if interval:
        ttl = int(interval * 60 * 1.5)
        return max(LOCK_MIN_TTL_SECONDS, min(ttl, LOCK_MAX_TTL_SECONDS))
    return LOCK_MAX_TTL_SECONDS


def acquire_rule_lock(connection_id: int, object_key: str, ttl_seconds: int) -> bool:
    lock_key = LOCK_TEMPLATE.format(connection=connection_id, object=object_key)
    try:
        return cache.add(lock_key, '1', timeout=ttl_seconds)
    except Exception:
        return False


def release_rule_lock(connection_id: int, object_key: str) -> None:
    lock_key = LOCK_TEMPLATE.format(connection=connection_id, object=object_key)
    try:
        cache.delete(lock_key)
    except Exception:
        pass


def schedule_next_run(rule: IntegrationRule, *, base_time: Optional[datetime] = None, commit: bool = True) -> Optional[datetime]:
    if not rule.is_enabled or rule.resync_required:
        rule.next_run_at = None
    else:
        try:
            rule.next_run_at = compute_next_run(rule.config or {}, from_time=base_time)
        except Exception:
            rule.next_run_at = None
    if commit:
        rule.save(update_fields=['next_run_at'])
    return rule.next_run_at


def celery_has_workers(timeout: float = 1.0) -> bool:
    if celery_app is None:
        return False
    try:
        resp = celery_app.control.ping(timeout=timeout) or []
        return len(resp) > 0
    except Exception:
        return False


def cache_available() -> bool:
    token = f"integration-health-{random.random()}"
    try:
        cache.set(token, token, 5)
        val = cache.get(token)
        cache.delete(token)
        return val == token
    except Exception:
        return False


def scheduler_health() -> Dict[str, Any]:
    workers = celery_has_workers()
    cache_ok = cache_available()
    healthy = workers and cache_ok
    message = None
    if not workers:
        message = 'background workers unavailable'
    elif not cache_ok:
        message = 'cache unavailable'
    return {
        'healthy': healthy,
        'workersAvailable': workers,
        'cacheAvailable': cache_ok,
        'message': message,
    }
