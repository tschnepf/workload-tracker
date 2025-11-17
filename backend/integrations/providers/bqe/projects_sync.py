from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone as dt_timezone
from typing import Any, Dict, List, Optional

from django.db import transaction
from django.utils import timezone

from integrations.models import (
    IntegrationConnection,
    IntegrationExternalLink,
    IntegrationRule,
    IntegrationSetting,
)
from integrations.registry import get_registry
from integrations.providers.bqe.projects_client import BQEProjectsClient
from integrations.logging_utils import integration_log_extra
from projects.models import Project

logger = logging.getLogger(__name__)


@dataclass
class SyncResult:
    metrics: Dict[str, int]
    cursor: Optional[str]


def sync_projects(
    rule: IntegrationRule,
    *,
    state: Dict[str, Any],
    dry_run: bool = False,
    client_factory=BQEProjectsClient,
) -> SyncResult:
    provider = get_registry().get_provider(rule.connection.provider.key)
    if not provider:
        raise RuntimeError('Provider metadata missing')
    object_meta = get_registry().get_object_catalog(provider.key, rule.object_key) or {}
    mapping = _load_mapping(rule.connection, rule.object_key, object_meta)
    client = client_factory(rule.connection, provider)
    metrics: Dict[str, int] = {
        'fetched': 0,
        'updated': 0,
        'skippedChildren': 0,
        'skippedUnlinked': 0,
        'skippedMissingId': 0,
    }
    max_updated: Optional[datetime] = None
    parent_key = ((object_meta.get('hierarchy') or {}).get('parentKey')) or 'parentProjectId'
    cursor = state.get('cursor')

    for batch in client.fetch(updated_since=cursor):
        for row in batch:
            metrics['fetched'] += 1
            updated_on = _parse_datetime(row.get('updatedOn'))
            if updated_on:
                max_updated = max(max_updated, updated_on) if max_updated else updated_on
            if _is_child(row, parent_key):
                metrics['skippedChildren'] += 1
                continue
            external_id = _coerce_external_id(row.get('projectId'))
            if not external_id:
                metrics['skippedMissingId'] += 1
                continue
            link = _get_link(rule.connection, external_id)
            if not link or not isinstance(link.local_object, Project):
                metrics['skippedUnlinked'] += 1
                continue
            project = link.local_object
            updated = _apply_mapping(project, row, mapping, rule, dry_run=dry_run)
            if updated:
                metrics['updated'] += 1

    cursor_value = state.get('cursor')
    if max_updated:
        cursor_value = max_updated.isoformat().replace('+00:00', 'Z')
    return SyncResult(metrics=metrics, cursor=cursor_value)


def _load_mapping(connection: IntegrationConnection, object_key: str, object_meta: dict) -> List[dict]:
    key = f"mapping.{object_key}"
    setting = IntegrationSetting.objects.filter(connection=connection, key=key).first()
    if setting and isinstance(setting.data, dict):
        mappings = setting.data.get('mappings')
        if isinstance(mappings, list):
            return mappings
    return ((object_meta.get('mapping') or {}).get('defaults')) or []


def _coerce_external_id(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _get_link(connection: IntegrationConnection, external_id: str) -> Optional[IntegrationExternalLink]:
    return (
        IntegrationExternalLink.objects
        .select_related('content_type')
        .filter(
            provider=connection.provider,
            connection=connection,
            object_type='projects',
            external_id=external_id,
        )
        .first()
    )


def _is_child(row: Dict[str, Any], parent_key: str | None) -> bool:
    if not parent_key:
        return False
    value = row.get(parent_key)
    return value not in (None, '', 0)


def _parse_datetime(value: Any) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt, timezone=dt_timezone.utc)
        return dt.astimezone(dt_timezone.utc)
    except Exception:
        return None


def _apply_mapping(project: Project, payload: Dict[str, Any], mapping: List[dict], rule: IntegrationRule, *, dry_run: bool) -> bool:
    updates: Dict[str, Any] = {}
    for entry in mapping:
        target = entry.get('target') or ''
        if not target.startswith('project.'):
            continue
        field = target.split('.', 1)[1]
        raw_value = _read_source(payload, entry.get('source'))
        behavior = (entry.get('behavior') or 'follow_bqe').lower()
        current = getattr(project, field, None)
        if not _should_update_field(behavior, current, raw_value):
            continue
        updates[field] = _coerce_field_value(field, raw_value)

    # Always store remote client details if available
    if 'bqe_client_name' not in updates:
        remote_client = _read_source(payload, 'clientName')
        if remote_client:
            updates['bqe_client_name'] = remote_client
    if 'bqe_client_id' not in updates:
        remote_client_id = _read_source(payload, 'clientId')
        if remote_client_id:
            updates['bqe_client_id'] = str(remote_client_id)

    policy = (rule.config or {}).get('clientSyncPolicy', 'preserve_local')
    remote_client = _read_source(payload, 'clientName') or updates.get('bqe_client_name')
    new_client = _resolve_client_value(project, remote_client, policy)
    if new_client is not None:
        updates['client'] = new_client
        updates['client_sync_policy_state'] = policy

    status_value = _read_source(payload, 'status')
    if status_value:
        mapped_status = _map_status(status_value)
        if mapped_status:
            updates['status'] = mapped_status
            updates['is_active'] = mapped_status != 'inactive'

    if not updates:
        return False

    if dry_run:
        logger.info(
            'bqe_sync_dry_run',
            extra=integration_log_extra(
                rule=rule,
                connection=rule.connection,
                extra={'project_id': project.id, 'fields': list(updates.keys())},
            ),
        )
        return False

    with transaction.atomic():
        for field, value in updates.items():
            setattr(project, field, value)
        project.save(update_fields=list(updates.keys()) + ['updated_at'])
    return True


def _read_source(payload: Dict[str, Any], source: Optional[str]):
    if not source:
        return None
    value = payload
    for part in source.split('.'):
        if not isinstance(value, dict):
            return None
        value = value.get(part)
    return value


def _should_update_field(behavior: str, current: Any, incoming: Any) -> bool:
    if behavior == 'write_once':
        return not current
    if behavior == 'preserve_local':
        return current in (None, '', 0)
    return incoming is not None


def _coerce_field_value(field: str, value: Any):
    if value is None:
        return None
    if field in ('start_date', 'end_date') and isinstance(value, str):
        try:
            return datetime.fromisoformat(value).date()
        except Exception:
            return value
    if field == 'project_number' and value is not None:
        return str(value).strip() or None
    if field in ('bqe_client_id',):
        return str(value).strip() or None
    if isinstance(value, str):
        return value.strip()
    return value


def _resolve_client_value(project: Project, remote_client: Any, policy: str) -> Optional[str]:
    value = (remote_client or '').strip()
    if not value and policy != 'preserve_local':
        return value
    current = (project.client or '').strip()
    policy = (policy or '').lower()
    if policy == 'follow_bqe':
        return value or current
    if policy == 'write_once':
        return value if not current or current == 'Internal' else current
    # preserve_local: update only when local matches previous synced value or missing
    previous_remote = (project.bqe_client_name or '').strip()
    if not current or current == previous_remote:
        return value or current
    return current


def _map_status(remote_status: str) -> Optional[str]:
    normalized = (remote_status or '').strip().lower()
    if not normalized:
        return None
    if normalized in ('archived', 'inactive', 'closed'):
        return 'inactive'
    if normalized in ('active', 'open'):
        return 'active'
    if normalized in ('planning',):
        return 'planning'
    if normalized in ('completed', 'complete'):
        return 'completed'
    return normalized
