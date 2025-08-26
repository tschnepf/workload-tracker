FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    curl \
    netcat-traditional \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python packages
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Create entrypoint script
RUN echo '#!/bin/bash\n\
set -e\n\
echo "Waiting for database..."\n\
while ! nc -z db 5432; do sleep 1; done\n\
echo "Database ready!"\n\
echo "Running migrations..."\n\
python manage.py migrate --noinput\n\
echo "Collecting static files..."\n\
python manage.py collectstatic --noinput\n\
if [ "$DEBUG" = "true" ]; then\n\
    echo "Creating default superuser..."\n\
    python manage.py createsuperuser --noinput || true\n\
fi\n\
echo "Starting server..."\n\
exec "$@"' > /entrypoint.sh && chmod +x /entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]