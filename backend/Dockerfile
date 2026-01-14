##########
# Builder stage: install Python deps into a virtualenv
##########
FROM python:3.11-slim AS builder
ENV DEBIAN_FRONTEND=noninteractive

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN python -m venv /opt/venv \
 && . /opt/venv/bin/activate \
 && pip install --upgrade pip \
 && pip install -r requirements.txt

##########
# Development stage: full environment, root user, hot-reload friendly
##########
FROM python:3.11-slim AS dev
ENV DEBIAN_FRONTEND=noninteractive

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    curl \
    netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /app/risk_attachments

COPY --from=builder /opt/venv /opt/venv
COPY . .
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD curl -fsS http://localhost:8000/health/ || exit 1
ENTRYPOINT ["/entrypoint.sh"]

##########
# Production stage: non-root runtime, smaller surface
##########
FROM python:3.11-slim AS production
ENV DEBIAN_FRONTEND=noninteractive

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    netcat-openbsd \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user and writable dirs
RUN groupadd -r app && useradd -r -g app app \
 && mkdir -p /app/staticfiles /app/media /app/risk_attachments \
 && chown -R app:app /app

COPY --from=builder /opt/venv /opt/venv
COPY . .
RUN chown -R app:app /app

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD curl -fsS http://localhost:8000/health/ || exit 1
ENTRYPOINT ["/entrypoint.sh"]
