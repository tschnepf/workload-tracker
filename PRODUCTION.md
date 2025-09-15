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
```

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

Uncomment and configure the HTTPS server block in `nginx/sites-available/workload-tracker.conf`:

1. Place SSL certificates in `nginx/ssl/`
2. Update server configuration
3. Rebuild and restart: `make build-prod && make up-prod`

## Deployment Checklist

- [ ] Environment variables configured
- [ ] SSL certificates in place (if using HTTPS)
- [ ] Database backups scheduled
- [ ] Monitoring/alerting configured
- [ ] Resource limits appropriate for server
- [ ] Security updates applied to base images
- [ ] Log rotation configured on host system

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
