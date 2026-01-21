from __future__ import annotations

from datetime import date
from typing import Iterable

from django.db.models import Q

from assignments.models import Assignment


def _current_assignments_qs(person_id: int, on_date: date | None = None):
    if not person_id:
        return Assignment.objects.none()
    d = on_date or date.today()
    return (
        Assignment.objects.filter(person_id=person_id, is_active=True)
        .filter(project_id__isnull=False)
        .filter(Q(start_date__isnull=True) | Q(start_date__lte=d))
        .filter(Q(end_date__isnull=True) | Q(end_date__gte=d))
    )


def is_current_project_assignee(person_id: int, project_id: int, on_date: date | None = None) -> bool:
    if not person_id or not project_id:
        return False
    return _current_assignments_qs(person_id, on_date).filter(project_id=project_id).exists()


def current_project_ids(person_id: int, on_date: date | None = None) -> Iterable[int]:
    return _current_assignments_qs(person_id, on_date).values_list('project_id', flat=True)
