from __future__ import annotations

from typing import Iterable
from celery import shared_task
from zoneinfo import ZoneInfo

from .rollup_service import rebuild_project_rollups
from .models import Assignment
from .snapshot_service import write_weekly_assignment_snapshots
from core.models import NetworkGraphSettings
from core.week_utils import sunday_of_week
from django.utils import timezone


@shared_task(bind=True, soft_time_limit=120)
def refresh_project_rollups_task(self, project_ids: Iterable[int] | None = None) -> dict:
    ids = list(project_ids or [])
    rebuild_project_rollups(ids)
    return {'projectIds': ids}


@shared_task(bind=True, soft_time_limit=600)
def nightly_rebuild_project_rollups_task(self) -> dict:
    project_ids = list(
        Assignment.objects.filter(is_active=True, project_id__isnull=False)
        .values_list('project_id', flat=True)
        .distinct()
    )
    if not project_ids:
        return {'projectCount': 0}
    rebuild_project_rollups(project_ids)
    return {'projectCount': len(project_ids)}


@shared_task(bind=True, soft_time_limit=120)
def network_graph_weekly_snapshot_scheduler_task(self) -> dict:
    """Evaluate schedule and run weekly snapshot writer when due."""
    settings_obj = NetworkGraphSettings.get_active()
    if not settings_obj.snapshot_scheduler_enabled:
        return {'status': 'skipped', 'reason': 'disabled'}

    try:
        tz = ZoneInfo((settings_obj.snapshot_scheduler_timezone or '').strip() or 'America/Phoenix')
    except Exception:
        tz = ZoneInfo('America/Phoenix')
    now_local = timezone.now().astimezone(tz)

    if int(now_local.weekday()) != int(settings_obj.snapshot_scheduler_day):
        return {'status': 'skipped', 'reason': 'weekday_mismatch', 'weekday': int(now_local.weekday())}
    if int(now_local.hour) < int(settings_obj.snapshot_scheduler_hour):
        return {'status': 'skipped', 'reason': 'hour_not_reached', 'hour': int(now_local.hour)}
    if int(now_local.hour) == int(settings_obj.snapshot_scheduler_hour) and int(now_local.minute) < int(settings_obj.snapshot_scheduler_minute):
        return {'status': 'skipped', 'reason': 'minute_not_reached', 'minute': int(now_local.minute)}

    target_week = sunday_of_week(now_local.date())
    if settings_obj.last_snapshot_week_start == target_week:
        return {'status': 'skipped', 'reason': 'already_ran', 'weekStart': target_week.isoformat()}

    result = write_weekly_assignment_snapshots(target_week)
    if not result.get('lock_acquired', True):
        return {'status': 'skipped', 'reason': 'lock_not_acquired', 'weekStart': target_week.isoformat()}

    settings_obj.last_snapshot_week_start = target_week
    settings_obj.save(update_fields=['last_snapshot_week_start', 'updated_at'])
    return {'status': 'ok', 'weekStart': target_week.isoformat(), 'snapshot': result}
