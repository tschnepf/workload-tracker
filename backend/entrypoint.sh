#!/bin/sh
set -e

echo "Waiting for database readiness (pg_isready)..."
# Allow overrides via env, default to compose service defaults
DB_HOST=${POSTGRES_HOST:-db}
DB_PORT=${POSTGRES_PORT:-5432}
DB_USER=${POSTGRES_USER:-postgres}
DB_NAME=${POSTGRES_DB:-postgres}

# Prefer pg_isready (accurate readiness) with a simple retry loop
RETRIES=${DB_WAIT_RETRIES:-60}
SLEEP=${DB_WAIT_SLEEP_SECS:-1}
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; do
  RETRIES=$((RETRIES-1))
  if [ "$RETRIES" -le 0 ]; then
    echo "Database not ready after wait; will proceed and let app handle retries."
    break
  fi
  sleep "$SLEEP"
done
echo "Database check complete."

# Ensure Django settings module is available for any direct Python calls
export DJANGO_SETTINGS_MODULE=${DJANGO_SETTINGS_MODULE:-config.settings}

IS_CELERY=0
case "$1" in
  celery|*celery*) IS_CELERY=1 ;;
esac

if [ "${RUN_MIGRATIONS_ON_START:-true}" = "true" ] || [ "${RUN_MIGRATIONS_ON_START:-true}" = "1" ]; then
  echo "Running migrations..."
  python manage.py migrate --noinput
else
  echo "Skipping migrations (RUN_MIGRATIONS_ON_START=${RUN_MIGRATIONS_ON_START})"
fi

# Dev-safe repair for SimpleJWT blacklist tables when schema mismatches occur
if [ "$IS_CELERY" -eq 0 ]; then
  python manage.py repair_token_blacklist --yes || echo "repair_token_blacklist failed or skipped; continuing"
else
  echo "Skipping repair_token_blacklist for Celery processes"
fi

if [ "${COLLECT_STATIC:-true}" = "true" ] && [ "$IS_CELERY" -eq 0 ]; then
  echo "Collecting static files..."
  python manage.py collectstatic --noinput || echo "collectstatic skipped or failed (non-fatal for non-web services)"
else
  echo "Skipping collectstatic (COLLECT_STATIC=${COLLECT_STATIC})"
fi

# Ensure Celery beat schedule directory exists if a custom path is configured
if [ -n "${CELERY_BEAT_SCHEDULE_FILE:-}" ]; then
  BEAT_DIR=$(dirname "${CELERY_BEAT_SCHEDULE_FILE}")
  mkdir -p "$BEAT_DIR"
fi

if [ "${DEBUG:-false}" = "true" ]; then
  echo "Ensuring default superuser (dev only)..."
  python - <<'PY'
import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()
import os
from django.contrib.auth import get_user_model
User = get_user_model()
u = os.getenv('DJANGO_SUPERUSER_USERNAME','admin')
e = os.getenv('DJANGO_SUPERUSER_EMAIL','admin@example.com')
p = os.getenv('DJANGO_SUPERUSER_PASSWORD','admin123')
try:
    if not User.objects.filter(username=u).exists():
        User.objects.create_superuser(username=u, email=e, password=p)
except Exception as exc:
    print('superuser ensure error:', exc)
PY
fi

echo "Starting server: $@"
exec "$@"
