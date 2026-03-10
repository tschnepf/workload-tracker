from __future__ import annotations

from datetime import date, timedelta

from django.db import migrations


def _first_eligible_week_start(hire_date: date | None) -> date | None:
    if hire_date is None:
        return None
    days_since_sunday = (hire_date.weekday() + 1) % 7
    return hire_date - timedelta(days=days_since_sunday)


def _remove_prehire_weekly_hours(apps, schema_editor):
    db_alias = schema_editor.connection.alias
    Assignment = apps.get_model('assignments', 'Assignment')
    AssignmentWeekHour = apps.get_model('assignments', 'AssignmentWeekHour')
    Person = apps.get_model('people', 'Person')

    first_week_by_person: dict[int, date] = {}
    for person_id, hire_date in (
        Person.objects.using(db_alias)
        .filter(hire_date__isnull=False)
        .values_list('id', 'hire_date')
        .iterator(chunk_size=1000)
    ):
        first_week = _first_eligible_week_start(hire_date)
        if first_week is not None:
            first_week_by_person[int(person_id)] = first_week

    if not first_week_by_person:
        return

    updated_assignments = 0
    removed_entries = 0
    person_ids = list(first_week_by_person.keys())
    assignment_qs = (
        Assignment.objects.using(db_alias)
        .filter(person_id__in=person_ids)
        .only('id', 'person_id', 'weekly_hours')
    )

    for assignment in assignment_qs.iterator(chunk_size=500):
        first_eligible_week = first_week_by_person.get(int(assignment.person_id or 0))
        if first_eligible_week is None:
            continue

        existing = assignment.weekly_hours if isinstance(assignment.weekly_hours, dict) else {}
        if not existing:
            continue

        updated_map = dict(existing)
        removed_week_starts: list[date] = []

        for raw_week_key, raw_hours in existing.items():
            week_key = str(raw_week_key)
            try:
                week_start = date.fromisoformat(week_key)
            except Exception:
                continue
            try:
                hours = float(raw_hours or 0.0)
            except Exception:
                continue
            if hours == 0.0:
                continue
            if week_start < first_eligible_week:
                updated_map.pop(raw_week_key, None)
                if raw_week_key != week_key:
                    updated_map.pop(week_key, None)
                removed_week_starts.append(week_start)

        if not removed_week_starts:
            continue

        assignment.weekly_hours = updated_map
        if hasattr(assignment, 'updated_at'):
            assignment.save(update_fields=['weekly_hours', 'updated_at'])
        else:
            assignment.save(update_fields=['weekly_hours'])

        AssignmentWeekHour.objects.using(db_alias).filter(
            assignment_id=assignment.id,
            week_start__in=sorted(set(removed_week_starts)),
        ).delete()

        updated_assignments += 1
        removed_entries += len(removed_week_starts)

    print(
        f"[assignments.0020] Removed {removed_entries} pre-hire weekly_hours entries "
        f"across {updated_assignments} assignments."
    )


def _noop_reverse(apps, schema_editor):
    return


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ('people', '0010_restore_search_indexes'),
        ('assignments', '0019_alter_projectweeklyhoursrollup_person_hours_and_more'),
    ]

    operations = [
        migrations.RunPython(_remove_prehire_weekly_hours, _noop_reverse),
    ]
