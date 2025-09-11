#!/bin/sh
set -e

echo "Waiting for database..."
until nc -z -w 3 db 5432; do
  sleep 1
done
echo "Database is ready."

# Ensure Django settings module is available for any direct Python calls
export DJANGO_SETTINGS_MODULE=${DJANGO_SETTINGS_MODULE:-config.settings}

echo "Running migrations..."
python manage.py migrate --noinput

echo "Collecting static files..."
python manage.py collectstatic --noinput

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
