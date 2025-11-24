from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone as dt_timezone
from typing import Any, Dict, List, Optional

from django.utils import timezone

from integrations.models import IntegrationConnection, IntegrationClient, IntegrationRule, IntegrationSetting
from integrations.registry import get_registry
from integrations.providers.bqe.clients_client import BQEClientsClient

logger = logging.getLogger(__name__)


@dataclass
class ClientSyncResult:
    metrics: Dict[str, int]
    cursor: Optional[str]


def sync_clients(
    rule: IntegrationRule,
    *,
    state: Dict[str, Any],
    dry_run: bool = False,
    client_factory=BQEClientsClient,
) -> ClientSyncResult:
    provider = get_registry().get_provider(rule.connection.provider.key)
    if not provider:
        raise RuntimeError('Provider metadata missing')
    object_meta = get_registry().get_object_catalog(provider.key, rule.object_key) or {}
    mapping = _load_mapping(rule.connection, rule.object_key, object_meta)
    client = client_factory(rule.connection, provider)
    metrics: Dict[str, int] = {
        'fetched': 0,
        'inserted': 0,
        'updated': 0,
        'skippedMissingId': 0,
    }
    max_updated: Optional[datetime] = None
    cursor = state.get('cursor')

    for batch in client.fetch(updated_since=cursor):
        for row in batch:
            metrics['fetched'] += 1
            updated_on = _parse_datetime(row.get('lastUpdated') or row.get('updatedOn'))
            if updated_on:
                max_updated = max(max_updated, updated_on) if max_updated else updated_on
            external_id, legacy_external_id = _extract_external_ids(row)
            if not external_id:
                metrics['skippedMissingId'] += 1
                continue
            if dry_run:
                logger.info('bqe_clients_dry_run', extra={'connection_id': rule.connection_id, 'client_id': external_id})
                continue
            created = _apply_and_upsert(rule.connection, external_id, legacy_external_id, row, mapping)
            if created:
                metrics['inserted'] += 1
            else:
                metrics['updated'] += 1

    cursor_value = state.get('cursor')
    if max_updated:
        cursor_value = max_updated.isoformat().replace('+00:00', 'Z')
    return ClientSyncResult(metrics=metrics, cursor=cursor_value)


def _load_mapping(connection: IntegrationConnection, object_key: str, object_meta: dict) -> List[dict]:
    key = f"mapping.{object_key}"
    setting = IntegrationSetting.objects.filter(connection=connection, key=key).first()
    if setting and isinstance(setting.data, dict):
        mappings = setting.data.get('mappings')
        if isinstance(mappings, list):
            return mappings
    return ((object_meta.get('mapping') or {}).get('defaults')) or []


def _extract_external_ids(row: Dict[str, Any]) -> tuple[Optional[str], Optional[str]]:
    legacy = _coerce_external_id(row.get('clientId'))
    primary = _coerce_external_id(row.get('id')) or legacy
    return primary, legacy


def _coerce_external_id(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


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


def _read_source(payload: Dict[str, Any], source: Optional[str]):
    if not source:
        return None
    value = payload
    for part in source.split('.'):
        if not isinstance(value, dict):
            return None
        value = value.get(part)
    return value


def _coerce_value(field: str, value: Any):
    if field in {'is_archived'}:
        return bool(value)
    return value


def _apply_mapping(payload: Dict[str, Any], mapping: List[dict]) -> Dict[str, Any]:
    updates: Dict[str, Any] = {}
    for entry in mapping:
        target = entry.get('target') or ''
        if not target.startswith('integration_client.'):
            continue
        field = target.split('.', 1)[1]
        source_value = _read_source(payload, entry.get('source'))
        updates[field] = _coerce_value(field, source_value)
    return updates


def _apply_and_upsert(connection: IntegrationConnection, external_id: str, legacy_external_id: Optional[str], payload: Dict[str, Any], mapping: List[dict]) -> bool:
    updates = _apply_mapping(payload, mapping)
    if 'is_archived' not in updates and 'status' in payload:
        updates['is_archived'] = str(payload['status']).lower() in {'archived', 'inactive'}
    updates.setdefault('name', payload.get('name', ''))
    updates.setdefault('metadata', payload)
    updates['metadata'] = payload
    updates['last_synced_at'] = timezone.now()
    updates['legacy_external_id'] = legacy_external_id or updates.get('legacy_external_id', '')
    updated_on = _parse_datetime(payload.get('lastUpdated') or payload.get('updatedOn'))
    if updated_on:
        updates['updated_on'] = updated_on
    existing = _find_existing_client(connection, external_id, legacy_external_id)
    if existing:
        for field, value in updates.items():
            setattr(existing, field, value)
        existing.save(update_fields=list(updates.keys()) + ['updated_at'])
        return False
    IntegrationClient.objects.update_or_create(
        connection=connection,
        external_id=external_id,
        defaults=updates,
    )
    return True


def _find_existing_client(connection: IntegrationConnection, external_id: str, legacy_external_id: Optional[str]) -> Optional[IntegrationClient]:
    obj = IntegrationClient.objects.filter(connection=connection, external_id=external_id).first()
    if obj:
        if legacy_external_id and not obj.legacy_external_id:
            IntegrationClient.objects.filter(pk=obj.pk).update(legacy_external_id=legacy_external_id)
            obj.legacy_external_id = legacy_external_id
        return obj
    if legacy_external_id:
        obj = IntegrationClient.objects.filter(connection=connection, legacy_external_id=legacy_external_id).first()
        if obj:
            obj.external_id = external_id
            updates = ['external_id', 'updated_at']
            if not obj.legacy_external_id:
                obj.legacy_external_id = legacy_external_id
                updates.append('legacy_external_id')
            obj.save(update_fields=updates)
    return obj
