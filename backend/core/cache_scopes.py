from __future__ import annotations

from typing import Iterable

from django.conf import settings
from django.core.cache import cache


def _channel_namespace() -> str:
    raw = str(getattr(settings, "SNAPSHOT_INVALIDATION_CHANNEL", "snapshot_invalidation") or "snapshot_invalidation")
    return raw.strip() or "snapshot_invalidation"


def _scope_key(scope: str, token: str) -> str:
    return f"{_channel_namespace()}:snapshot_scope_version:{scope}:{token}"


def _incr_key(key: str) -> int:
    try:
        return int(cache.incr(key))
    except Exception:
        current = int(cache.get(key, 1) or 1)
        nxt = current + 1
        cache.set(key, nxt, None)
        return nxt


def get_snapshot_scope_version(scope: str, token: str = "global") -> int:
    try:
        return int(cache.get(_scope_key(scope, token), 1) or 1)
    except Exception:
        return 1


def bump_snapshot_scopes(
    *,
    project_ids: Iterable[int] | None = None,
    department_ids: Iterable[int] | None = None,
) -> None:
    if not getattr(settings, "SNAPSHOT_SCOPE_INVALIDATION_ENABLED", True):
        return
    _incr_key(_scope_key("global", "global"))
    for project_id in set(int(v) for v in (project_ids or []) if v):
        _incr_key(_scope_key("project", str(project_id)))
    for department_id in set(int(v) for v in (department_ids or []) if v):
        _incr_key(_scope_key("department", str(department_id)))


def request_scope_version(request) -> int:
    """Return a deterministic scope version marker for cache keys."""
    versions = [get_snapshot_scope_version("global", "global")]
    try:
        dept = request.query_params.get("department")
        if dept not in (None, ""):
            versions.append(get_snapshot_scope_version("department", str(int(dept))))
    except Exception:
        pass

    try:
        project = request.query_params.get("project")
        if project not in (None, ""):
            versions.append(get_snapshot_scope_version("project", str(int(project))))
    except Exception:
        pass

    try:
        project_ids = request.query_params.get("project_ids")
        if project_ids:
            for raw in str(project_ids).split(","):
                raw = raw.strip()
                if not raw:
                    continue
                versions.append(get_snapshot_scope_version("project", str(int(raw))))
    except Exception:
        pass

    return max(versions) if versions else 1
