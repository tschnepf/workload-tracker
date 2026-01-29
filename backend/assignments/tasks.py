from __future__ import annotations

from typing import Iterable
from celery import shared_task

from .rollup_service import rebuild_project_rollups


@shared_task(bind=True, soft_time_limit=120)
def refresh_project_rollups_task(self, project_ids: Iterable[int] | None = None) -> dict:
    ids = list(project_ids or [])
    rebuild_project_rollups(ids)
    return {'projectIds': ids}
