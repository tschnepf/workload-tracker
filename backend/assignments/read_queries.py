from __future__ import annotations

from datetime import date, timedelta

from django.db.models import Sum

from assignments.models import AssignmentWeekHour
from core.week_utils import sunday_of_week


def build_grid_snapshot_payload_normalized(
    *,
    people_qs,
    weeks: int,
    vertical_id: int | None = None,
) -> dict:
    """Build grid snapshot payload from normalized week-hour rows."""
    start_sunday = sunday_of_week(date.today())
    week_dates = [start_sunday + timedelta(weeks=w) for w in range(max(1, int(weeks)))]
    week_keys = [wk.isoformat() for wk in week_dates]

    people_rows = list(
        people_qs.values('id', 'name', 'weekly_capacity', 'department_id').order_by('name', 'id')
    )
    person_ids = [row['id'] for row in people_rows]

    hours_by_person: dict[int, dict[str, float]] = {pid: {} for pid in person_ids}
    if person_ids:
        awh = AssignmentWeekHour.objects.filter(
            person_id__in=person_ids,
            assignment__is_active=True,
            week_start__in=week_dates,
        )
        if vertical_id is not None:
            awh = awh.filter(assignment__project__vertical_id=vertical_id)
        for row in (
            awh.values('person_id', 'week_start')
            .annotate(total_hours=Sum('hours'))
        ):
            person_id = int(row['person_id'])
            week_key = row['week_start'].isoformat()
            total = round(float(row.get('total_hours') or 0.0), 2)
            if total == 0.0:
                continue
            hours_by_person.setdefault(person_id, {})[week_key] = total

    return {
        'weekKeys': week_keys,
        'people': [
            {
                'id': row['id'],
                'name': row['name'],
                'weeklyCapacity': row.get('weekly_capacity') or 0,
                'department': row.get('department_id'),
            }
            for row in people_rows
        ],
        'hoursByPerson': hours_by_person,
    }
