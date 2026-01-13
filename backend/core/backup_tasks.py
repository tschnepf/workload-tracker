from __future__ import annotations

from celery import shared_task
from django.core.management import call_command
import io
import re
import json


@shared_task(bind=True, soft_time_limit=7200, time_limit=10800)
def create_backup_task(self, description: str | None = None) -> dict:
    """Run backup command and parse JSON output without ORM usage."""
    buf = io.StringIO()
    call_command('backup_database', description=description, stdout=buf)
    buf.seek(0)
    try:
        return json.loads(buf.read() or '{}')
    except Exception:
        return {}


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
    buf = io.StringIO()
    call_command('cleanup_backups', *args, stdout=buf)
    buf.seek(0)
    try:
        return json.loads(buf.read() or '{}')
    except Exception:
        return {}


@shared_task(bind=True, soft_time_limit=7200, time_limit=10800)
def sync_backups_task(self, force: bool = False) -> dict:
    """Run offsite sync via management command."""
    args = []
    if force:
        args.append("--force")
    buf = io.StringIO()
    call_command('sync_backups', *args, stdout=buf)
    buf.seek(0)
    try:
        return json.loads(buf.read() or '{}')
    except Exception:
        return {}


@shared_task(bind=True, soft_time_limit=7200, time_limit=10800)
def restore_latest_safety_task(self) -> dict:
    """Run nightly restore drill to a disposable database (see management command)."""
    buf = io.StringIO()
    call_command('restore_latest_safety', stdout=buf)
    buf.seek(0)
    try:
        return json.loads(buf.read() or '{}')
    except Exception:
        return {}


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
