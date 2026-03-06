from __future__ import annotations

from copy import deepcopy
from typing import Any

EVENT_CATALOG = [
    {
        'key': 'pred.reminder',
        'label': 'Pre-deliverable reminder',
        'description': 'Reminder for upcoming pre-deliverable work.',
    },
    {
        'key': 'pred.digest',
        'label': 'Daily digest',
        'description': 'Daily summary of your relevant pre-deliverables.',
    },
    {
        'key': 'assignment.created',
        'label': 'Assignment created',
        'description': 'A new assignment was created for your linked person.',
    },
    {
        'key': 'assignment.removed',
        'label': 'Assignment removed',
        'description': 'An assignment was removed for your linked person.',
    },
    {
        'key': 'assignment.bulk_updated',
        'label': 'Assignment bulk updated',
        'description': 'Bulk assignment updates affected your linked person.',
    },
    {
        'key': 'deliverable.reminder',
        'label': 'Deliverable reminder',
        'description': 'Reminder for upcoming deliverables on your assigned projects.',
    },
    {
        'key': 'deliverable.date_changed',
        'label': 'Deliverable date changed',
        'description': 'A project deliverable date changed for an assigned project.',
    },
]

EVENT_KEYS = tuple(item['key'] for item in EVENT_CATALOG)
ASSIGNMENT_EVENT_KEYS = (
    'assignment.created',
    'assignment.removed',
    'assignment.bulk_updated',
)
CHANNEL_KEYS = ('mobilePush', 'email', 'inBrowser')


def default_notification_channel_matrix() -> dict[str, dict[str, bool]]:
    """Global/default availability matrix (all channels available)."""
    return {
        event_key: {
            'mobilePush': True,
            'email': True,
            'inBrowser': True,
        }
        for event_key in EVENT_KEYS
    }


def default_user_notification_channel_matrix() -> dict[str, dict[str, bool]]:
    """User-level defaults: push/email opt-in, in-browser enabled."""
    return {
        event_key: {
            'mobilePush': False,
            'email': False,
            'inBrowser': True,
        }
        for event_key in EVENT_KEYS
    }


def _bool(value: Any, default: bool = True) -> bool:
    if value is None:
        return bool(default)
    return bool(value)


def normalize_notification_channel_matrix(
    raw: Any,
    *,
    fallback: dict[str, dict[str, bool]] | None = None,
) -> dict[str, dict[str, bool]]:
    base = deepcopy(fallback) if isinstance(fallback, dict) else default_notification_channel_matrix()

    if not isinstance(raw, dict):
        return base

    for event_key in EVENT_KEYS:
        row_raw = raw.get(event_key)
        if not isinstance(row_raw, dict):
            continue
        current = base.get(event_key) or {'mobilePush': True, 'email': True, 'inBrowser': True}
        current['mobilePush'] = _bool(row_raw.get('mobilePush'), current.get('mobilePush', True))
        current['email'] = _bool(row_raw.get('email'), current.get('email', True))
        current['inBrowser'] = _bool(row_raw.get('inBrowser'), current.get('inBrowser', True))
        base[event_key] = current

    return base


def legacy_user_matrix_from_preference(pref: Any | None) -> dict[str, dict[str, bool]]:
    matrix = default_user_notification_channel_matrix()

    if pref is None:
        return matrix

    push_pred = bool(getattr(pref, 'push_pre_deliverable_reminders', True))
    push_digest = bool(getattr(pref, 'push_daily_digest', False))
    push_assignment = bool(getattr(pref, 'push_assignment_changes', True))
    push_deliverable = bool(getattr(pref, 'push_deliverable_date_changes', True))

    email_pred = bool(getattr(pref, 'email_pre_deliverable_reminders', True))
    email_digest = bool(getattr(pref, 'daily_digest', False))

    matrix['pred.reminder']['mobilePush'] = push_pred
    matrix['pred.digest']['mobilePush'] = push_digest
    matrix['deliverable.date_changed']['mobilePush'] = push_deliverable
    for event_key in ASSIGNMENT_EVENT_KEYS:
        matrix[event_key]['mobilePush'] = push_assignment

    matrix['pred.reminder']['email'] = email_pred
    matrix['pred.digest']['email'] = email_digest

    return matrix


def legacy_global_matrix_from_settings(settings_obj: Any | None) -> dict[str, dict[str, bool]]:
    matrix = default_notification_channel_matrix()
    if settings_obj is None:
        return matrix

    pred_push = bool(getattr(settings_obj, 'push_pre_deliverable_reminders_enabled', True))
    digest_push = bool(getattr(settings_obj, 'push_daily_digest_enabled', True))
    assignment_push = bool(getattr(settings_obj, 'push_assignment_changes_enabled', True))
    deliverable_push = bool(getattr(settings_obj, 'push_deliverable_date_changes_enabled', True))

    matrix['pred.reminder']['mobilePush'] = pred_push
    matrix['pred.digest']['mobilePush'] = digest_push
    matrix['deliverable.date_changed']['mobilePush'] = deliverable_push
    for event_key in ASSIGNMENT_EVENT_KEYS:
        matrix[event_key]['mobilePush'] = assignment_push

    return matrix


def catalog_payload() -> list[dict[str, Any]]:
    payload: list[dict[str, Any]] = []
    for item in EVENT_CATALOG:
        payload.append(
            {
                'key': item['key'],
                'label': item['label'],
                'description': item['description'],
                'supports': {
                    'mobilePush': True,
                    'email': True,
                    'inBrowser': True,
                },
            }
        )
    return payload


def effective_channel_availability(
    global_matrix: dict[str, dict[str, bool]],
    *,
    mobile_push_globally_enabled: bool,
) -> dict[str, dict[str, bool]]:
    normalized_global = normalize_notification_channel_matrix(global_matrix)
    availability = default_notification_channel_matrix()

    for event_key in EVENT_KEYS:
        row = normalized_global[event_key]
        availability[event_key] = {
            'mobilePush': bool(mobile_push_globally_enabled and row.get('mobilePush', True)),
            'email': bool(row.get('email', True)),
            'inBrowser': bool(row.get('inBrowser', True)),
        }

    return availability


def apply_availability(
    user_matrix: dict[str, dict[str, bool]],
    availability: dict[str, dict[str, bool]],
) -> dict[str, dict[str, bool]]:
    matrix = normalize_notification_channel_matrix(
        user_matrix,
        fallback=default_user_notification_channel_matrix(),
    )
    normalized_availability = normalize_notification_channel_matrix(
        availability,
        fallback=default_notification_channel_matrix(),
    )
    for event_key in EVENT_KEYS:
        matrix[event_key] = {
            'mobilePush': bool(matrix[event_key]['mobilePush'] and normalized_availability[event_key]['mobilePush']),
            'email': bool(matrix[event_key]['email'] and normalized_availability[event_key]['email']),
            'inBrowser': bool(matrix[event_key]['inBrowser'] and normalized_availability[event_key]['inBrowser']),
        }
    return matrix


def user_legacy_fields_from_matrix(matrix: dict[str, dict[str, bool]]) -> dict[str, bool]:
    normalized = normalize_notification_channel_matrix(
        matrix,
        fallback=default_user_notification_channel_matrix(),
    )
    assignment_mobile_enabled = any(
        bool(normalized[event_key]['mobilePush']) for event_key in ASSIGNMENT_EVENT_KEYS
    )

    return {
        'email_pre_deliverable_reminders': bool(normalized['pred.reminder']['email']),
        'daily_digest': bool(normalized['pred.digest']['email']),
        'push_pre_deliverable_reminders': bool(normalized['pred.reminder']['mobilePush']),
        'push_daily_digest': bool(normalized['pred.digest']['mobilePush']),
        'push_assignment_changes': assignment_mobile_enabled,
        'push_deliverable_date_changes': bool(normalized['deliverable.date_changed']['mobilePush']),
    }


def global_legacy_push_fields_from_matrix(matrix: dict[str, dict[str, bool]]) -> dict[str, bool]:
    normalized = normalize_notification_channel_matrix(matrix)
    assignment_mobile_enabled = any(
        bool(normalized[event_key]['mobilePush']) for event_key in ASSIGNMENT_EVENT_KEYS
    )
    return {
        'push_pre_deliverable_reminders_enabled': bool(normalized['pred.reminder']['mobilePush']),
        'push_daily_digest_enabled': bool(normalized['pred.digest']['mobilePush']),
        'push_assignment_changes_enabled': assignment_mobile_enabled,
        'push_deliverable_date_changes_enabled': bool(normalized['deliverable.date_changed']['mobilePush']),
    }
