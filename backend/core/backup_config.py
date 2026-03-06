from __future__ import annotations

import os
import time

from django.conf import settings
from django.core.cache import cache

_CACHE_KEY = 'core.backups.dir'
_LOCAL_TTL_SECONDS = 30.0
_local_backups_dir: str | None = None
_local_backups_dir_set_at: float = 0.0


def _normalize_dir(path: str | None) -> str:
    raw = str(path or '').strip() or str(getattr(settings, 'BACKUPS_DIR', '/backups') or '/backups')
    return os.path.abspath(raw)


def set_runtime_backups_dir(path: str) -> str:
    normalized = _normalize_dir(path)
    global _local_backups_dir, _local_backups_dir_set_at
    _local_backups_dir = normalized
    _local_backups_dir_set_at = time.monotonic()
    try:
        cache.set(_CACHE_KEY, normalized, timeout=None)
    except Exception:  # nosec B110
        pass
    try:
        setattr(settings, 'BACKUPS_DIR', normalized)
    except Exception:  # nosec B110
        pass
    return normalized


def resolve_backups_dir(*, allow_database: bool = True) -> str:
    now = time.monotonic()
    if _local_backups_dir and (now - _local_backups_dir_set_at) <= _LOCAL_TTL_SECONDS:
        return _local_backups_dir

    try:
        cached = cache.get(_CACHE_KEY)
        if cached:
            return set_runtime_backups_dir(str(cached))
    except Exception:  # nosec B110
        pass

    if allow_database:
        try:
            from core.models import BackupAutomationSettings

            current = (
                BackupAutomationSettings.objects
                .filter(key='default')
                .values_list('backups_dir', flat=True)
                .first()
            )
            if current:
                return set_runtime_backups_dir(str(current))
        except Exception:  # nosec B110
            pass

    return set_runtime_backups_dir(_normalize_dir(None))

