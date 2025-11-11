# Production Deployment Guide

This guide explains how to deploy the Workload Tracker in production using Docker Compose with Nginx, Gunicorn, and optimized configurations.

## Quick Start

1. **Build production images:**
   ```bash
   make build-prod
   ```

2. **Start production stack:**
   ```bash
   make up-prod
   ```

3. **Access application:**
   - Main app: http://localhost
   - Admin: http://localhost/admin

## Production Architecture

```
Internet -> Nginx (Port 80) -> Backend (Gunicorn) + Frontend (Static Files)
                            -> PostgreSQL + Redis
```

### Services

- **Nginx**: Reverse proxy, static file server, load balancer
- **Backend**: Django app served by Gunicorn with gevent workers
- **Frontend**: React build served as static files
- **PostgreSQL**: Production-optimized database
- **Redis**: Caching with persistence

## Production Commands

```bash
# Build and start
make build-prod     # Build production images
make up-prod        # Start production stack
make down-prod      # Stop production stack

# Monitoring
make logs-prod      # View all logs
make backup-db      # Create database backup

# Manual operations
docker-compose -f docker-compose.yml -f docker-compose.prod.yml exec backend python manage.py shell

Controlled cutovers: set `RUN_MIGRATIONS_ON_START=false` on the backend, then `make up-prod` → `docker-compose -f docker-compose.yml -f docker-compose.prod.yml exec backend python manage.py migrate` → restore the flag to `true` on the next deploy.
```

## Using External Nginx (Disable Built‑in Proxy)

If you already run Nginx on the host (e.g., Unraid) and prefer to keep using it:

- Do not enable the built‑in Nginx service (it is behind a compose profile):
  - Omit `COMPOSE_PROFILES=proxy` when starting the stack.

- Expose backend/frontend to host ports using the host‑expose overlay:
  ```bash
  # Choose host ports as needed (defaults shown)
  set BACKEND_HOST_PORT=8000
  set FRONTEND_HOST_PORT=3000
  docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.host-expose.yml up -d
  ```

- Configure your host Nginx to reverse proxy:
  - Backend API: `proxy_pass http://127.0.0.1:8000;`
  - Frontend app: `proxy_pass http://127.0.0.1:3000;`

- Optional: If you do want to run the built‑in Nginx, enable the profile and optionally change host ports:
  ```bash
  set COMPOSE_PROFILES=proxy
  set NGINX_HTTP_PORT=8080
  set NGINX_HTTPS_PORT=8443
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d nginx
  ```

Notes
- The built‑in Nginx is now under the `proxy` profile and will not start unless `COMPOSE_PROFILES=proxy` is set.
- The overlay file `docker-compose.host-expose.yml` only adds host port bindings to backend/frontend and can be included or omitted per environment.

### Host Nginx Examples

Example A — Single domain with path routing (API under `/api`, frontend under `/`)

```
server {
    listen 80;
    server_name workload.example.com;

    # Security headers (safe, non-conflicting)
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=(), payment=()" always;
    # Optional: set HSTS in HTTPS server only

    # API: proxy to backend container
    location /api/backups/upload-restore/ {
        client_max_body_size 2g;
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Authorization $http_authorization;
        proxy_connect_timeout 60s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
    }

    # People/Projects import size overrides
    location /api/people/import_excel/ {
        client_max_body_size 100m;
        proxy_pass http://127.0.0.1:8000;
    }
    location /api/projects/import_excel/ {
        client_max_body_size 100m;
        proxy_pass http://127.0.0.1:8000;
    }

    # All other API calls
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Authorization $http_authorization;
        proxy_connect_timeout 60s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
    }

    # Frontend: proxy to static server on 3000
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }
}
```

Example B — Split subdomains (api.example.com and app.example.com)

```
# API subdomain
server {
    listen 80;
    server_name api.example.com;

    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=(), payment=()" always;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Authorization $http_authorization;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }
}

# Frontend subdomain
server {
    listen 80;
    server_name app.example.com;

    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=(), payment=()" always;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }
}
```

Tips
- Add TLS (443) server blocks with certificates and set HSTS headers in HTTPS servers only.
- If you need request rate limiting for auth endpoints, define a `limit_req_zone` in the global `http {}` and apply it to `location ~ ^/(api/)?(token|auth)/`.
- Avoid setting a global `Content-Security-Policy` at the host unless you mirror the backend policy exactly; the backend already injects CSP with nonces for dynamic pages.

## Configuration

### Environment Variables

Required production environment variables in `.env`:

```env
# Database
POSTGRES_DB=workload_tracker
POSTGRES_USER=postgres  
POSTGRES_PASSWORD=your-secure-password

# Redis
REDIS_PASSWORD=your-redis-password

# Django
DEBUG=false
SECRET_KEY=your-production-secret-key
DJANGO_SETTINGS_MODULE=config.settings
ALLOWED_HOSTS=your.domain.com,your-alt-domain.com
CORS_ALLOWED_ORIGINS=https://your.domain.com
AUTH_ENFORCED=true

# Cookie refresh (required in prod)
COOKIE_REFRESH_AUTH=true

# Optional: Database TLS (if database supports TLS)
# DB_SSLMODE=require
# DB_SSLROOTCERT=/path/to/rootCA.pem

# Optional: Redis TLS
# Use a TLS URL (rediss://...) or set REDIS_TLS=true and configure cert reqs
# REDIS_TLS=true
# REDIS_SSL_CERT_REQS=required   # or 'none' for self-signed in staging

# Optional monitoring
SENTRY_DSN=your-sentry-dsn

# Caching (optional)
# Global TTL for heavy aggregate endpoints (seconds). Reasonable range: 15–60.
AGGREGATE_CACHE_TTL=30
# Dashboard-specific TTL (seconds). Only set if you want the dashboard to differ.
# DASHBOARD_CACHE_TTL=15
```

### Production Optimizations

**Backend (Gunicorn):**
- 3 gevent workers with 1000 connections each
- Max 1000 requests per worker (memory leak protection)
- Preloaded application for faster startup
- Read-only code mounts for security

**Frontend:**
- Static build served by Nginx
- Aggressive caching (1 year for assets, 1 hour for HTML)
- Gzip compression enabled

**Database:**
- Optimized PostgreSQL configuration for production workloads
- Connection pooling (max 200 connections)
- Performance monitoring enabled
- Automatic backups to `/backups` directory

**Nginx:**
- HTTP/1.1 keepalive connections
- Gzip compression for text assets
- Security headers (CSRF, XSS, etc.)
- Static file caching with proper headers

**Caching (Redis vs LocMem):**
- In production, set `REDIS_URL` to enable the Redis cache backend (shared across workers).
- In development, the default LocMem cache is used per process.
- TTL precedence for dashboard caching: `DASHBOARD_CACHE_TTL` (if set) > `AGGREGATE_CACHE_TTL` > 30s fallback in code.

## Security Features

- Read-only container mounts where possible
- Security headers via Nginx
- Database connection limits
- Static file access restrictions
- Development tools disabled (Silk, debug mode)

### Cookie Refresh Mode (Required)
- Production must run in cookie refresh mode. Set both backend and frontend flags:
  - Backend: `COOKIE_REFRESH_AUTH=true`
  - Frontend build args: `VITE_COOKIE_REFRESH_AUTH="true"`
- Expected cookie flags in production: `HttpOnly`, `Secure`, `SameSite=Lax`.
- Verification:
  - Obtain/refresh tokens; inspect `Set-Cookie` headers for refresh cookie flags.
  - Ensure no refresh token is stored in `localStorage` (frontend uses cookie flow).

### JWT Idle/Access Token Policy
- Recommendation: set access token lifetime to 15–30 minutes in production.
- Configure via `JWT_ACCESS_MINUTES` environment variable (default is 60 minutes).
- Refresh rotation/blacklist remain enabled by default; no user action required.

### Database/Redis TLS (Optional)
- Postgres: enable TLS by setting `DB_SSLMODE` (e.g., `require`) and optional `DB_SSLROOTCERT` path. Ensure the database endpoint supports TLS.
- Redis: use a `rediss://` URL or set `REDIS_TLS=true`. Optionally set `REDIS_SSL_CERT_REQS` to `required` (recommended) or `none` (staging/self-signed).
- Verify TLS in service logs and client connection metadata where applicable.

### File Import Safety (People/Projects)

- Upload size limits (defaults; override via env):
  - `PEOPLE_UPLOAD_MAX_BYTES` (default 500 MiB)
  - `PROJECTS_UPLOAD_MAX_BYTES` (default 500 MiB)
- Projects import storage: uploads are streamed to a private path under `BACKUPS_DIR/incoming/projects` before parsing; not web‑served.
- Excel hardening: `.xlsx/.xls` imports are validated against ceilings before parsing:
  - Sheets ≤ 10; Rows per sheet ≤ 100,000; Total cells ≤ 5,000,000.
  - Adjustable via helper in `backend/core/utils/xlsx_limits.py` if needed.

### Content Security Policy (CSP)

- Backend injects a CSP header via `CSPMiddleware` with rollout flags:
  - `CSP_ENABLED=true|false`
  - `CSP_REPORT_ONLY=true|false` (keep `true` in dev/staging; set `false` in production)
  - `CSP_REPORT_URI` (defaults to `/csp-report/`)
- Default policy (no unsafe-inline):
  - `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'`
- Nonces/hashes:
  - The middleware generates a per-request nonce and appends `'nonce-<value>'` to `script-src` and `style-src`.
  - Prefer moving inline scripts/styles into bundled assets. If inline is unavoidable in Django templates, add `nonce` attributes using `request.csp_nonce`.
- Nginx mirrors the CSP header for static assets in `nginx/sites-available/workload-tracker.conf` (both HTTP/HTTPS blocks).
- Rollout guidance:
  1. Enable CSP in report-only mode and review violations (fonts, inline snippets, third-party).
  2. Address violations (self-host fonts or expand CSP origins as needed).
  3. Switch to enforcement in production (`CSP_REPORT_ONLY=false`).
  4. Keep report endpoint active to monitor regressions.

## Monitoring

### Health Checks
All services include health checks:
- Backend: `/api/health/` endpoint
- Frontend: HTTP 200 check
- Nginx: Configuration test
- Database/Redis: Built-in health checks

### Logging
- Structured JSON logs in containers
- Access logs with timing information
- Error logs with request context
- Database slow query logging (5+ seconds)

### Backup Strategy
```bash
# Manual backup
make backup-db

# Scheduled backups (add to crontab)
0 2 * * * cd /path/to/project && make backup-db
```

## Troubleshooting

### Common Issues

**Services won't start:**
```bash
# Check logs
make logs-prod

# Check service health
docker-compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

**Database connection errors:**
```bash
# Verify database is running
docker-compose -f docker-compose.yml -f docker-compose.prod.yml exec db pg_isready

# Check database logs
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs db
```

**Static files not loading:**
```bash
# Verify nginx configuration
docker-compose -f docker-compose.yml -f docker-compose.prod.yml exec nginx nginx -t

# Check static file mounts
docker-compose -f docker-compose.yml -f docker-compose.prod.yml exec nginx ls -la /var/www/
```

### Performance Tuning

**For high-traffic deployments:**

1. **Increase worker processes:**
   ```yaml
   # In docker-compose.prod.yml
   command: gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 6
   ```

2. **Enable horizontal scaling:**
   ```yaml
   backend:
     scale: 3  # Run 3 backend instances
   ```

3. **Add Redis cluster mode or external database**

## SSL/HTTPS Setup

Enable HTTPS once certificates are available:

1. Place SSL certificates in `nginx/ssl/`
   - `nginx/ssl/fullchain.pem`
   - `nginx/ssl/privkey.pem`
2. Enable the HTTPS site config
   - Rename `nginx/sites-available/workload-tracker-https.conf.disabled` to `nginx/sites-available/workload-tracker-https.conf`
3. Restart only Nginx (proxy profile)
   - `COMPOSE_PROFILES=proxy docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps nginx`
4. Validate
   - `curl -I https://<host>/` shows HSTS + CSP + Permissions-Policy
   - `curl -I https://<host>/api/health/` returns 200

## Deployment Checklist

- Hour Reallocation Rollout (Steps)
  - Precheck: Ensure feature flag `AUTO_REALLOCATION` is set as desired (default: enabled).
  - Step 1 — Normalize: Run `python manage.py normalize_weekly_hours --dry-run` then `--apply`.
  - Step 2 — Deploy: Ship code and migrations (incl. removal of `DeliverableAssignment.weekly_hours`).
  - Step 3 — Enable: Confirm `AUTO_REALLOCATION` enabled and restart app.
  - Step 4 — Verify: Change a deliverable date and verify the response includes `reallocation` summary.
  - Optional — Undo: Use `python manage.py undo_last_reallocation <deliverable_id> [--revert-date]` if needed.

- [ ] Environment variables configured
- [ ] SSL certificates in place (if using HTTPS)
- [ ] Database backups scheduled
- [ ] Monitoring/alerting configured
- [ ] Resource limits appropriate for server
- [ ] Security updates applied to base images
- [ ] Log rotation configured on host system

### Dev vs Prod Port Exposure
- Development (`docker-compose.yml`) exposes Redis (6379) and Postgres (5432) on the host for convenience.
- Production (`docker-compose.prod.yml`) runs services on the internal Docker network without exposing database/redis ports.
- Ensure production deployments only expose Nginx ports to the host (80/443); keep DB/Redis internal or managed.

## Maintenance

### Updates
```bash
# Stop production stack
make down-prod

# Pull latest code
git pull

# Rebuild and restart
make build-prod
make up-prod
```

### Database Maintenance
```bash
# Run migrations
docker-compose -f docker-compose.yml -f docker-compose.prod.yml exec backend python manage.py migrate

# Create admin user
docker-compose -f docker-compose.yml -f docker-compose.prod.yml exec backend python manage.py createsuperuser
```
### Authentication Enforcement
- `AUTH_ENFORCED` controls whether the backend enforces `IsAuthenticated` globally.
  - Keep `AUTH_ENFORCED=true` in production.
  - You may temporarily set `AUTH_ENFORCED=false` during staggered rollouts; switch back to true once frontend is deployed.

### Create Dev/Admin User (optional)
For staging or local production-like testing, create a user quickly:

```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml exec backend \
  python manage.py create_dev_user --username admin --password 'strongpass' --email admin@example.com --staff --superuser
```
