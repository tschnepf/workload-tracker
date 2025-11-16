from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from django.apps import apps
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import IntegrationConnection, IntegrationRule
from .scheduler import schedule_next_run
from .state import load_state, reset_state, save_state


def ensure_rule_state_initialized(rule: IntegrationRule) -> Dict[str, Any]:
    state = load_state(rule.connection, rule.object_key)
    if state.get('cursorInitialized'):
        return state
    config = rule.config or {}
    mode = config.get('initialSyncMode', 'full_once')
    now_iso = timezone.now().isoformat()
    state = dict(state)
    if mode == 'delta_only_after_date':
        state['cursor'] = config.get('initialSyncSince')
        state['requiresFullSync'] = False
    elif mode == 'delta_only_from_now':
        state['cursor'] = now_iso
        state['requiresFullSync'] = False
    else:
        state['cursor'] = None
        state['requiresFullSync'] = True
    state['cursorInitialized'] = True
    state['initialCursorMode'] = mode
    state['cursorInitializedAt'] = now_iso
    if config.get('initialSyncSince'):
        state['initialSyncSince'] = config['initialSyncSince']
    save_state(rule.connection, rule.object_key, state)
    return state


def reset_rule_state_for_scope(rule: IntegrationRule, scope: str) -> Dict[str, Any]:
    scope_key = (scope or 'delta').lower()
    if scope_key == 'full':
        reset_state(rule.connection, rule.object_key)
        return {}
    state = load_state(rule.connection, rule.object_key)
    if scope_key == 'delta_from_now':
        now_iso = timezone.now().isoformat()
        state['cursor'] = now_iso
        state['cursorInitialized'] = True
        state['requiresFullSync'] = False
        state['initialCursorMode'] = 'delta_only_from_now'
        state['cursorInitializedAt'] = now_iso
        save_state(rule.connection, rule.object_key, state)
    return state


def _parse_iso8601(value: Optional[str]) -> Optional[datetime]:
    if not value or not isinstance(value, str):
        return None
    cleaned = value.strip()
    if cleaned.endswith('Z'):
        cleaned = cleaned[:-1] + '+00:00'
    try:
        dt = datetime.fromisoformat(cleaned)
        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt, timezone=timezone.utc)
        return dt
    except Exception:
        return None


def flag_connections_after_restore(sidecar_meta: Optional[Dict[str, Any]]) -> bool:
    threshold_days = int(getattr(settings, 'INTEGRATIONS_RESTORE_MAX_AGE_DAYS', 0))
    if threshold_days <= 0:
        return False
    if not apps.is_installed('integrations'):
        return False
    ts = sidecar_meta.get('finishedAt') if isinstance(sidecar_meta, dict) else None
    ts = ts or (sidecar_meta.get('createdAt') if isinstance(sidecar_meta, dict) else None)
    restored_at = _parse_iso8601(ts)
    if restored_at is None:
        return False
    age = timezone.now() - restored_at
    if age < timedelta(days=threshold_days):
        return False
    with transaction.atomic():
        IntegrationConnection.objects.all().update(needs_reauth=True)
        IntegrationRule.objects.all().update(resync_required=True, next_run_at=None)
    return True


def clear_resync_and_schedule(rule: IntegrationRule, *, scope: str = 'delta') -> Dict[str, Any]:
    state = reset_rule_state_for_scope(rule, scope)
    rule.resync_required = False
    schedule_next_run(rule, base_time=timezone.now(), commit=False)
    rule.save(update_fields=['resync_required', 'next_run_at', 'updated_at'])
    return state
