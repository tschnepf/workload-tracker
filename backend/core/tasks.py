"""
Celery background tasks for heavy aggregations.
"""
from __future__ import annotations

from typing import Dict, List, Any, Optional
from datetime import date, timedelta
from zoneinfo import ZoneInfo

from celery import shared_task
import os
from django.db.models import Prefetch
from django.conf import settings
from django.utils import timezone
from django.core.cache import cache
from core.webpush import (
    flush_due_deferred_push_notifications,
    run_web_push_subscription_health_check,
    send_push_to_users,
)
from core.notification_dispatch import (
    channel_enabled_for_preference,
    dispatch_event_to_users,
)


@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=2, retry_kwargs={"max_retries": 3}, soft_time_limit=120)
def generate_grid_snapshot_async(
    self,
    weeks: int = 12,
    department: Optional[int] = None,
    include_children: int = 0,
    vertical: Optional[int] = None,
) -> Dict[str, Any]:
    """Generate the same payload as /assignments/grid_snapshot/ in the background.

    Returns a dict with keys: { weekKeys, people, hoursByPerson }.
    """
    from people.models import Person  # local import for task autodiscovery safety
    from people.eligibility import first_eligible_week_start
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
    if vertical is not None:
        try:
            people_qs = people_qs.filter(department__vertical_id=int(vertical))
        except Exception:
            pass

    asn_qs = Assignment.objects.filter(is_active=True)
    if vertical is not None:
        try:
            asn_qs = asn_qs.filter(project__vertical_id=int(vertical))
        except Exception:
            pass
    asn_qs = asn_qs.only('weekly_hours', 'person_id')
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
            first_eligible = first_eligible_week_start(getattr(p, 'hire_date', None))
            people_list.append({
                'id': p.id,
                'name': p.name,
                'weeklyCapacity': p.weekly_capacity or 0,
                'department': p.department_id,
                'firstEligibleWeek': first_eligible.isoformat() if first_eligible is not None else None,
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
    from people.eligibility import is_hired_in_week, is_hired_on_date
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
    vertical_param = filters.get('vertical')
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
    if vertical_param not in (None, ""):
        try:
            people_qs = people_qs.filter(department__vertical_id=int(vertical_param))
        except Exception:  # nosec B110
            pass

    skill_qs = PersonSkill.objects.select_related('skill_tag')
    prefetches = [Prefetch('skills', queryset=skill_qs)]
    if week_monday is not None:
        asn_qs = Assignment.objects.filter(is_active=True)
        if vertical_param not in (None, ""):
            try:
                asn_qs = asn_qs.filter(project__vertical_id=int(vertical_param))
            except Exception:  # nosec B110
                pass
        asn_qs = asn_qs.only('weekly_hours', 'person_id')
        prefetches.append(Prefetch('assignments', queryset=asn_qs))
    people_qs = people_qs.prefetch_related(*prefetches)

    results: List[Dict[str, Any]] = []
    total = max(1, people_qs.count())
    processed = 0
    try:
        for p in people_qs.iterator():
            if week_monday is not None:
                if not is_hired_in_week(getattr(p, 'hire_date', None), week_monday):
                    continue
            else:
                if not is_hired_on_date(getattr(p, 'hire_date', None), date.today()):
                    continue
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
        return {'sent': 0, 'dispatches': 0}
    from core.models import NotificationPreference, NotificationLog
    from assignments.models import Assignment
    from deliverables.models import Deliverable
    from deliverables.services import PreDeliverableService
    from datetime import date as _date
    sent = 0
    dispatches = 0
    for pref in NotificationPreference.objects.select_related('user'):
        # Reminder horizon remains controlled by existing user preference days-before.
        if int(getattr(pref, 'reminder_days_before', 1) or 1) < 0:
            continue
        upcoming = PreDeliverableService.get_upcoming_for_user(pref.user, days_ahead=max(0, int(pref.reminder_days_before or 1)))
        for it in upcoming:
            subject = f"Reminder: {getattr(it.pre_deliverable_type, 'name', 'Pre-Deliverable')} ({it.generated_date})"
            body = f"{getattr(it.deliverable.project, 'name', 'Project')} • {it.generated_date}"
            result = dispatch_event_to_users(
                user_ids=[pref.user_id],
                event_key='pred.reminder',
                title='Pre-Deliverable Reminder',
                body=body,
                url=f"/deliverables/calendar?project={it.deliverable.project_id}&deliverable={it.deliverable_id}&preItem={it.id}",
                tag=f"pred.reminder.{it.id}",
                project_id=getattr(it.deliverable, 'project_id', None),
                entity_type='pre_deliverable',
                entity_id=getattr(it, 'id', None),
                priority='normal',
            )
            dispatches += int(result.get('pushQueued', 0)) + int(result.get('inAppCreated', 0)) + int(result.get('emailQueued', 0))
            sent += 1
            NotificationLog.objects.create(
                user=pref.user,
                pre_deliverable_item=it,
                notification_type='reminder',
                sent_at=_date.today(),
                email_subject=subject,
                success=True,
            )
        # Standard deliverable reminder stream (separate from pre-deliverables).
        person_id = getattr(getattr(pref.user, 'profile', None), 'person_id', None)
        if person_id:
            project_ids = list(
                Assignment.objects.filter(
                    person_id=person_id,
                    is_active=True,
                    project_id__isnull=False,
                ).values_list('project_id', flat=True).distinct()
            )
            if project_ids:
                horizon_days = max(0, int(pref.reminder_days_before or 1))
                today = _date.today()
                horizon_end = today + timedelta(days=horizon_days)
                deliverables = (
                    Deliverable.objects
                    .filter(
                        project_id__in=project_ids,
                        date__isnull=False,
                        date__gte=today,
                        date__lte=horizon_end,
                    )
                    .select_related('project')
                    .order_by('date', 'id')
                )
                for deliverable in deliverables:
                    project_name = getattr(getattr(deliverable, 'project', None), 'name', None) or 'Project'
                    deliverable_name = (deliverable.description or '').strip() or f"Deliverable {deliverable.id}"
                    body = f"{project_name} • {deliverable_name} • due {deliverable.date.isoformat()}"
                    result = dispatch_event_to_users(
                        user_ids=[pref.user_id],
                        event_key='deliverable.reminder',
                        title='Deliverable Reminder',
                        body=body,
                        url=f"/deliverables/calendar?project={deliverable.project_id}&deliverable={deliverable.id}",
                        tag=f"deliverable.reminder.{deliverable.id}",
                        project_id=deliverable.project_id,
                        entity_type='deliverable',
                        entity_id=deliverable.id,
                        priority='normal',
                    )
                    dispatches += int(result.get('pushQueued', 0)) + int(result.get('inAppCreated', 0)) + int(result.get('emailQueued', 0))
                    NotificationLog.objects.create(
                        user=pref.user,
                        pre_deliverable_item=None,
                        notification_type='deliverable_reminder',
                        sent_at=_date.today(),
                        email_subject=f"Deliverable Reminder: {deliverable_name} ({deliverable.date.isoformat()})",
                        success=True,
                    )
    return {'sent': sent, 'dispatches': dispatches}


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
            if pref.user.email and channel_enabled_for_preference(pref, event_key='pred.digest', channel='email'):
                send_mail(subject, body, None, [pref.user.email])
                sent += 1
        except Exception:
            ok = False
        dispatch_event_to_users(
            user_ids=[pref.user_id],
            event_key='pred.digest',
            title='Daily Pre-Deliverables Digest',
            body=f"{len(items)} upcoming item(s).",
            url='/deliverables/calendar?mine_only=1',
            tag='pred.digest',
            priority='normal',
        )
        NotificationLog.objects.create(user=pref.user, pre_deliverable_item=None, notification_type='digest', sent_at=_date.today(), email_subject=subject, success=ok)
    return {'sent': sent}


@shared_task(bind=True, soft_time_limit=180)
def send_email_notification_daily_summary(self):
    from core.models import EmailNotificationDigestItem, NotificationPreference
    from django.core.mail import send_mail

    now_ts = timezone.now()
    stale_days = max(1, int(getattr(settings, 'EMAIL_NOTIFICATION_STALE_UNSENT_DAYS', 14) or 14))
    stale_cutoff = now_ts - timedelta(days=stale_days)
    stale_marked_items = int(
        EmailNotificationDigestItem.objects
        .filter(sent_at__isnull=True, created_at__lt=stale_cutoff)
        .update(sent_at=now_ts)
    )
    unsent_qs = (
        EmailNotificationDigestItem.objects
        .filter(sent_at__isnull=True)
        .select_related('user')
        .order_by('user_id', 'created_at', 'id')
    )
    rows = list(unsent_qs[:5000])
    if not rows:
        return {'processedUsers': 0, 'sentEmails': 0, 'markedItems': 0, 'staleMarkedItems': stale_marked_items}

    user_ids = sorted({int(row.user_id) for row in rows})
    pref_map = NotificationPreference.objects.filter(user_id__in=user_ids).in_bulk(field_name='user_id')

    grouped: dict[int, list] = {}
    for row in rows:
        grouped.setdefault(int(row.user_id), []).append(row)

    sent_emails = 0
    marked_items = 0

    for user_id, user_rows in grouped.items():
        user = user_rows[0].user
        if not user or not getattr(user, 'email', None):
            # Drop unsendable rows to avoid unbounded backlog for users without email.
            ids = [int(row.id) for row in user_rows]
            marked_items += int(
                EmailNotificationDigestItem.objects.filter(id__in=ids, sent_at__isnull=True).update(sent_at=now_ts)
            )
            continue

        pref = pref_map.get(user_id)
        tz_name = (getattr(pref, 'push_timezone', '') or '').strip() if pref else ''
        try:
            tzinfo = ZoneInfo(tz_name) if tz_name else timezone.get_current_timezone()
        except Exception:
            tzinfo = timezone.get_current_timezone()
        local_now = now_ts.astimezone(tzinfo)
        if int(local_now.hour) != 8:
            continue

        lock_key = f"email-notification-summary:{user_id}:{local_now.date().isoformat()}"
        try:
            if not cache.add(lock_key, 1, timeout=26 * 60 * 60):
                continue
        except Exception:
            pass

        lines = []
        for row in user_rows[:100]:
            title = str(getattr(row, 'title', '') or 'Notification').strip()
            body = str(getattr(row, 'body', '') or '').strip()
            url = str(getattr(row, 'url', '') or '/').strip()
            if body:
                lines.append(f"- {title}: {body} ({url})")
            else:
                lines.append(f"- {title} ({url})")
        if len(user_rows) > 100:
            lines.append(f"- ...and {len(user_rows) - 100} more updates")

        subject = 'Daily Notification Summary'
        message = '\n'.join(lines) if lines else 'No new updates.'
        try:
            send_mail(subject, message, None, [user.email])
            sent_emails += 1
            ids = [int(row.id) for row in user_rows]
            marked_items += int(
                EmailNotificationDigestItem.objects.filter(id__in=ids, sent_at__isnull=True).update(sent_at=now_ts)
            )
        except Exception:
            # Keep unsent items for retry.
            continue

    return {
        'processedUsers': len(grouped),
        'sentEmails': sent_emails,
        'markedItems': marked_items,
        'staleMarkedItems': stale_marked_items,
    }


@shared_task(bind=True, soft_time_limit=120)
def cleanup_notification_data_task(self) -> Dict[str, Any]:
    from django.db.models import Q
    from core.models import EmailNotificationDigestItem, InAppNotification, NotificationDeliveryLog, WebPushGlobalSettings

    now_ts = timezone.now()
    stale_unsent_days = max(1, int(getattr(settings, 'EMAIL_NOTIFICATION_STALE_UNSENT_DAYS', 14) or 14))
    stale_unsent_cutoff = now_ts - timedelta(days=stale_unsent_days)

    cfg = WebPushGlobalSettings.get_active()
    in_app_retention_days = max(1, int(getattr(cfg, 'in_app_retention_days', 7) or 7))
    saved_retention_days = max(7, int(getattr(cfg, 'saved_in_app_retention_days', 90) or 90))
    in_app_expired_cutoff = now_ts - timedelta(days=in_app_retention_days)
    in_app_saved_cutoff = now_ts - timedelta(days=saved_retention_days)
    delivery_log_cutoff = now_ts - timedelta(days=max(saved_retention_days, 90))

    in_app_deleted = int(
        InAppNotification.objects.filter(
            Q(cleared_at__isnull=False)
            | Q(is_saved=False, expires_at__lt=now_ts)
            | Q(is_saved=True, created_at__lt=in_app_saved_cutoff)
            | Q(is_saved=False, created_at__lt=in_app_expired_cutoff)
        ).delete()[0]
    )

    stale_unsent_marked = int(
        EmailNotificationDigestItem.objects
        .filter(sent_at__isnull=True, created_at__lt=stale_unsent_cutoff)
        .update(sent_at=now_ts)
    )
    email_sent_deleted = int(
        EmailNotificationDigestItem.objects
        .filter(sent_at__lt=delivery_log_cutoff)
        .delete()[0]
    )
    delivery_logs_deleted = int(
        NotificationDeliveryLog.objects.filter(created_at__lt=delivery_log_cutoff).delete()[0]
    )

    return {
        'inAppDeleted': in_app_deleted,
        'staleUnsentMarked': stale_unsent_marked,
        'emailSentDeleted': email_sent_deleted,
        'deliveryLogsDeleted': delivery_logs_deleted,
        'retentionDays': {
            'inApp': in_app_retention_days,
            'savedInApp': saved_retention_days,
            'staleUnsentEmail': stale_unsent_days,
        },
    }


@shared_task(bind=True, soft_time_limit=60)
def send_push_to_users_task(self, user_ids: List[int], payload: Dict[str, Any], preference_field: str | None = None) -> Dict[str, Any]:
    sent = send_push_to_users(user_ids, payload, preference_field=preference_field)
    return {'sent': sent, 'userCount': len(set(user_ids or []))}


@shared_task(bind=True, soft_time_limit=60)
def flush_deferred_push_notifications_task(self, max_rows: int = 1000) -> Dict[str, Any]:
    result = flush_due_deferred_push_notifications(max_rows=max_rows)
    return result


@shared_task(bind=True, soft_time_limit=60)
def web_push_subscription_health_check_task(self) -> Dict[str, Any]:
    return run_web_push_subscription_health_check()


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
