"""Helpers for automatic overhead assignments."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Sequence

from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

from assignments.models import Assignment
from people.models import Person
from projects.models import Project

OVERHEAD_TOKEN = "overhead"
DEFAULT_SYNC_WEEKS = 12
MAX_SYNC_WEEKS = 52
SYNC_CACHE_TTL_SECONDS = 300


@dataclass
class OverheadSyncResult:
    created: int = 0
    updated: int = 0
    skipped: int = 0
    people_count: int = 0
    project_count: int = 0
    week_count: int = 0


def _normalize_hours(value) -> float:
    try:
        return max(0.0, float(value or 0))
    except Exception:
        return 0.0


def _week_keys(weeks: int, start_date: date | None = None) -> list[str]:
    from core.week_utils import sunday_of_week

    weeks = max(1, min(int(weeks or DEFAULT_SYNC_WEEKS), MAX_SYNC_WEEKS))
    base = sunday_of_week(start_date or timezone.now().date())
    return [(base + timedelta(weeks=i)).isoformat() for i in range(weeks)]


def list_overhead_projects(project_qs=None):
    qs = project_qs or Project.objects.filter(is_active=True, name__icontains=OVERHEAD_TOKEN)
    return qs


def sync_overhead_assignments(
    *,
    people_qs=None,
    projects_qs=None,
    weeks: int = DEFAULT_SYNC_WEEKS,
) -> OverheadSyncResult:
    people = list(
        (people_qs or Person.objects.filter(is_active=True).select_related('role', 'department'))
    )
    projects = list(list_overhead_projects(projects_qs))

    result = OverheadSyncResult(
        people_count=len(people),
        project_count=len(projects),
        week_count=max(1, min(int(weeks or DEFAULT_SYNC_WEEKS), MAX_SYNC_WEEKS)),
    )

    if not people or not projects:
        return result

    week_keys = _week_keys(result.week_count)
    desired_hours_by_person = {
        p.id: _normalize_hours(getattr(p.role, 'overhead_hours_per_week', 0) if p.role_id else 0)
        for p in people
    }

    people_ids = [p.id for p in people]
    project_ids = [p.id for p in projects]

    with transaction.atomic():
        existing = list(
            Assignment.objects.select_for_update().filter(
                person_id__in=people_ids,
                project_id__in=project_ids,
            )
        )
        by_pair: dict[tuple[int, int], list[Assignment]] = {}
        for a in existing:
            key = (a.person_id, a.project_id)
            by_pair.setdefault(key, []).append(a)

        for person in people:
            desired_hours = desired_hours_by_person.get(person.id, 0.0)
            desired_weekly = {wk: desired_hours for wk in week_keys}
            for project in projects:
                key = (person.id, project.id)
                assignments = by_pair.get(key, [])
                if not assignments:
                    Assignment.objects.create(
                        person=person,
                        project=project,
                        weekly_hours=desired_weekly,
                        department=person.department,
                        is_active=True,
                    )
                    result.created += 1
                    continue

                for assignment in assignments:
                    changed = False
                    new_weekly = dict(assignment.weekly_hours or {})
                    for wk in week_keys:
                        if _normalize_hours(new_weekly.get(wk)) != desired_hours:
                            new_weekly[wk] = desired_hours
                            changed = True
                    if assignment.is_active is False:
                        assignment.is_active = True
                        changed = True
                    if assignment.department_id != getattr(person.department, 'id', None):
                        assignment.department = person.department
                        changed = True
                    if changed:
                        assignment.weekly_hours = new_weekly
                        assignment.save(update_fields=['weekly_hours', 'is_active', 'department', 'updated_at'])
                        result.updated += 1
                    else:
                        result.skipped += 1

    return result


def sync_overhead_assignments_for_people(person_ids: Sequence[int], weeks: int = DEFAULT_SYNC_WEEKS) -> OverheadSyncResult:
    if not person_ids:
        return OverheadSyncResult()
    people = Person.objects.filter(id__in=person_ids, is_active=True).select_related('role', 'department')
    return sync_overhead_assignments(people_qs=people, weeks=weeks)


def sync_overhead_assignments_for_roles(role_ids: Sequence[int], weeks: int = DEFAULT_SYNC_WEEKS) -> OverheadSyncResult:
    if not role_ids:
        return OverheadSyncResult()
    people = Person.objects.filter(role_id__in=role_ids, is_active=True).select_related('role', 'department')
    return sync_overhead_assignments(people_qs=people, weeks=weeks)


def sync_overhead_assignments_for_projects(project_ids: Sequence[int], weeks: int = DEFAULT_SYNC_WEEKS) -> OverheadSyncResult:
    if not project_ids:
        return OverheadSyncResult()
    projects = Project.objects.filter(id__in=project_ids, is_active=True, name__icontains=OVERHEAD_TOKEN)
    return sync_overhead_assignments(projects_qs=projects, weeks=weeks)


def maybe_sync_overhead_assignments(weeks: int = DEFAULT_SYNC_WEEKS, ttl_seconds: int = SYNC_CACHE_TTL_SECONDS) -> OverheadSyncResult:
    cache_key = f"overhead_assignment_sync:v1:w{max(1, min(int(weeks or DEFAULT_SYNC_WEEKS), MAX_SYNC_WEEKS))}"
    try:
        acquired = cache.add(cache_key, timezone.now().isoformat(), ttl_seconds)
    except Exception:
        acquired = True
    if not acquired:
        return OverheadSyncResult()
    return sync_overhead_assignments(weeks=weeks)
