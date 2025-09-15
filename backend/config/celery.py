import os
import tempfile
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('workload_tracker')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

# Ensure Celery Beat can persist its schedule on read-only app mounts.
# Use env override if provided; otherwise default to a writable temp dir.
_beat_dir = os.getenv('CELERY_BEAT_DIR') or tempfile.gettempdir()
_beat_file = os.getenv('CELERY_BEAT_SCHEDULE_FILE') or os.path.join(_beat_dir, 'celerybeat-schedule')
app.conf.beat_schedule_filename = _beat_file


@app.task(bind=True)
def health(self):  # simple sanity task
    return 'ok'
