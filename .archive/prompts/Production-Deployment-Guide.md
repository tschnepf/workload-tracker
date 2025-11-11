# Production Deployment Guide - Workload Tracker

## 🎯 Production Readiness Assessment

The workload tracker application is **production-ready** with comprehensive infrastructure already in place. The existing production configuration includes:

- ✅ Multi-stage Docker builds (dev/production targets)
- ✅ Production-optimized django-compose.prod.yml
- ✅ Nginx reverse proxy with security headers
- ✅ Non-root container users for security
- ✅ Production WSGI server (Gunicorn)
- ✅ Health checks and restart policies
- ✅ Redis authentication and persistence
- ✅ PostgreSQL production tuning
- ✅ Static file and media handling
- ✅ SSL/HTTPS configuration ready

## 📋 Deployment Preparation Checklist

### 1️⃣ CODEBASE PREPARATION

#### Required Changes to Repository:
```bash
# Create production environment template
cp .env.example .env.production.template

# Update .env.production.template with production defaults
# (Keep placeholder values for secrets - will be replaced during deployment)
```

#### Optional Codebase Improvements:
- **Health Check Enhancement**: Consider adding database connectivity check to `/api/health/`
- **Logging Configuration**: Add structured logging configuration for production
- **Error Pages**: Add custom 404/500 error pages for nginx

#### Files to Create/Update:
- ✅ `.env.production.template` - Production environment template
- 🔄 `docker-compose.override.yml` - Optional local development overrides  
- 🔄 `README.md` - Update with production deployment instructions

### 2️⃣ GITHUB REPOSITORY PREPARATION

#### Required GitHub Secrets:
Configure these in your GitHub repository settings → Secrets and variables → Actions:

```bash
# Docker Hub credentials
DOCKER_USERNAME=your-dockerhub-username
DOCKER_PASSWORD=your-dockerhub-password (or access token)

# Optional: Production deployment secrets
PROD_SSH_KEY=your-production-server-ssh-key
PROD_HOST=your-production-server-ip
```

#### GitHub Actions Workflow:
Create `.github/workflows/docker-publish.yml`:

```yaml
name: Build and Push Docker Images

on:
  push:
    branches: [ main ]
    tags: [ 'v*' ]
  pull_request:
    branches: [ main ]

env:
  REGISTRY: docker.io
  BACKEND_IMAGE: your-username/workload-tracker-backend
  FRONTEND_IMAGE: your-username/workload-tracker-frontend

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
    - name: Checkout repository
      uses: actions/checkout@v4

    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v3

    - name: Log in to Docker Hub
      if: github.event_name != 'pull_request'
      uses: docker/login-action@v3
      with:
        registry: ${{ env.REGISTRY }}
        username: ${{ secrets.DOCKER_USERNAME }}
        password: ${{ secrets.DOCKER_PASSWORD }}

    - name: Extract metadata (backend)
      id: meta-backend
      uses: docker/metadata-action@v5
      with:
        images: ${{ env.REGISTRY }}/${{ env.BACKEND_IMAGE }}
        tags: |
          type=ref,event=branch
          type=ref,event=pr
          type=semver,pattern={{version}}
          type=semver,pattern={{major}}.{{minor}}

    - name: Build and push backend
      uses: docker/build-push-action@v5
      with:
        context: ./backend
        file: ./docker/backend/Dockerfile
        target: production
        push: ${{ github.event_name != 'pull_request' }}
        tags: ${{ steps.meta-backend.outputs.tags }}
        labels: ${{ steps.meta-backend.outputs.labels }}
        cache-from: type=gha
        cache-to: type=gha,mode=max

    - name: Extract metadata (frontend)
      id: meta-frontend
      uses: docker/metadata-action@v5
      with:
        images: ${{ env.REGISTRY }}/${{ env.FRONTEND_IMAGE }}
        tags: |
          type=ref,event=branch
          type=ref,event=pr
          type=semver,pattern={{version}}
          type=semver,pattern={{major}}.{{minor}}

    - name: Build and push frontend
      uses: docker/build-push-action@v5
      with:
        context: ./frontend
        file: ./docker/frontend/Dockerfile
        target: production
        push: ${{ github.event_name != 'pull_request' }}
        tags: ${{ steps.meta-frontend.outputs.tags }}
        labels: ${{ steps.meta-frontend.outputs.labels }}
        cache-from: type=gha
        cache-to: type=gha,mode=max
```

#### Protected Branch Rules:
- Enable branch protection on `main`
- Require pull request reviews
- Require status checks to pass (if you add tests)

### 3️⃣ DOCKER HUB PREPARATION

#### Create Docker Hub Repositories:
1. Log into [Docker Hub](https://hub.docker.com)
2. Create repositories:
   - `your-username/workload-tracker-backend`
   - `your-username/workload-tracker-frontend`
   - `your-username/workload-tracker-nginx` (optional)

#### Docker Hub Settings:
- Set repositories to **Public** (or Private if you have a paid plan)
- Add repository descriptions
- Link to GitHub repository for automated builds

#### Manual Docker Build & Push (Alternative to GitHub Actions):
```bash
# Login to Docker Hub
docker login

# Build production images
docker build -f docker/backend/Dockerfile --target production -t your-username/workload-tracker-backend:latest ./backend
docker build -f docker/frontend/Dockerfile --target production -t your-username/workload-tracker-frontend:latest ./frontend

# Tag with version
docker tag your-username/workload-tracker-backend:latest your-username/workload-tracker-backend:v1.0.0
docker tag your-username/workload-tracker-frontend:latest your-username/workload-tracker-frontend:v1.0.0

# Push to Docker Hub
docker push your-username/workload-tracker-backend:latest
docker push your-username/workload-tracker-backend:v1.0.0
docker push your-username/workload-tracker-frontend:latest
docker push your-username/workload-tracker-frontend:v1.0.0
```

### 4️⃣ EVERYTHING ELSE (Infrastructure & Deployment)

#### Production Server Requirements:
- **OS**: Ubuntu 20.04+ or similar Linux distribution
- **RAM**: Minimum 2GB, Recommended 4GB+
- **Storage**: Minimum 20GB SSD
- **Docker**: Docker Engine 20.10+ and Docker Compose V2
- **Network**: Static IP or domain name

#### Production Environment Setup:

Create production `.env` file on your server:

```bash
# === Application Settings ===
APP_NAME=workload-tracker
DEBUG=false
SECRET_KEY=your-super-secret-production-key-here  # Generate strong key!
ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com

# === Database Settings ===
POSTGRES_DB=workload_tracker_prod
POSTGRES_USER=workload_user
POSTGRES_PASSWORD=super-secure-password-here
POSTGRES_HOST=db
POSTGRES_PORT=5432

# === Redis Settings ===
REDIS_PASSWORD=workload-redis-prod-password

# === Security ===
CSP_ENABLED=true
CSP_REPORT_ONLY=false  # Set to false for production enforcement
LOGIN_PROTECTION=true
AXES_FAILURE_LIMIT=5
AXES_COOLOFF_TIME=1

# === Production Performance ===
DB_CONN_MAX_AGE=300
DB_CONN_HEALTH_CHECKS=true
SHORT_TTL_AGGREGATES=true

# === Background Jobs ===
ASYNC_JOBS=true
CELERY_BROKER_URL=redis://:workload-redis-prod-password@redis:6379/1
CELERY_RESULT_BACKEND=redis://:workload-redis-prod-password@redis:6379/1

# === Monitoring (Optional) ===
SENTRY_DSN=your-sentry-dsn-here
VITE_SENTRY_ORG=your-org
VITE_SENTRY_PROJECT=your-project
VITE_SENTRY_AUTH_TOKEN=your-auth-token
```

### 2. SSL Certificate Setup (Recommended)

Place SSL certificates in `nginx/ssl/`:
```bash
nginx/ssl/
├── cert.pem     # Your SSL certificate
└── key.pem      # Your private key
```

Update `nginx/sites-available/workload-tracker.conf` to uncomment HTTPS configuration.

### 3. Domain Configuration

Update `nginx/sites-available/workload-tracker.conf`:
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;  # Change this
    
    # Redirect HTTP to HTTPS in production
    return 301 https://$server_name$request_uri;
}
```

#### SSL Certificate Setup (Recommended):

Place SSL certificates in `nginx/ssl/`:
```bash
nginx/ssl/
├── cert.pem     # Your SSL certificate  
└── key.pem      # Your private key
```

Update `nginx/sites-available/workload-tracker.conf` to uncomment HTTPS configuration.

#### Domain Configuration:

Update `nginx/sites-available/workload-tracker.conf`:
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;  # Change this
    
    # Redirect HTTP to HTTPS in production
    return 301 https://$server_name$request_uri;
}
```

## 🚀 DEPLOYMENT EXECUTION ORDER

### Step 1: Prepare Code Repository
```bash
# Create production environment template
cp .env.example .env.production.template

# Commit preparation changes
git add .env.production.template
git commit -m "Add production environment template"
git push origin main
```

### Step 2: Setup GitHub Actions (if using automated deployment)
```bash
# Create GitHub Actions workflow
mkdir -p .github/workflows
# Copy workflow from above section

git add .github/workflows/docker-publish.yml
git commit -m "Add Docker Hub publishing workflow"
git push origin main
```

### Step 3: Configure Docker Hub
- Create repositories on Docker Hub
- Note your username for image naming

### Step 4: Deploy to Production Server

#### Option A: Using GitHub Actions (Automated)
```bash
# Tag a release to trigger automated build & push
git tag v1.0.0
git push origin v1.0.0

# On production server - pull images and deploy
docker-compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

#### Option B: Manual Build & Deploy
```bash
# On development machine - build and push
docker build -f docker/backend/Dockerfile --target production -t username/workload-tracker-backend:v1.0.0 ./backend
docker build -f docker/frontend/Dockerfile --target production -t username/workload-tracker-frontend:v1.0.0 ./frontend
docker push username/workload-tracker-backend:v1.0.0
docker push username/workload-tracker-frontend:v1.0.0

# On production server - deploy
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

---

## OpenAPI Typed Client Rollout (Phase 6)

Enable, monitor, and (if needed) roll back the OpenAPI typed client using frontend build‑time flags.

### Build‑time flags

The frontend Dockerfile accepts these `ARG`s which Vite picks up as `VITE_*` envs at build:

- `VITE_OPENAPI_MIGRATION_ENABLED` — master switch
- Reads (low risk): `VITE_OPENAPI_PEOPLE`, `VITE_OPENAPI_PROJECTS`, `VITE_OPENAPI_DEPARTMENTS`, `VITE_OPENAPI_ROLES`, `VITE_OPENAPI_DASHBOARD`
- CRUD (higher risk): `VITE_OPENAPI_ASSIGNMENTS`, `VITE_OPENAPI_SKILLS`, `VITE_OPENAPI_DELIVERABLES`, `VITE_OPENAPI_DELIVERABLE_ASSIGNMENTS`, `VITE_OPENAPI_AUTH`

`docker-compose.prod.yml` already contains a reads‑first canary under `frontend.build.args`.

### Rollout procedure

1) Reads‑first canary
- Ensure reads flags are "true" and CRUD flags are "false" in `docker-compose.prod.yml`.
- Rebuild + deploy frontend:
  - `docker compose -f docker-compose.yml -f docker-compose.prod.yml build frontend`
  - `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`

2) Smoke checks
- People/Projects/Departments pages render and paginate
- Dashboard loads; `weeks`/`department` honored

3) Monitor 24–48h
- Error rates: 401 (auth/refresh), 412 (conflicts), 5xx
- UI toasts / Sentry signals

4) Gradual CRUD enablement
- Flip CRUD flags in phases; rebuild + deploy each phase:
  - Phase A: People/Projects CRUD
  - Phase B: Assignments CRUD
  - Phase C: Deliverables + Skills CRUD
  - Phase D: DeliverableAssignments + Auth

### Rollback

- Set problematic flags back to "false" in `frontend.build.args`, rebuild frontend, redeploy.
- Legacy fetch paths remain until final cleanup, so rollback is immediate and low‑risk.

### Cleanup (after stability)

- Remove legacy fetch fallbacks in `frontend/src/services/api.ts` and `frontend/src/store/auth.ts`; keep typed client only.
- Keep `frontend/src/api/client.ts` interceptors as the single source of truth (Authorization, ETag capture/If‑Match, 401 refresh, 412 toast).
- CI: `.github/workflows/openapi-ci.yml` enforces schema + types freshness; consider failing CI on any Spectacular errors (> 0).

#### Option C: Build Locally on Server
```bash
# On production server
git clone https://github.com/your-username/workload-tracker.git
cd workload-tracker

# Create production environment
cp .env.production.template .env
# Edit .env with actual production values

# Deploy
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### Step 5: Verify Deployment
```bash
# Check service status
docker-compose -f docker-compose.yml -f docker-compose.prod.yml ps

# Test health endpoint  
curl -f http://your-domain/health

# Check logs
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f
```

## 🔒 Security Considerations

### Already Implemented:
- ✅ Non-root container users
- ✅ Security headers (HSTS, CSP, etc.)
- ✅ Rate limiting on auth endpoints
- ✅ Django CSRF and CORS protection
- ✅ Login attempt limiting (django-axes)
- ✅ Static file security rules

### Additional Recommendations:
1. **Firewall**: Restrict access to ports 5432 (PostgreSQL) and 6379 (Redis)
2. **Monitoring**: Set up log aggregation and monitoring
3. **Backups**: Implement automated PostgreSQL backups
4. **Updates**: Regular security updates for base images

## 📊 Monitoring & Health Checks

### Built-in Health Endpoints:
- `GET /health` - Overall application health
- `GET /api/health/` - Backend API health

### Docker Health Checks:
- All services include health check configurations
- Automatic restart on health check failures
- Dependency-based startup ordering

### Log Management:
```bash
# View logs
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f

# View specific service logs
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f backend
```

## 🔄 Deployment Workflow

### Development → Production Pipeline:

1. **Development**
   ```bash
   git checkout -b feature/new-feature
   # Make changes
   git commit -m "Add new feature"
   git push origin feature/new-feature
   ```

2. **Pull Request & Review**
   - Create PR to main branch
   - Code review and approval
   - Automated tests run

3. **Production Deployment**
   ```bash
   git checkout main
   git pull origin main
   git tag v1.0.1
   git push origin v1.0.1
   
   # GitHub Actions automatically builds and pushes Docker images
   # Deploy using updated images
   docker-compose -f docker-compose.yml -f docker-compose.prod.yml pull
   docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
   ```

## 📋 Production Maintenance

### Regular Tasks:
- **Database Backups**: Schedule regular PostgreSQL dumps
- **Log Rotation**: Configure log rotation for container logs
- **Updates**: Monthly security updates for base images
- **Monitoring**: Set up alerting for health check failures

### Emergency Procedures:
- **Rollback**: Use previous Docker image tags
- **Scaling**: Increase Gunicorn workers or add backend replicas
- **Database Recovery**: Restore from backups

---

## ✅ Summary

The Workload Tracker is **production-ready** with minimal configuration required:

1. **Set production environment variables** (`.env`)
2. **Configure domain name** (nginx config)  
3. **Add SSL certificates** (recommended)
4. **Deploy using docker-compose.prod.yml**

No code changes are required - the existing infrastructure handles production concerns including security, performance, monitoring, and scalability.
