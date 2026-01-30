"""
Celery background tasks for heavy aggregations.
"""
from __future__ import annotations

from typing import Dict, List, Any, Optional
from datetime import date, timedelta

from celery import shared_task
import os
from django.db.models import Prefetch


@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=2, retry_kwargs={"max_retries": 3}, soft_time_limit=120)
def generate_grid_snapshot_async(self, weeks: int = 12, department: Optional[int] = None, include_children: int = 0) -> Dict[str, Any]:
    """Generate the same payload as /assignments/grid_snapshot/ in the background.

    Returns a dict with keys: { weekKeys, people, hoursByPerson }.
    """
    from people.models import Person  # local import for task autodiscovery safety
    from departments.models import Department
    from assignments.models import Assignment

    # clamp weeks 1..52
    weeks = max(1, min(int(weeks or 12), 52))

    people_qs = Person.objects.filter(is_active=True).select_related('department')
    if department is not None:
        try:
            dept_id = int(department)
        except Exception:
            dept_id = None
        if dept_id is not None:
            if int(include_children or 0) == 1:
                ids = set()
                stack = [dept_id]
                while stack:
                    current = stack.pop()
                    if current in ids:
                        continue
                    ids.add(current)
                    for d in Department.objects.filter(parent_department_id=current).values_list('id', flat=True):
                        if d not in ids:
                            stack.append(d)
                people_qs = people_qs.filter(department_id__in=list(ids))
            else:
                people_qs = people_qs.filter(department_id=dept_id)

    asn_qs = Assignment.objects.filter(is_active=True).only('weekly_hours', 'person_id')
    people_qs = people_qs.prefetch_related(Prefetch('assignments', queryset=asn_qs))

    # Sundays for requested horizon (Sunday-only policy)
    from core.week_utils import sunday_of_week
    today = date.today()
    start_sunday = sunday_of_week(today)
    week_keys = [(start_sunday + timedelta(weeks=w)).isoformat() for w in range(weeks)]

    # helper: tolerate +/- 3 days against provided Monday key
    def hours_for_week_from_json(weekly_hours: dict, sunday_key: str) -> float:
        if not weekly_hours:
            return 0.0
        try:
            return float(weekly_hours.get(sunday_key) or 0)
        except Exception:
            return 0.0

    total = max(1, people_qs.count())
    processed = 0

    people_list: List[Dict[str, Any]] = []
    hours_by_person: Dict[int, Dict[str, float]] = {}

    try:
        for p in people_qs.iterator():
            people_list.append({
                'id': p.id,
                'name': p.name,
                'weeklyCapacity': p.weekly_capacity or 0,
                'department': p.department_id,
            })
            wk_map: Dict[str, float] = {}
            for wk in week_keys:
                wk_total = 0.0
                for a in getattr(p, 'assignments').all():
                    wk_total += hours_for_week_from_json(a.weekly_hours or {}, wk)
                if wk_total != 0.0:
                    wk_map[wk] = round(wk_total, 2)
            hours_by_person[p.id] = wk_map

            processed += 1
            if processed % 25 == 0 or processed == total:
                try:
                    self.update_state(state='PROGRESS', meta={'progress': int(processed * 100 / total), 'message': f'Processed {processed}/{total} people'})
                except Exception:  # nosec B110
                    pass
    except Exception as e:
        try:
            import sentry_sdk  # type: ignore
            sentry_sdk.capture_exception(e)
        except Exception:  # nosec B110
            pass
        raise

    return {'weekKeys': week_keys, 'people': people_list, 'hoursByPerson': hours_by_person}


@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=2, retry_kwargs={"max_retries": 3}, soft_time_limit=120)
def bulk_skill_matching_async(self, skills: List[str], filters: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Run skill matching in the background with optional availability blending.

    filters may include: department (int), include_children (0|1), limit (int up to 200), week (YYYY-MM-DD).
    """
    from people.models import Person
    from skills.models import PersonSkill, SkillTag
    from assignments.models import Assignment
    from departments.models import Department
    from datetime import datetime as _dt, timedelta as _td

    req_skills = [s.strip().lower() for s in (skills or []) if s and s.strip()]
    if not req_skills:
        return []

    limit = int(filters.get('limit', 50))
    limit = 50 if limit <= 0 else min(limit, 200)

    week_monday = None
    if filters.get('week'):
        try:
            d = _dt.strptime(str(filters['week']), '%Y-%m-%d').date()
            week_monday = d - _td(days=d.weekday())
        except Exception:
            week_monday = None

    people_qs = Person.objects.filter(is_active=True).select_related('department', 'role')
    dept_param = filters.get('department')
    include_children = int(filters.get('include_children') or 0) == 1
    if dept_param not in (None, ""):
        try:
            dept_id = int(dept_param)
            if include_children:
                ids = set()
                stack = [dept_id]
                while stack:
                    current = stack.pop()
                    if current in ids:
                        continue
                    ids.add(current)
                    for d in Department.objects.filter(parent_department_id=current).values_list('id', flat=True):
                        if d not in ids:
                            stack.append(d)
                people_qs = people_qs.filter(department_id__in=list(ids))
            else:
                people_qs = people_qs.filter(department_id=dept_id)
        except Exception:  # nosec B110
            pass

    skill_qs = PersonSkill.objects.select_related('skill_tag')
    prefetches = [Prefetch('skills', queryset=skill_qs)]
    if week_monday is not None:
        asn_qs = Assignment.objects.filter(is_active=True).only('weekly_hours', 'person_id')
        prefetches.append(Prefetch('assignments', queryset=asn_qs))
    people_qs = people_qs.prefetch_related(*prefetches)

    results: List[Dict[str, Any]] = []
    total = max(1, people_qs.count())
    processed = 0
    try:
        for p in people_qs.iterator():
            # skills names lower
            skill_names: List[str] = []
            for ps in getattr(p, 'skills').all():
                if ps.skill_tag and ps.skill_tag.name:
                    skill_names.append(ps.skill_tag.name.lower())

            matched: List[str] = []
            missing: List[str] = []
            for rs in req_skills:
                ok = any((rs in sn) or (sn in rs) for sn in skill_names)
                (matched if ok else missing).append(rs)

            base_score = (len(matched) / len(req_skills)) * 100.0 if req_skills else 0.0

            if week_monday is not None:
                cap = float(p.weekly_capacity or 0)
                if cap > 0:
                    wk_key = week_monday.strftime('%Y-%m-%d')
                    allocated = 0.0
                    for a in getattr(p, 'assignments').all():
                        wh = a.weekly_hours or {}
                        val = 0.0
                        if wk_key in wh:
                            try:
                                val = float(wh[wk_key] or 0)
                            except Exception:
                                val = 0.0
                        else:
                            for off in range(-3, 4):
                                d = week_monday + _td(days=off)
                                k = d.strftime('%Y-%m-%d')
                                if k in wh:
                                    try:
                                        val = float(wh[k] or 0)
                                    except Exception:
                                        val = 0.0
                                    break
                        allocated += val
                    avail_pct = max(0.0, (cap - allocated) / cap * 100.0)
                    base_score = 0.7 * base_score + 0.3 * avail_pct

            results.append({
                'personId': p.id,
                'name': p.name,
                'score': round(base_score, 1),
                'matchedSkills': matched,
                'missingSkills': missing,
                'departmentId': p.department_id,
                'roleName': getattr(p.role, 'name', None) if getattr(p, 'role', None) else None,
            })

            processed += 1
            if processed % 50 == 0 or processed == total:
                try:
                    self.update_state(state='PROGRESS', meta={'progress': int(processed * 100 / total)})
                except Exception:  # nosec B110
                    pass
    except Exception as e:
        try:
            import sentry_sdk  # type: ignore
            sentry_sdk.capture_exception(e)
        except Exception:  # nosec B110
            pass
        raise

    results.sort(key=lambda x: (-x['score'], x['name']))
    return results[:limit]


@shared_task(bind=True, soft_time_limit=120)
def send_pre_deliverable_reminders(self):
    # Gated by env flags
    if os.getenv('PRED_ITEMS_NOTIFICATIONS_ENABLED', 'false').lower() != 'true':
        return {'sent': 0}
    from core.models import NotificationPreference, NotificationLog
    from deliverables.services import PreDeliverableService
    from django.core.mail import send_mail
    from datetime import date as _date
    sent = 0
    for pref in NotificationPreference.objects.select_related('user'):
        if not pref.email_pre_deliverable_reminders:
            continue
        upcoming = PreDeliverableService.get_upcoming_for_user(pref.user, days_ahead=max(0, int(pref.reminder_days_before or 1)))
        for it in upcoming:
            subject = f"Reminder: {getattr(it.pre_deliverable_type, 'name', 'Pre-Deliverable')} ({it.generated_date})"
            body = f"Project: {getattr(it.deliverable.project, 'name', '')}\nDeliverable: {it.deliverable.description or 'Milestone'}\nDue: {it.generated_date}"
            ok = True
            try:
                if pref.user.email:
                    send_mail(subject, body, None, [pref.user.email])
                    sent += 1
            except Exception:
                ok = False
            NotificationLog.objects.create(user=pref.user, pre_deliverable_item=it, notification_type='reminder', sent_at=_date.today(), email_subject=subject, success=ok)
    return {'sent': sent}


@shared_task(bind=True, soft_time_limit=120)
def send_daily_digest(self):
    if os.getenv('PRED_ITEMS_DIGEST_ENABLED', 'false').lower() != 'true':
        return {'sent': 0}
    from core.models import NotificationPreference, NotificationLog
    from deliverables.services import PreDeliverableService
    from django.core.mail import send_mail
    from datetime import date as _date
    sent = 0
    for pref in NotificationPreference.objects.select_related('user'):
        if not pref.daily_digest:
            continue
        items = PreDeliverableService.get_upcoming_for_user(pref.user, days_ahead=max(0, int(pref.reminder_days_before or 1)))
        subject = 'Daily Pre-Deliverables Digest'
        lines = [f"- {getattr(it.pre_deliverable_type, 'name', '')} • {getattr(it.deliverable.project, 'name', '')} • {it.generated_date}" for it in items]
        body = '\n'.join(lines) if lines else 'No upcoming items.'
        ok = True
        try:
            if pref.user.email:
                send_mail(subject, body, None, [pref.user.email])
                sent += 1
        except Exception:
            ok = False
        NotificationLog.objects.create(user=pref.user, pre_deliverable_item=None, notification_type='digest', sent_at=_date.today(), email_subject=subject, success=ok)
    return {'sent': sent}


@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=2, retry_kwargs={"max_retries": 1}, soft_time_limit=600)
def backfill_pre_deliverables_async(self, project_id: int | None = None, start: str | None = None, end: str | None = None, regenerate: bool = False) -> dict:
    """Background backfill of PreDeliverableItem records.

    Args:
      project_id: optional project scope
      start: optional YYYY-MM-DD lower bound for Deliverable.date
      end: optional YYYY-MM-DD upper bound for Deliverable.date
      regenerate: when true, delete existing and recreate; else only create missing

    Returns summary dict with counts.
    """
    from django.utils.dateparse import parse_date
    from deliverables.models import Deliverable
    from deliverables.services import PreDeliverableService

    start_d = parse_date(start) if start else None
    end_d = parse_date(end) if end else None

    qs = Deliverable.objects.exclude(date__isnull=True)
    if project_id is not None:
        try:
            qs = qs.filter(project_id=int(project_id))
        except Exception:  # nosec B110
            pass
    if start_d:
        qs = qs.filter(date__gte=start_d)
    if end_d:
        qs = qs.filter(date__lte=end_d)

    total = max(1, qs.count())
    created = 0
    deleted = 0
    preserved = 0
    processed = 0

    for d in qs.iterator():
        try:
            if regenerate:
                summary = PreDeliverableService.regenerate_pre_deliverables(d)
                created += int(summary.created)
                deleted += int(summary.deleted)
                preserved += int(summary.preserved_completed)
            else:
                created += len(PreDeliverableService.generate_pre_deliverables(d))
        except Exception as e:
            # Continue; surface error via state message
            try:
                self.update_state(state='PROGRESS', meta={'progress': int(processed * 100 / total), 'message': f'Error on {getattr(d, "id", "?")}: {e}'})
            except Exception:  # nosec B110
                pass
        processed += 1
        if processed % 50 == 0 or processed == total:
            try:
                self.update_state(state='PROGRESS', meta={'progress': int(processed * 100 / total), 'message': f'Processed {processed}/{total}'})
            except Exception:  # nosec B110
                pass

    return {
        'processed': processed,
        'created': created,
        'deleted': deleted,
        'preservedCompleted': preserved,
        'projectId': project_id,
        'start': start,
        'end': end,
        'regenerate': bool(regenerate),
    }
