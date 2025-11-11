from __future__ import annotations

import io
import os
import uuid
from datetime import datetime
from typing import Dict, Any

from celery import shared_task
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db.models import Q

from .models import Person
from .services import deactivate_person_cleanup
from .utils.excel_handler import export_people_to_excel, import_people_from_excel


def _export_filename(prefix: str = 'people_export', ext: str = 'xlsx') -> str:
    ts = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
    return f"{prefix}_{ts}_{uuid.uuid4().hex[:8]}.{ext}"


@shared_task(bind=True)
def export_people_excel_task(self, filters: Dict[str, Any] | None = None) -> Dict[str, Any]:
    """Generate Excel for people list and store in default storage.

    Returns a descriptor dict with storage path to be downloaded later.
    """
    self.update_state(state='STARTED', meta={'progress': 5, 'message': 'Preparing export'})
    qs = (
        Person.objects
        .filter(is_active=True)
        .select_related('department', 'role')
        .only('id', 'name', 'weekly_capacity', 'role', 'department', 'location', 'notes', 'created_at', 'updated_at')
        .order_by('name')
    )

    filters = filters or {}
    role = filters.get('role')
    if role:
        # Accept a loose match on role name
        qs = qs.filter(role__name__icontains=role)

    department = filters.get('department')
    if department:
        qs = qs.filter(department__name__icontains=department)

    self.update_state(state='PROGRESS', meta={'progress': 40, 'message': 'Generating Excel content'})
    # Reuse existing export utility to get an HttpResponse, then persist bytes
    response = export_people_to_excel(qs)
    content = response.content

    self.update_state(state='PROGRESS', meta={'progress': 80, 'message': 'Saving export file'})
    fname = _export_filename()
    storage_key = os.path.join('exports', 'people', fname)
    default_storage.save(storage_key, ContentFile(content))

    meta = {
        'type': 'file',
        'path': storage_key,
        'filename': fname,
        'content_type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }
    self.update_state(state='PROGRESS', meta={'progress': 95, 'message': 'Finalizing'})
    return meta


@shared_task(bind=True)
def import_people_excel_task(self, storage_path: str, update_existing: bool = True, dry_run: bool = False) -> Dict[str, Any]:
    """Import people from a previously uploaded Excel file.

    Supports either a default_storage key or an absolute filesystem path.
    """
    self.update_state(state='STARTED', meta={'progress': 5, 'message': 'Starting import'})
    try:
        # If an absolute path exists on disk, open directly; otherwise use default_storage
        if os.path.isabs(storage_path) and os.path.exists(storage_path):
            fh = open(storage_path, 'rb')
            close_fh = True
        else:
            fh = default_storage.open(storage_path, 'rb')
            close_fh = True
        try:
            self.update_state(state='PROGRESS', meta={'progress': 30, 'message': 'Processing file'})
            results = import_people_from_excel(fh, update_existing=update_existing, dry_run=dry_run)
        finally:
            if close_fh:
                try:
                    fh.close()
                except Exception:
                    pass

        # Ensure structure contains counts for UI
        total = int(results.get('total_rows', 0) or 0)
        success = int(results.get('success_count', 0) or 0)
        errors = int(results.get('error_count', 0) or 0)
        meta = {
            'success': True,
            'total_rows': total,
            'success_count': success,
            'error_count': errors,
            'details': results,
        }
        self.update_state(state='PROGRESS', meta={'progress': 95, 'message': 'Import complete'})
        return meta
    except Exception as e:
        # Let Celery mark as FAILURE with exception; also include meta for clients
        raise e


@shared_task(bind=True)
def deactivate_person_cleanup_task(self, person_id: int, zero_mode: str = 'all', actor_user_id: int | None = None) -> Dict[str, Any]:
    """Celery wrapper for deactivation cleanup; safe to run multiple times."""
    self.update_state(state='STARTED', meta={'progress': 5, 'message': 'Deactivating assignments'})
    result = deactivate_person_cleanup(person_id=person_id, zero_mode=zero_mode, actor_user_id=actor_user_id)
    self.update_state(state='PROGRESS', meta={'progress': 95, 'message': 'Finalizing'})
    return result
