from __future__ import annotations

import os
import uuid
from datetime import datetime
from typing import Dict, Any

from celery import shared_task
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

from .models import Project
from .utils.excel_handler import export_projects_to_excel


def _export_filename(prefix: str = 'projects_export', ext: str = 'xlsx') -> str:
    ts = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
    return f"{prefix}_{ts}_{uuid.uuid4().hex[:8]}.{ext}"


@shared_task(bind=True)
def export_projects_excel_task(self, filters: Dict[str, Any] | None = None) -> Dict[str, Any]:
    """Generate Excel export for projects and store it in default storage."""
    self.update_state(state='STARTED', meta={'progress': 5, 'message': 'Preparing export'})
    qs = (
        Project.objects
        .filter(is_active=True)
        .only(
            'id', 'name', 'status', 'client', 'description', 'project_number',
            'start_date', 'end_date', 'estimated_hours', 'is_active', 'created_at', 'updated_at'
        )
    )

    filters = filters or {}
    status_filter = filters.get('status')
    if status_filter:
        qs = qs.filter(status__iexact=status_filter)

    client = filters.get('client')
    if client:
        qs = qs.filter(client__icontains=client)

    self.update_state(state='PROGRESS', meta={'progress': 40, 'message': 'Generating Excel content'})
    response = export_projects_to_excel(qs)
    content = response.content

    self.update_state(state='PROGRESS', meta={'progress': 80, 'message': 'Saving export file'})
    fname = _export_filename()
    storage_key = os.path.join('exports', 'projects', fname)
    default_storage.save(storage_key, ContentFile(content))

    meta = {
        'type': 'file',
        'path': storage_key,
        'filename': fname,
        'content_type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }
    self.update_state(state='PROGRESS', meta={'progress': 95, 'message': 'Finalizing'})
    return meta

