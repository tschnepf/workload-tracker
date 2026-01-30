from __future__ import annotations

from typing import Iterable
from celery import shared_task

from .rollup_service import rebuild_project_rollups
from .models import Assignment


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
