import os
import tempfile
from celery import Celery
from celery.schedules import crontab
from django.conf import settings

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('workload_tracker')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

# Ensure Celery Beat can persist its schedule on read-only app mounts.
# Use env override if provided; otherwise default to a writable temp dir.
_beat_dir = os.getenv('CELERY_BEAT_DIR') or tempfile.gettempdir()
_beat_file = os.getenv('CELERY_BEAT_SCHEDULE_FILE') or os.path.join(_beat_dir, 'celerybeat-schedule')
app.conf.beat_schedule_filename = _beat_file

# Timezone hygiene
try:
    app.conf.timezone = getattr(settings, 'TIME_ZONE', 'UTC') or 'UTC'
except Exception:
    app.conf.timezone = 'UTC'
app.conf.enable_utc = True


def _parse_cron(expr: str | None):
    """Parse a 5-field cron string into a celery crontab. Return None on invalid."""
    if not expr or not isinstance(expr, str):
        return None
    try:
        fields = expr.strip().split()
        if len(fields) != 5:
            return None
        minute, hour, day_of_month, month_of_year, day_of_week = fields
        return crontab(minute=minute, hour=hour, day_of_month=day_of_month, month_of_year=month_of_year, day_of_week=day_of_week)
    except Exception:
        return None


# Optional automation via env
if os.getenv('ENABLE_AUTOMATION', 'false').lower() == 'true':
    beat_entries = {}
    backup_cron = _parse_cron(os.getenv('BACKUP_SCHEDULE_CRON', '0 2 * * *'))
    cleanup_cron = _parse_cron(os.getenv('CLEANUP_SCHEDULE_CRON', '30 2 * * *'))

    # Nightly backup
    if backup_cron is not None:
        beat_entries['nightly-backup'] = {
            'task': 'core.backup_tasks.create_backup_task',
            'schedule': backup_cron,
            'kwargs': {'description': 'Scheduled backup'},
            'options': {'queue': 'db_maintenance'},
        }

    # Daily cleanup
    if cleanup_cron is not None:
        # Read retention defaults from env; tasks accept None to use command defaults
        def _intval(key: str):
            v = os.getenv(key)
            try:
                return int(v) if v and str(v).isdigit() else None
            except Exception:
                return None

        beat_entries['daily-cleanup'] = {
            'task': 'core.backup_tasks.cleanup_retention_task',
            'schedule': cleanup_cron,
            'kwargs': {
                'daily': _intval('BACKUP_RETENTION_DAILY'),
                'weekly': _intval('BACKUP_RETENTION_WEEKLY'),
                'monthly': _intval('BACKUP_RETENTION_MONTHLY'),
                'dry_run': False,
            },
            'options': {'queue': 'db_maintenance'},
        }

    # Optional offsite sync schedule (03:00 UTC by default when enabled)
    if os.getenv('OFFSITE_ENABLED', 'false').lower() == 'true':
        sync_cron = _parse_cron(os.getenv('OFFSITE_SCHEDULE_CRON', '0 3 * * *'))
        if sync_cron is not None:
            beat_entries['offsite-sync'] = {
                'task': 'core.backup_tasks.sync_backups_task',
                'schedule': sync_cron,
                'options': {'queue': 'db_maintenance'},
            }

    # Optional nightly restore test (disabled unless RESTORE_TEST_ENABLED=true)
    if os.getenv('RESTORE_TEST_ENABLED', 'false').lower() == 'true':
        test_cron = _parse_cron(os.getenv('RESTORE_TEST_SCHEDULE_CRON'))
        if test_cron is not None:
            beat_entries['restore-test'] = {
                'task': 'core.backup_tasks.restore_latest_safety_task',
                'schedule': test_cron,
                'options': {'queue': 'db_maintenance'},
            }

    if beat_entries:
        # Merge with any existing schedule
        current = getattr(app.conf, 'beat_schedule', {}) or {}
        current.update(beat_entries)
        app.conf.beat_schedule = current


@app.task(bind=True)
def health(self):  # simple sanity task
    return 'ok'
