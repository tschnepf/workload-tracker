from __future__ import annotations

from typing import Any, Dict, Optional

from django.contrib.auth import get_user_model

from .models import Project, ProjectChangeLog

UserModel = get_user_model()


def record_project_change(
    *,
    project: Project,
    actor: Optional[UserModel],
    action: str,
    detail: Optional[Dict[str, Any]] = None,
) -> None:
    """Best-effort project change log."""
    try:
        ProjectChangeLog.objects.create(
            project=project,
            actor=actor if getattr(actor, 'is_authenticated', False) else None,
            action=action,
            detail=detail or {},
        )
    except Exception:  # nosec B110
        # Non-blocking: logging must not fail request
        pass
