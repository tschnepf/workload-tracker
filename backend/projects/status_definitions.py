from __future__ import annotations

from typing import Any

from django.core.cache import cache


STATUS_DEFINITIONS_CACHE_KEY = 'projects:status_definitions:index:v1'
STATUS_DEFINITIONS_CACHE_TTL_SECONDS = 300

_FALLBACK_DEFINITIONS = {
    'planning': {
        'key': 'planning',
        'label': 'Planning',
        'colorHex': '#60a5fa',
        'includeInAnalytics': False,
        'treatAsCaWhenNoDeliverable': False,
        'isSystem': True,
        'isActive': True,
        'sortOrder': 10,
    },
    'active': {
        'key': 'active',
        'label': 'Active',
        'colorHex': '#34d399',
        'includeInAnalytics': True,
        'treatAsCaWhenNoDeliverable': False,
        'isSystem': True,
        'isActive': True,
        'sortOrder': 20,
    },
    'active_ca': {
        'key': 'active_ca',
        'label': 'Active CA',
        'colorHex': '#60a5fa',
        'includeInAnalytics': True,
        'treatAsCaWhenNoDeliverable': True,
        'isSystem': True,
        'isActive': True,
        'sortOrder': 30,
    },
    'on_hold': {
        'key': 'on_hold',
        'label': 'On Hold',
        'colorHex': '#f59e0b',
        'includeInAnalytics': False,
        'treatAsCaWhenNoDeliverable': False,
        'isSystem': True,
        'isActive': True,
        'sortOrder': 40,
    },
    'completed': {
        'key': 'completed',
        'label': 'Completed',
        'colorHex': '#9ca3af',
        'includeInAnalytics': False,
        'treatAsCaWhenNoDeliverable': False,
        'isSystem': True,
        'isActive': True,
        'sortOrder': 50,
    },
    'cancelled': {
        'key': 'cancelled',
        'label': 'Cancelled',
        'colorHex': '#ef4444',
        'includeInAnalytics': False,
        'treatAsCaWhenNoDeliverable': False,
        'isSystem': True,
        'isActive': True,
        'sortOrder': 60,
    },
    'inactive': {
        'key': 'inactive',
        'label': 'Inactive',
        'colorHex': '#64748b',
        'includeInAnalytics': False,
        'treatAsCaWhenNoDeliverable': False,
        'isSystem': True,
        'isActive': True,
        'sortOrder': 70,
    },
}


def normalize_status_key(value: str | None) -> str:
    return (value or '').strip().lower()


def clear_status_definitions_cache() -> None:
    try:
        cache.delete(STATUS_DEFINITIONS_CACHE_KEY)
    except Exception:  # nosec B110
        pass


def _serialize_definition_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        'key': normalize_status_key(row.get('key')),
        'label': (row.get('label') or '').strip(),
        'colorHex': row.get('color_hex') or '#64748b',
        'includeInAnalytics': bool(row.get('include_in_analytics', False)),
        'treatAsCaWhenNoDeliverable': bool(row.get('treat_as_ca_when_no_deliverable', False)),
        'isSystem': bool(row.get('is_system')),
        'isActive': bool(row.get('is_active', True)),
        'sortOrder': int(row.get('sort_order') or 0),
    }


def get_status_definition_index(*, refresh: bool = False) -> dict[str, dict[str, Any]]:
    if not refresh:
        cached = cache.get(STATUS_DEFINITIONS_CACHE_KEY)
        if isinstance(cached, dict):
            return cached

    from projects.models import ProjectStatusDefinition

    try:
        rows = list(
            ProjectStatusDefinition.objects.all().values(
                'key',
                'label',
                'color_hex',
                'include_in_analytics',
                'treat_as_ca_when_no_deliverable',
                'is_system',
                'is_active',
                'sort_order',
            )
        )
    except Exception:  # nosec B110
        return dict(_FALLBACK_DEFINITIONS)

    index: dict[str, dict[str, Any]] = {}
    for row in rows:
        item = _serialize_definition_row(row)
        key = item['key']
        if key:
            index[key] = item

    try:
        cache.set(STATUS_DEFINITIONS_CACHE_KEY, index, timeout=STATUS_DEFINITIONS_CACHE_TTL_SECONDS)
    except Exception:  # nosec B110
        pass
    return index or dict(_FALLBACK_DEFINITIONS)


def status_exists(value: str | None) -> bool:
    key = normalize_status_key(value)
    if not key:
        return False
    return key in get_status_definition_index()


def get_status_definition(value: str | None) -> dict[str, Any] | None:
    key = normalize_status_key(value)
    if not key:
        return None
    return get_status_definition_index().get(key)


def status_included_in_analytics(value: str | None, *, default: bool = False) -> bool:
    item = get_status_definition(value)
    if not item:
        return default
    return bool(item.get('includeInAnalytics', default))


def status_uses_ca_override(value: str | None, *, default: bool = False) -> bool:
    item = get_status_definition(value)
    if not item:
        return default
    return bool(item.get('treatAsCaWhenNoDeliverable', default))


def get_status_keys_included_in_analytics(*, active_only: bool = False) -> set[str]:
    out: set[str] = set()
    for item in get_status_definition_index().values():
        if not bool(item.get('includeInAnalytics', False)):
            continue
        if active_only and not bool(item.get('isActive', True)):
            continue
        key = normalize_status_key(item.get('key'))
        if key:
            out.add(key)
    return out


def get_included_status_definitions(*, active_only: bool = False) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in get_status_definition_index().values():
        if not bool(item.get('includeInAnalytics', False)):
            continue
        if active_only and not bool(item.get('isActive', True)):
            continue
        rows.append(item)
    rows.sort(key=lambda item: (int(item.get('sortOrder') or 0), (item.get('label') or ''), (item.get('key') or '')))
    return rows
