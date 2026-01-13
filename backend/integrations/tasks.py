from __future__ import annotations

import logging
from celery import shared_task
from django.utils import timezone

from core.request_context import reset_request_id, set_current_request_id

from .models import IntegrationRule, IntegrationJob
from .registry import get_registry
from .scheduler import (
    acquire_rule_lock,
    release_rule_lock,
    lock_ttl_seconds,
    schedule_next_run,
    scheduler_health,
)
from .services import ensure_rule_state_initialized
from .state import save_state
from .providers.bqe.projects_sync import sync_projects as bqe_sync_projects
from .providers.bqe.clients_sync import sync_clients as bqe_sync_clients
from .logging_utils import integration_log_extra

logger = logging.getLogger(__name__)


class RuleExecutor:
    def __init__(self, rule: IntegrationRule, job: IntegrationJob, task):
        self.rule = rule
        self.job = job
        self.task = task
        self.logs: list[dict] = []

    def _log(self, message: str, level: str = 'info', **extra):
        entry = {
            'timestamp': timezone.now().isoformat(),
            'level': level,
            'message': message,
        }
        if extra:
            entry.update(extra)
        self.logs.append(entry)

    def _progress(self, percent: int, message: str):
        try:
            self.task.update_state(state='PROGRESS', meta={'progress': percent, 'message': message})
        except Exception:  # nosec B110
            pass
        self._log(message, progress=percent)

    def execute(self):
        self._progress(5, 'Initializing sync window')
        state = ensure_rule_state_initialized(self.rule)
        cursor = state.get('cursor')
        self._log('Planned cursor', cursor=cursor)

        registry = get_registry()
        provider = registry.get_provider(self.rule.connection.provider.key)
        self._log('Provider metadata loaded', provider=(provider.key if provider else None))

        dry_run = bool((self.rule.config or {}).get('dryRun'))
        if provider and provider.key == 'bqe':
            if self.rule.object_key == 'projects':
                result = bqe_sync_projects(self.rule, state=state, dry_run=dry_run)
            elif self.rule.object_key == 'clients':
                result = bqe_sync_clients(self.rule, state=state, dry_run=dry_run)
            else:
                result = None
            if result:
                new_state = dict(state)
                if result.cursor:
                    new_state['cursor'] = result.cursor
                now_iso = timezone.now().isoformat()
                new_state['lastRunAt'] = now_iso
                new_state['lastRuleRevision'] = self.rule.revision
                save_state(self.rule.connection, self.rule.object_key, new_state)
                self._progress(100, f"{self.rule.object_key.title()} sync complete")
                return result.metrics

        self._progress(30, 'Fetching records (placeholder)')
        fetched_records = 0

        self._progress(55, 'Mapping payload (placeholder)')
        mapped_records = fetched_records

        if dry_run:
            self._log('Dry-run enabled; skipping writes', level='warning')
        else:
            self._log('No-op sync placeholder; real mapping/upsert implemented in Phase 6')

        self._progress(90, 'Persisting state')
        new_state = dict(state)
        now_iso = timezone.now().isoformat()
        new_state['lastRunAt'] = now_iso
        new_state['lastRuleRevision'] = self.rule.revision
        new_state['lastCursor'] = state.get('cursor')
        save_state(self.rule.connection, self.rule.object_key, new_state)

        self._progress(100, 'Sync placeholder complete')
        return {'fetched': fetched_records, 'mapped': mapped_records, 'dryRun': dry_run}


@shared_task(bind=True, acks_late=True, soft_time_limit=900, time_limit=1200)
def run_integration_rule(self, rule_id: int, expected_revision: int | None = None):
    try:
        rule = (
            IntegrationRule.objects.select_related('connection', 'connection__provider')
            .get(id=rule_id, is_enabled=True)
        )
    except IntegrationRule.DoesNotExist:
        logger.warning(
            "integration_rule_missing",
            extra=integration_log_extra(extra={'rule_id': rule_id}),
        )
        return
    if expected_revision and rule.revision != expected_revision:
        logger.info(
            "integration_rule_revision_mismatch",
            extra=integration_log_extra(
                rule=rule,
                extra={'rule_id': rule.id, 'expected': expected_revision, 'actual': rule.revision},
            ),
        )
        return
    if rule.resync_required or rule.connection.needs_reauth or not rule.connection.is_active or rule.connection.is_disabled:
        logger.info("integration_rule_not_runnable", extra=integration_log_extra(rule=rule, extra={'rule_id': rule.id}))
        return
    ttl = lock_ttl_seconds(rule.config or {})
    if not acquire_rule_lock(rule.connection_id, rule.object_key, ttl):
        logger.info("integration_rule_skip_locked", extra=integration_log_extra(rule=rule, extra={'rule_id': rule.id}))
        return
    request_meta = getattr(self, 'request', None)
    celery_task_id = (getattr(request_meta, 'id', None) or '') if request_meta else ''
    job = IntegrationJob.objects.create(
        connection=rule.connection,
        provider=rule.connection.provider,
        object_key=rule.object_key,
        status='running',
        payload={'rule_id': rule.id, 'config': rule.config, 'revision': rule.revision},
        celery_id=celery_task_id,
        started_at=timezone.now(),
    )
    rule.last_run_at = timezone.now()
    rule.save(update_fields=['last_run_at'])
    success = False
    logs: list[dict] = []
    job_metrics: dict | None = None
    request_token = None
    try:
        request_token = set_current_request_id(job.celery_id or f"integration-job-{job.id}")
        executor = RuleExecutor(rule, job, self)
        job_metrics = executor.execute()
        logs = executor.logs
        success = True
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception(
            "integration_rule_error",
            extra=integration_log_extra(rule=rule, job=job, extra={'rule_id': rule.id}),
        )
        logs.append({'level': 'error', 'message': str(exc), 'timestamp': timezone.now().isoformat()})
        success = False
        error_message = str(exc)
    finally:
        job.mark_finished(success, logs=logs if logs else None, metrics=job_metrics)
        if request_token is not None:
            reset_request_id(request_token)
        release_rule_lock(rule.connection_id, rule.object_key)
        now = timezone.now()
        next_run = schedule_next_run(rule, base_time=now, commit=False)
        updates = ['next_run_at', 'last_error', 'updated_at']
        if success:
            rule.last_success_at = now
            rule.last_error = ''
            updates.append('last_success_at')
        else:
            rule.last_error = locals().get('error_message', 'Sync failed')
        rule.next_run_at = next_run
        rule.save(update_fields=updates)


@shared_task
def integration_rule_planner():
    health = scheduler_health()
    if not health['healthy']:
        logger.warning('integration_scheduler_paused', extra=integration_log_extra(extra={'reason': health.get('message')}))
        return
    now = timezone.now()
    rules = (
        IntegrationRule.objects.select_related('connection', 'connection__provider')
        .filter(
            is_enabled=True,
            resync_required=False,
            connection__is_active=True,
            connection__is_disabled=False,
            connection__needs_reauth=False,
            next_run_at__isnull=False,
            next_run_at__lte=now,
        )
        .order_by('next_run_at')[:50]
    )
    for rule in rules:
        run_integration_rule.apply_async(args=[rule.id], kwargs={'expected_revision': rule.revision})
        rule.next_run_at = None
        rule.save(update_fields=['next_run_at'])
