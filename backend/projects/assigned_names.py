"""Assigned names denormalization helpers for project search."""

from __future__ import annotations

from typing import Iterable, List

from django.db import transaction
from django.utils import timezone

from assignments.models import Assignment
from .models import Project


def compute_assigned_names(project_id: int) -> str:
    """Return a space-joined, de-duplicated list of active assignee names."""
    names = (
        Assignment.objects
        .filter(project_id=project_id, is_active=True, person__is_active=True)
        .select_related('person')
        .values_list('person__name', flat=True)
        .distinct()
    )
    # Sort for stability to avoid unnecessary updates
    sorted_names = sorted({n.strip() for n in names if n and str(n).strip()}, key=lambda v: v.lower())
    return ' '.join(sorted_names)


def rebuild_assigned_names_for_project(project_id: int) -> None:
    """Synchronously rebuild the assigned names text for a project."""
    try:
        text = compute_assigned_names(project_id)
        Project.objects.filter(id=project_id).update(assigned_names_text=text, updated_at=timezone.now())
    except Exception:
        # Non-fatal: search can fall back to project fields
        return


def rebuild_assigned_names_for_projects(project_ids: Iterable[int]) -> None:
    for pid in set(int(p) for p in project_ids if p):
        rebuild_assigned_names_for_project(pid)


def enqueue_assigned_names_rebuild(project_id: int) -> None:
    """Enqueue rebuild when async tasks are available; fallback to sync."""
    try:
        from .tasks import rebuild_project_assigned_names_task  # type: ignore
        if rebuild_project_assigned_names_task is not None:
            rebuild_project_assigned_names_task.delay(project_id)
            return
    except Exception:
        pass
    # Fallback synchronous path
    rebuild_assigned_names_for_project(project_id)


def enqueue_assigned_names_rebuild_many(project_ids: Iterable[int]) -> None:
    """Enqueue rebuild for multiple projects (best-effort)."""
    for pid in set(int(p) for p in project_ids if p):
        enqueue_assigned_names_rebuild(pid)


def enqueue_assigned_names_rebuild_on_commit(project_ids: Iterable[int]) -> None:
    """Enqueue rebuild after transaction commit to avoid stale reads."""
    ids = [int(p) for p in project_ids if p]
    if not ids:
        return
    transaction.on_commit(lambda: enqueue_assigned_names_rebuild_many(ids))
