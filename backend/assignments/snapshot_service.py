"""
Weekly assignment snapshot writer and membership events emitter.

Idempotent writer that upserts WeeklyAssignmentSnapshot rows for a given Sunday
week, and emits AssignmentMembershipEvent rows based on membership diffs.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Dict, Iterable, List, Optional, Tuple

from django.db import transaction, connection
from django.utils import timezone

from core.week_utils import sunday_of_week, get_week_value
from core.deliverable_phase import classify_week_for_project
from core.choices import SnapshotSource, DeliverablePhase

from .models import Assignment, WeeklyAssignmentSnapshot, AssignmentMembershipEvent
import logging
logger = logging.getLogger(__name__)


def _try_acquire_week_lock(week_key: str) -> bool:
    vendor = connection.vendor
    if vendor == 'postgresql':
        # Use advisory lock for this week key
        with connection.cursor() as cur:
            cur.execute("SELECT pg_try_advisory_lock(hashtext(%s))", [f"weekly_snapshot:{week_key}"])
            row = cur.fetchone()
            return bool(row and row[0])
    # Fallback: no lock mechanism for non-Postgres; allow run
    return True


def _release_week_lock(week_key: str) -> None:
    vendor = connection.vendor
    if vendor == 'postgresql':
        try:
            with connection.cursor() as cur:
                cur.execute("SELECT pg_advisory_unlock(hashtext(%s))", [f"weekly_snapshot:{week_key}"])
        except Exception:  # nosec B110
            # Best-effort unlock
            pass


def _load_deliverables_by_project(project_ids: List[int]) -> Dict[int, List[dict]]:
    if not project_ids:
        return {}
    from deliverables.models import Deliverable
    rows = list(
        Deliverable.objects
        .filter(project_id__in=project_ids)
        .values('project_id', 'percentage', 'description', 'date')
    )
    by_pid: Dict[int, List[dict]] = {}
    for r in rows:
        by_pid.setdefault(int(r['project_id']), []).append(r)
    return by_pid


def _round2(n: float) -> float:
    try:
        return round(float(n or 0.0), 2)
    except Exception:
        return 0.0


def _is_member_for_week(a: Assignment, week_start: date) -> bool:
    if not a.is_active:
        return False
    start_of_week = week_start
    end_of_week = week_start + timedelta(days=6)
    sd = getattr(a, 'start_date', None)
    ed = getattr(a, 'end_date', None)
    if sd and sd > end_of_week:
        return False
    if ed and ed < start_of_week:
        return False
    return True


def write_weekly_assignment_snapshots(week_start: date | str, *, source: str = SnapshotSource.ASSIGNED) -> dict:
    """Upsert snapshot rows and emit membership events for ``week_start``.

    Returns a summary dict with counts and lock status.
    """
    # Normalize week_start to Sunday string
    if isinstance(week_start, str):
        ws = date.fromisoformat(week_start)
    else:
        ws = week_start
    sunday = sunday_of_week(ws)
    week_key = sunday.isoformat()

    lock_acquired = _try_acquire_week_lock(week_key)
    if not lock_acquired:
        return {
            'week_start': week_key,
            'lock_acquired': False,
            'skipped_due_to_lock': True,
        }

    try:
        # Pull active assignments and prepare project list
        qs = (
            Assignment.objects
            .filter(is_active=True)
            .select_related('person', 'person__department', 'person__role', 'project')
        )
        examined = 0
        to_upsert: List[WeeklyAssignmentSnapshot] = []
        now = timezone.now()

        # Preload project deliverables for classification
        project_ids = list(
            {a.project_id for a in qs if getattr(a, 'project_id', None) is not None}
        )
        deliverables_by_pid = _load_deliverables_by_project(project_ids)

        for a in qs:
            examined += 1
            pid = a.project_id
            person_id = a.person_id
            if not pid or not person_id:
                continue  # skip rows without both FKs
            hours_val = float(get_week_value(a.weekly_hours or {}, sunday))
            if hours_val <= 0:
                # Only persist positive-hour rows to keep table compact
                continue

            proj = a.project
            person = a.person
            dept_id = getattr(person, 'department_id', None)
            role_id = getattr(a, 'role_on_project_ref_id', None)
            project_status = getattr(proj, 'status', None) or None
            # Classify deliverable phase for this week
            phase = classify_week_for_project(
                week_key,
                project_status,
                deliverables_by_pid.get(pid, []),
            )

            to_upsert.append(WeeklyAssignmentSnapshot(
                week_start=sunday,
                person_id=person_id,
                project_id=pid,
                role_on_project_id=role_id,
                department_id=dept_id,
                project_status=project_status,
                deliverable_phase=phase.value,
                hours=_round2(hours_val),
                source=source,
                person_name=getattr(person, 'name', '') or '',
                project_name=getattr(proj, 'name', '') or '',
                client=getattr(proj, 'client', '') or '',
                person_is_active=bool(getattr(person, 'is_active', True)),
                person_role_id=getattr(person, 'role_id', None),
                person_role_name=getattr(getattr(person, 'role', None), 'name', '') or '',
                updated_at=now,
            ))

        inserted = 0
        updated = 0
        # Perform batched transactional upserts
        if to_upsert:
            with transaction.atomic():
                res = WeeklyAssignmentSnapshot.objects.bulk_create(
                    to_upsert,
                    update_conflicts=True,
                    update_fields=[
                        'hours', 'project_status', 'deliverable_phase', 'department_id',
                        'person_name', 'project_name', 'client',
                        'person_is_active', 'person_role_id', 'person_role_name',
                        'updated_at'
                    ],
                    unique_fields=['person', 'project', 'role_on_project_id', 'week_start', 'source']
                )
                # Django cannot distinguish inserted vs updated from bulk_create result portably.
                # As a pragmatic approach, perform a lightweight count query for distinct keys
                # to estimate inserts. This avoids per-row updates.
                keys = [
                    (r.person_id, r.project_id, r.role_on_project_id, r.week_start, r.source)
                    for r in to_upsert
                ]
                # Count how many of these keys existed before the upsert
                existing = set(
                    WeeklyAssignmentSnapshot.objects.filter(
                        person_id__in=[k[0] for k in keys],
                        project_id__in=[k[1] for k in keys],
                        week_start=sunday,
                        source=source,
                    ).values_list('person_id', 'project_id', 'role_on_project_id', 'week_start', 'source')
                )
                updated = len(existing)
                inserted = max(0, len(to_upsert) - updated)

        # Emit membership events
        events_inserted = _emit_membership_events(sunday, deliverables_by_pid)

        summary = {
            'week_start': week_key,
            'lock_acquired': True,
            'examined': examined,
            'inserted': inserted,
            'updated': updated,
            'skipped': examined - inserted - updated,
            'events_inserted': events_inserted,
        }
        try:
            logger.info('weekly_snapshots.write', extra={
                'week_start': week_key,
                'examined': examined,
                'inserted': inserted,
                'updated': updated,
                'events_inserted': events_inserted,
            })
        except Exception:  # nosec B110
            pass
        return summary
    finally:
        _release_week_lock(week_key)


def _emit_membership_events(week_start: date, deliverables_by_pid: Dict[int, List[dict]]) -> int:
    """Emit joined/left events comparing current vs prior week memberships.

    Membership is defined by the existence of an active assignment overlapping
    the week window, independent of hours.
    """
    prior_week = week_start - timedelta(days=7)
    # Build membership sets
    current_qs = (
        Assignment.objects.filter(is_active=True)
        .select_related('person', 'project')
    )
    prior_qs = current_qs  # same filter; membership window check differs per row

    current_members: Dict[Tuple[int, int, Optional[int]], Assignment] = {}
    prior_members: Dict[Tuple[int, int, Optional[int]], Assignment] = {}

    for a in current_qs:
        if a.project_id and a.person_id and _is_member_for_week(a, week_start):
            current_members[(a.person_id, a.project_id, getattr(a, 'role_on_project_ref_id', None))] = a
    for a in prior_qs:
        if a.project_id and a.person_id and _is_member_for_week(a, prior_week):
            prior_members[(a.person_id, a.project_id, getattr(a, 'role_on_project_ref_id', None))] = a

    joined_keys = set(current_members.keys()) - set(prior_members.keys())
    left_keys = set(prior_members.keys()) - set(current_members.keys())

    if not joined_keys and not left_keys:
        return 0

    # Prepare rows
    rows: List[AssignmentMembershipEvent] = []
    now = timezone.now()
    for key in sorted(joined_keys):
        a = current_members[key]
        person_id, project_id, role_id = key
        person = a.person
        project = a.project
        # Hours context
        h_before = float(get_week_value(a.weekly_hours or {}, prior_week))
        h_after = float(get_week_value(a.weekly_hours or {}, week_start))
        phase = classify_week_for_project(
            week_start.isoformat(),
            getattr(project, 'status', None) or None,
            deliverables_by_pid.get(project_id, []),
        )
        rows.append(AssignmentMembershipEvent(
            week_start=week_start,
            person_id=person_id,
            project_id=project_id,
            role_on_project_id=role_id,
            event_type='joined',
            deliverable_phase=phase.value,
            hours_before=_round2(h_before),
            hours_after=_round2(h_after),
            person_name=getattr(person, 'name', '') or '',
            project_name=getattr(project, 'name', '') or '',
            client=getattr(project, 'client', '') or '',
            updated_at=now,
        ))

    for key in sorted(left_keys):
        a = prior_members[key]
        person_id, project_id, role_id = key
        person = a.person
        project = a.project
        h_before = float(get_week_value(a.weekly_hours or {}, prior_week))
        phase = classify_week_for_project(
            week_start.isoformat(),
            getattr(project, 'status', None) or None,
            deliverables_by_pid.get(project_id, []),
        )
        rows.append(AssignmentMembershipEvent(
            week_start=week_start,
            person_id=person_id,
            project_id=project_id,
            role_on_project_id=role_id,
            event_type='left',
            deliverable_phase=phase.value,
            hours_before=_round2(h_before),
            hours_after=0.0,
            person_name=getattr(person, 'name', '') or '',
            project_name=getattr(project, 'name', '') or '',
            client=getattr(project, 'client', '') or '',
            updated_at=now,
        ))

    if not rows:
        return 0

    # Insert events; on conflict, do nothing
    res = AssignmentMembershipEvent.objects.bulk_create(rows, ignore_conflicts=True)
    return len(res)


def backfill_weekly_assignment_snapshots(week_start: date | str, *, emit_events: bool = False, force: bool = False) -> dict:
    """Backfill snapshot rows for a given week with source='assigned_backfill'.

    - Does not overwrite existing rows unless force=True.
    - Does not emit events unless emit_events=True.
    """
    # Normalize
    if isinstance(week_start, str):
        ws = date.fromisoformat(week_start)
    else:
        ws = week_start
    sunday = sunday_of_week(ws)
    week_key = sunday.isoformat()

    lock_acquired = _try_acquire_week_lock(week_key)
    if not lock_acquired:
        return {
            'week_start': week_key,
            'lock_acquired': False,
            'skipped_due_to_lock': True,
        }
    try:
        qs = (
            Assignment.objects
            .filter(is_active=True)
            .select_related('person', 'person__department', 'person__role', 'project')
        )
        examined = 0
        rows: List[WeeklyAssignmentSnapshot] = []
        now = timezone.now()
        project_ids = list({a.project_id for a in qs if getattr(a, 'project_id', None) is not None})
        deliverables_by_pid = _load_deliverables_by_project(project_ids)

        for a in qs:
            examined += 1
            pid = a.project_id
            person_id = a.person_id
            if not pid or not person_id:
                continue
            hours_val = float(get_week_value(a.weekly_hours or {}, sunday))
            if hours_val <= 0:
                continue
            proj = a.project
            person = a.person
            dept_id = getattr(person, 'department_id', None)
            role_id = getattr(a, 'role_on_project_ref_id', None)
            project_status = getattr(proj, 'status', None) or None
            phase = classify_week_for_project(week_key, project_status, deliverables_by_pid.get(pid, []))
            rows.append(WeeklyAssignmentSnapshot(
                week_start=sunday,
                person_id=person_id,
                project_id=pid,
                role_on_project_id=role_id,
                department_id=dept_id,
                project_status=project_status,
                deliverable_phase=phase.value,
                hours=_round2(hours_val),
                source=SnapshotSource.ASSIGNED_BACKFILL,
                person_name=getattr(person, 'name', '') or '',
                project_name=getattr(proj, 'name', '') or '',
                client=getattr(proj, 'client', '') or '',
                person_is_active=bool(getattr(person, 'is_active', True)),
                person_role_id=getattr(person, 'role_id', None),
                person_role_name=getattr(getattr(person, 'role', None), 'name', '') or '',
                updated_at=now,
            ))

        inserted = 0
        updated = 0
        if rows:
            with transaction.atomic():
                if force:
                    WeeklyAssignmentSnapshot.objects.bulk_create(
                        rows,
                        update_conflicts=True,
                        update_fields=['hours', 'project_status', 'deliverable_phase', 'department_id', 'person_name', 'project_name', 'client', 'person_is_active', 'person_role_id', 'person_role_name', 'updated_at'],
                        unique_fields=['person', 'project', 'role_on_project_id', 'week_start', 'source']
                    )
                else:
                    res = WeeklyAssignmentSnapshot.objects.bulk_create(rows, ignore_conflicts=True)
                    inserted = len(res)
        events_inserted = 0
        if emit_events:
            events_inserted = _emit_membership_events(sunday, deliverables_by_pid)

        summary = {
            'week_start': week_key,
            'lock_acquired': True,
            'examined': examined,
            'inserted': inserted,
            'updated': updated,
            'skipped': examined - inserted - updated,
            'events_inserted': events_inserted,
        }
        try:
            logger.info('weekly_snapshots.backfill', extra={
                'week_start': week_key,
                'examined': examined,
                'inserted': inserted,
                'updated': updated,
                'events_inserted': events_inserted,
                'force': force,
                'emit_events': emit_events,
            })
        except Exception:  # nosec B110
            pass
        return summary
    finally:
        _release_week_lock(week_key)
