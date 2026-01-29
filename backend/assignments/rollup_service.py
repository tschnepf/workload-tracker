from __future__ import annotations

from datetime import date
from typing import Iterable

from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

from .models import (
    Assignment,
    ProjectWeeklyHoursRollup,
    ProjectAssignmentCountsRollup,
)


def rebuild_project_rollups(project_ids: Iterable[int]) -> None:
    ids = sorted({int(pid) for pid in (project_ids or []) if pid})
    if not ids:
        return

    assignments = (
        Assignment.objects
        .filter(is_active=True, project_id__in=ids)
        .select_related('person')
        .only('id', 'project_id', 'person_id', 'department_id', 'weekly_hours', 'person__department_id')
    )

    hours_map: dict[tuple[int, int | None, date], tuple[float, float]] = {}
    people_sets: dict[tuple[int, int | None], set[int]] = {}
    placeholder_counts: dict[tuple[int, int | None], int] = {}

    for a in assignments.iterator():
        pid = a.project_id
        if pid is None:
            continue
        if a.person_id and not getattr(a.person, 'is_active', True):
            continue
        dept_id = a.person.department_id if a.person_id else a.department_id
        if dept_id is not None and dept_id <= 0:
            dept_id = None

        if a.person_id:
            people_sets.setdefault((pid, dept_id), set()).add(a.person_id)
        else:
            placeholder_counts[(pid, dept_id)] = placeholder_counts.get((pid, dept_id), 0) + 1

        weekly = a.weekly_hours or {}
        if not isinstance(weekly, dict):
            continue
        for wk_key, value in weekly.items():
            try:
                wk_date = date.fromisoformat(str(wk_key))
            except Exception:
                continue
            try:
                hours = float(value or 0)
            except Exception:
                hours = 0.0
            if hours <= 0:
                continue
            key = (pid, dept_id, wk_date)
            person_hours, placeholder_hours = hours_map.get(key, (0.0, 0.0))
            if a.person_id:
                person_hours += hours
            else:
                placeholder_hours += hours
            hours_map[key] = (person_hours, placeholder_hours)

    now = timezone.now()
    rollup_rows = [
        ProjectWeeklyHoursRollup(
            project_id=pid,
            department_id=dept_id,
            week_start=wk_date,
            person_hours=round(person_hours, 2),
            placeholder_hours=round(placeholder_hours, 2),
            updated_at=now,
        )
        for (pid, dept_id, wk_date), (person_hours, placeholder_hours) in hours_map.items()
    ]

    count_keys = set(people_sets.keys()) | set(placeholder_counts.keys())
    count_rows = [
        ProjectAssignmentCountsRollup(
            project_id=pid,
            department_id=dept_id,
            people_count=len(people_sets.get((pid, dept_id), set())),
            placeholder_count=int(placeholder_counts.get((pid, dept_id), 0)),
            updated_at=now,
        )
        for (pid, dept_id) in count_keys
    ]

    with transaction.atomic():
        ProjectWeeklyHoursRollup.objects.filter(project_id__in=ids).delete()
        ProjectAssignmentCountsRollup.objects.filter(project_id__in=ids).delete()
        if rollup_rows:
            ProjectWeeklyHoursRollup.objects.bulk_create(rollup_rows)
        if count_rows:
            ProjectAssignmentCountsRollup.objects.bulk_create(count_rows)


def queue_project_rollup_refresh(project_ids: Iterable[int]) -> None:
    ids = sorted({int(pid) for pid in (project_ids or []) if pid})
    if not ids:
        return

    pending: list[int] = []
    for pid in ids:
        key = f"rollup:refresh:{pid}"
        if cache.add(key, True, timeout=5):
            pending.append(pid)

    if not pending:
        return

    try:
        from assignments.tasks import refresh_project_rollups_task
        refresh_project_rollups_task.delay(pending)
    except Exception:
        rebuild_project_rollups(pending)
