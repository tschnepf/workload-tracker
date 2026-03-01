from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Iterable

from django.db import transaction

from assignments.models import Assignment, AssignmentWeekHour
from core.week_utils import sunday_of_week


@dataclass
class ParityResult:
    assignment_id: int
    json_map: dict[str, float]
    normalized_map: dict[str, float]
    matches: bool


def _to_sunday_key(raw_key: str) -> str:
    parsed = datetime.strptime(str(raw_key), "%Y-%m-%d").date()
    return sunday_of_week(parsed).isoformat()


def _to_hours(value) -> float:
    return round(float(value or 0.0), 4)


def normalize_weekly_hours_map(raw_map: dict | None) -> dict[str, float]:
    """Normalize incoming map to canonical Sunday keys with non-negative float hours."""
    if not isinstance(raw_map, dict):
        return {}
    normalized: dict[str, float] = {}
    for raw_key, raw_hours in raw_map.items():
        try:
            sunday_key = _to_sunday_key(str(raw_key))
            hours = _to_hours(raw_hours)
        except Exception:
            continue
        if hours < 0:
            continue
        if hours == 0:
            # Preserve explicit zero only if key already exists.
            normalized.setdefault(sunday_key, 0.0)
            continue
        normalized[sunday_key] = round(normalized.get(sunday_key, 0.0) + hours, 4)
    return normalized


def normalize_map_from_rows(rows: Iterable[AssignmentWeekHour]) -> dict[str, float]:
    out: dict[str, float] = {}
    for row in rows:
        key = row.week_start.isoformat()
        out[key] = round(out.get(key, 0.0) + _to_hours(row.hours), 4)
    return out


def sync_assignment_week_hours(
    assignment: Assignment,
    weekly_hours_map: dict | None = None,
    *,
    clear_missing: bool = True,
) -> dict[str, float]:
    """Upsert normalized week-hour rows for one assignment.

    Returns the normalized map actually persisted.
    """
    normalized = normalize_weekly_hours_map(weekly_hours_map if weekly_hours_map is not None else assignment.weekly_hours)
    assignment_id = int(assignment.id)

    with transaction.atomic():
        existing = {
            row.week_start.isoformat(): row
            for row in AssignmentWeekHour.objects.filter(assignment_id=assignment_id)
        }
        touched_keys = set()
        to_create: list[AssignmentWeekHour] = []
        to_update: list[AssignmentWeekHour] = []
        for week_key, hours in normalized.items():
            touched_keys.add(week_key)
            week_date = date.fromisoformat(week_key)
            current = existing.get(week_key)
            if current is None:
                to_create.append(
                    AssignmentWeekHour(
                        assignment_id=assignment_id,
                        person_id=assignment.person_id,
                        project_id=assignment.project_id,
                        department_id=assignment.department_id,
                        week_start=week_date,
                        hours=hours,
                    )
                )
                continue
            if round(float(current.hours or 0.0), 4) != hours or (
                current.person_id != assignment.person_id
                or current.project_id != assignment.project_id
                or current.department_id != assignment.department_id
            ):
                current.hours = hours
                current.person_id = assignment.person_id
                current.project_id = assignment.project_id
                current.department_id = assignment.department_id
                to_update.append(current)

        if clear_missing:
            stale_keys = [k for k in existing.keys() if k not in touched_keys]
            if stale_keys:
                AssignmentWeekHour.objects.filter(
                    assignment_id=assignment_id,
                    week_start__in=[date.fromisoformat(k) for k in stale_keys],
                ).delete()

        if to_create:
            AssignmentWeekHour.objects.bulk_create(to_create, batch_size=500)
        if to_update:
            AssignmentWeekHour.objects.bulk_update(
                to_update,
                fields=['hours', 'person', 'project', 'department', 'updated_at'],
                batch_size=500,
            )
    return normalized


def sync_assignment_week_hours_queryset(assignments: Iterable[Assignment], *, clear_missing: bool = True) -> int:
    count = 0
    for assignment in assignments:
        if not getattr(assignment, 'id', None):
            continue
        sync_assignment_week_hours(assignment, clear_missing=clear_missing)
        count += 1
    return count


def parity_for_assignment(assignment: Assignment) -> ParityResult:
    json_map = normalize_weekly_hours_map(assignment.weekly_hours)
    rows = AssignmentWeekHour.objects.filter(assignment_id=assignment.id)
    normalized_map = normalize_map_from_rows(rows)
    return ParityResult(
        assignment_id=assignment.id,
        json_map=json_map,
        normalized_map=normalized_map,
        matches=json_map == normalized_map,
    )
