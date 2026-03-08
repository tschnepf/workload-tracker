from __future__ import annotations

from typing import Any

from accounts.permissions import is_admin_or_manager


def get_user_enforced_vertical_id(user: Any) -> int | None:
    """Return a fixed vertical id for regular users linked to a person department.

    Managers/admins are intentionally unrestricted and return None.
    """
    if not user or not getattr(user, 'is_authenticated', False):
        return None
    if is_admin_or_manager(user):
        return None

    cache_attr = '_enforced_vertical_id'
    try:
        if hasattr(user, cache_attr):
            return getattr(user, cache_attr)
    except Exception:
        pass

    vertical_id: int | None = None
    try:
        from accounts.models import UserProfile

        raw_vertical_id = (
            UserProfile.objects
            .filter(user_id=getattr(user, 'id', None))
            .values_list('person__department__vertical_id', flat=True)
            .first()
        )
        if raw_vertical_id is not None:
            parsed = int(raw_vertical_id)
            if parsed > 0:
                vertical_id = parsed
    except Exception:
        vertical_id = None

    try:
        setattr(user, cache_attr, vertical_id)
    except Exception:
        pass
    return vertical_id


def get_request_enforced_vertical_id(request: Any) -> int | None:
    user = getattr(request, 'user', None)
    return get_user_enforced_vertical_id(user)
