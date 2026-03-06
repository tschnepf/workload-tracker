from __future__ import annotations

import io
import json
import re
from datetime import datetime, timezone as dt_timezone

from celery import shared_task
from django.core.management import call_command
from django.utils import timezone

from core.backup_config import resolve_backups_dir, set_runtime_backups_dir
from core.backup_schedule import evaluate_due, next_scheduled_run
from core.backup_service import BackupService


def _call_command_json(command: str, *args, **kwargs) -> dict:
    buf = io.StringIO()
    call_command(command, *args, stdout=buf, **kwargs)
    buf.seek(0)
    try:
        return json.loads(buf.read() or '{}')
    except Exception:
        return {}


@shared_task(bind=True, soft_time_limit=7200, time_limit=10800)
def create_backup_task(self, description: str | None = None) -> dict:
    """Run backup command and parse JSON output without ORM usage."""
    return _call_command_json('backup_database', description=description)


@shared_task(bind=True, soft_time_limit=3600, time_limit=5400)
def cleanup_retention_task(self, daily: int | None = None, weekly: int | None = None, monthly: int | None = None, dry_run: bool = False) -> dict:
    """Enforce retention policy by invoking the management command."""
    # Build args safely
    args = []
    if daily is not None:
        args += ["--daily", str(daily)]
    if weekly is not None:
        args += ["--weekly", str(weekly)]
    if monthly is not None:
        args += ["--monthly", str(monthly)]
    if dry_run:
        args += ["--dry-run"]
    return _call_command_json('cleanup_backups', *args)


def _iso_utc(value):
    if value is None:
        return None
    try:
        if value.tzinfo is None:
            value = value.replace(tzinfo=dt_timezone.utc)
        return value.astimezone(dt_timezone.utc).isoformat().replace('+00:00', 'Z')
    except Exception:  # nosec B110
        return None


@shared_task(bind=True, soft_time_limit=10800, time_limit=14400)
def automatic_backup_scheduler_task(self) -> dict:
    """Evaluate persisted schedule settings and run automatic backup when due."""
    try:
        from core.models import BackupAutomationSettings
    except Exception as exc:
        return {'status': 'skipped', 'reason': 'settings_unavailable', 'detail': str(exc)}

    try:
        settings_obj = BackupAutomationSettings.get_active()
    except Exception as exc:
        return {'status': 'skipped', 'reason': 'settings_unavailable', 'detail': str(exc)}

    # Keep process/runtime cache in sync for lock checks and command paths.
    try:
        set_runtime_backups_dir(settings_obj.backups_dir)
    except Exception:  # nosec B110
        pass

    now_utc = timezone.now()
    evaluation = evaluate_due(
        settings_obj,
        now_utc=now_utc,
        last_run_at=getattr(settings_obj, 'last_automatic_backup_at', None),
    )
    current_run_at = evaluation.get('currentRunAt')
    next_run_at = evaluation.get('nextRunAt')
    changed_fields: list[str] = []
    if getattr(settings_obj, 'next_automatic_backup_at', None) != next_run_at:
        settings_obj.next_automatic_backup_at = next_run_at
        changed_fields.append('next_automatic_backup_at')

    if not bool(evaluation.get('enabled', True)):
        if changed_fields:
            changed_fields.append('updated_at')
            settings_obj.save(update_fields=changed_fields)
        return {
            'status': 'skipped',
            'reason': 'disabled',
            'nextAutomaticBackupAt': _iso_utc(next_run_at),
        }

    if not bool(evaluation.get('due', False)):
        if changed_fields:
            changed_fields.append('updated_at')
            settings_obj.save(update_fields=changed_fields)
        return {
            'status': 'skipped',
            'reason': 'not_due',
            'currentRunAt': _iso_utc(current_run_at),
            'nextAutomaticBackupAt': _iso_utc(next_run_at),
        }

    backups_dir = resolve_backups_dir()
    svc = BackupService(backups_dir=backups_dir)
    if svc.has_active_lock():
        if changed_fields:
            changed_fields.append('updated_at')
            settings_obj.save(update_fields=changed_fields)
        return {
            'status': 'skipped',
            'reason': 'lock_active',
            'currentRunAt': _iso_utc(current_run_at),
            'nextAutomaticBackupAt': _iso_utc(next_run_at),
        }

    # If another path (legacy cron/manual) already created a backup in this window,
    # mark this window as complete to avoid duplicate archives.
    if current_run_at is not None:
        latest = None
        for item in svc.list_backups(include_hash=False):
            created_raw = str(item.get('createdAt') or '')
            if not created_raw:
                continue
            try:
                created_iso = created_raw[:-1] + '+00:00' if created_raw.endswith('Z') else created_raw
                created = datetime.fromisoformat(created_iso)
            except Exception:
                continue
            if created.tzinfo is None:
                created = created.replace(tzinfo=dt_timezone.utc)
            if created < current_run_at:
                continue
            if latest is None or created > latest[0]:
                latest = (created, item)
        if latest is not None:
            created, meta = latest
            settings_obj.last_automatic_backup_at = created
            settings_obj.last_automatic_backup_filename = str(meta.get('filename') or '')
            settings_obj.next_automatic_backup_at = next_scheduled_run(settings_obj, now_utc=now_utc)
            settings_obj.save(
                update_fields=[
                    'last_automatic_backup_at',
                    'last_automatic_backup_filename',
                    'next_automatic_backup_at',
                    'updated_at',
                ]
            )
            return {
                'status': 'skipped',
                'reason': 'already_completed',
                'currentRunAt': _iso_utc(current_run_at),
                'nextAutomaticBackupAt': _iso_utc(settings_obj.next_automatic_backup_at),
                'filename': settings_obj.last_automatic_backup_filename,
            }

    backup_result = _call_command_json('backup_database', description='Scheduled automatic backup')

    cleanup_result = svc.cleanup_retention(
        keep_daily=int(getattr(settings_obj, 'retention_daily', 7) or 7),
        keep_weekly=int(getattr(settings_obj, 'retention_weekly', 4) or 4),
        keep_monthly=int(getattr(settings_obj, 'retention_monthly', 12) or 12),
        dry_run=False,
    )

    completed_at = timezone.now()
    settings_obj.last_automatic_backup_at = completed_at
    settings_obj.last_automatic_backup_filename = str(backup_result.get('filename') or '')
    settings_obj.next_automatic_backup_at = next_scheduled_run(settings_obj, now_utc=completed_at)
    settings_obj.save(
        update_fields=[
            'last_automatic_backup_at',
            'last_automatic_backup_filename',
            'next_automatic_backup_at',
            'updated_at',
        ]
    )

    return {
        'status': 'ok',
        'backup': backup_result,
        'cleanup': cleanup_result,
        'currentRunAt': _iso_utc(current_run_at),
        'lastAutomaticBackupAt': _iso_utc(settings_obj.last_automatic_backup_at),
        'nextAutomaticBackupAt': _iso_utc(settings_obj.next_automatic_backup_at),
    }


@shared_task(bind=True, soft_time_limit=7200, time_limit=10800)
def sync_backups_task(self, force: bool = False) -> dict:
    """Run offsite sync via management command."""
    args = []
    if force:
        args.append("--force")
    return _call_command_json('sync_backups', *args)


@shared_task(bind=True, soft_time_limit=7200, time_limit=10800)
def restore_latest_safety_task(self) -> dict:
    """Run nightly restore drill to a disposable database (see management command)."""
    return _call_command_json('restore_latest_safety')


@shared_task(bind=True, soft_time_limit=7200, time_limit=10800)
def restore_backup_task(
    self,
    path: str,
    jobs: int = 2,
    confirm: str | None = None,
    migrate: bool = False,
) -> dict:
    """Run restore command and parse JSON output without ORM usage."""
    class _ProgressStream:
        def __init__(self, task):
            self.task = task
            self._buf = []
            self._regex = re.compile(r"^PROGRESS\s+(\d{1,3})\s+(.*)$")

        def write(self, s: str):
            # Called by management command as it runs. We look for lines like
            # "PROGRESS <percent> <message>" and emit Celery meta updates.
            try:
                for line in str(s).splitlines():
                    m = self._regex.match(line.strip())
                    if m:
                        pct = max(0, min(100, int(m.group(1))))
                        msg = m.group(2)
                        try:
                            self.task.update_state(state='PROGRESS', meta={'progress': pct, 'message': msg})
                        except Exception:  # nosec B110
                            pass
            except Exception:  # nosec B110
                pass

        def flush(self):
            pass

    json_buf = io.StringIO()
    progress = _ProgressStream(self)
    # Capture JSON on stdout; progress on stderr
    call_command('restore_database', path=path, jobs=jobs, confirm=confirm, migrate=migrate, stdout=json_buf, stderr=progress)
    json_buf.seek(0)
    try:
        return json.loads(json_buf.read() or '{}')
    except Exception:
        return {}
