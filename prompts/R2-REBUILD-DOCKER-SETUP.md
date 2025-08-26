# R2-REBUILD-DOCKER-SETUP: Docker Best Practices & Setup Guide

## Overview

Prevent common Docker issues by setting up correctly from day one. This guide ensures your containerized development matches production deployment.

## 🚨 Common Docker Problems & Solutions

### Problem 1: "Works locally, fails in container"

**Solution**: Develop inside Docker from day one

### Problem 2: "Can't connect to database"

**Solution**: Use Docker networking properly

### Problem 3: "Environment variables not working"

**Solution**: Single source of truth for configuration

### Problem 4: "No default auth/admin user"

**Solution**: Automated initialization scripts

## 📁 Project Structure for Docker Success

```
workload-tracker/
├── docker/                      # All Docker-related files
│   ├── backend/
│   │   ├── Dockerfile
│   │   ├── entrypoint.sh       # Startup script
│   │   └── wait-for-it.sh      # Database wait script
│   ├── frontend/
│   │   ├── Dockerfile
│   │   └── nginx.conf
│   └── postgres/
│       └── init.sql             # Database initialization
├── .env.example                 # Template for developers
├── .env                         # Local overrides (gitignored)
├── docker-compose.yml           # Development setup
├── docker-compose.prod.yml      # Production setup
└── Makefile                     # Common commands
```

## 🔧 Step 1: Environment Configuration

### Create .env.example (commit this)

```bash
# .env.example - Template for all developers
# Copy to .env and modify for your local setup

# === Application Settings ===
APP_NAME=workload-tracker
DEBUG=true
SECRET_KEY=dev-secret-key-change-in-production
ALLOWED_HOSTS=localhost,127.0.0.1,backend,frontend

# === Database Settings ===
POSTGRES_DB=workload_tracker
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_HOST=db
POSTGRES_PORT=5432

# === Django Database URL ===
DATABASE_URL=postgresql://postgres:postgres@db:5432/workload_tracker

# === API Settings ===
BACKEND_PORT=8000
FRONTEND_PORT=3000
API_BASE_URL=http://localhost:8000/api

# === Default Admin User (Development Only) ===
DJANGO_SUPERUSER_USERNAME=admin
DJANGO_SUPERUSER_EMAIL=admin@example.com
DJANGO_SUPERUSER_PASSWORD=admin123

# === Frontend Settings ===
VITE_API_URL=http://localhost:8000/api
VITE_APP_TITLE=Workload Tracker

# === Container Settings ===
COMPOSE_PROJECT_NAME=workload-tracker
DOCKER_BUILDKIT=1
```

### Create docker-compose.yml (development)

```yaml
# docker-compose.yml
version: '3.8'

services:
  # PostgreSQL Database
  db:
    image: postgres:15-alpine
    container_name: ${COMPOSE_PROJECT_NAME}-db
    restart: unless-stopped
    environment:
      - POSTGRES_DB=${POSTGRES_DB}
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./docker/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"  # Exposed for development tools
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - tracker-network

  # Django Backend
  backend:
    build:
      context: ./backend
      dockerfile: ../docker/backend/Dockerfile
      args:
        - DEBUG=${DEBUG}
    container_name: ${COMPOSE_PROJECT_NAME}-backend
    restart: unless-stopped
    command: python manage.py runserver 0.0.0.0:8000
    volumes:
      - ./backend:/app
      - static_volume:/app/staticfiles
      - media_volume:/app/media
    ports:
      - "${BACKEND_PORT}:8000"
    env_file:
      - .env
    depends_on:
      db:
        condition: service_healthy
    networks:
      - tracker-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/health/"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # React Frontend
  frontend:
    build:
      context: ./frontend
      dockerfile: ../docker/frontend/Dockerfile
      args:
        - VITE_API_URL=${VITE_API_URL}
    container_name: ${COMPOSE_PROJECT_NAME}-frontend
    restart: unless-stopped
    volumes:
      - ./frontend:/app
      - /app/node_modules  # Prevent node_modules overlap
    ports:
      - "${FRONTEND_PORT}:3000"
    environment:
      - VITE_API_URL=${VITE_API_URL}
    depends_on:
      - backend
    networks:
      - tracker-network
    command: npm run dev -- --host 0.0.0.0 --port 3000

  # Nginx (Production Only)
  nginx:
    image: nginx:alpine
    container_name: ${COMPOSE_PROJECT_NAME}-nginx
    profiles: ["production"]  # Only runs in production
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./docker/nginx/nginx.conf:/etc/nginx/nginx.conf
      - static_volume:/static
      - media_volume:/media
    depends_on:
      - backend
      - frontend
    networks:
      - tracker-network

volumes:
  postgres_data:
  static_volume:
  media_volume:

networks:
  tracker-network:
    driver: bridge
```

## 🐳 Step 2: Docker Files with Best Practices

### Backend Dockerfile

```dockerfile
# docker/backend/Dockerfile
FROM python:3.11-slim

# Set environment variables
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
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Copy and set entrypoint script
COPY ../docker/backend/entrypoint.sh /entrypoint.sh
COPY ../docker/backend/wait-for-it.sh /wait-for-it.sh
RUN chmod +x /entrypoint.sh /wait-for-it.sh

# Create non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
```

### Backend Entrypoint Script

```bash
#!/bin/bash
# docker/backend/entrypoint.sh

set -e

echo "Waiting for database..."
/wait-for-it.sh $POSTGRES_HOST:$POSTGRES_PORT -t 30

echo "Running migrations..."
python manage.py migrate --noinput

echo "Collecting static files..."
python manage.py collectstatic --noinput

# Create superuser if it doesn't exist (development only)
if [ "$DEBUG" = "true" ]; then
    echo "Creating default superuser..."
    python manage.py shell << EOF
from django.contrib.auth import get_user_model
User = get_user_model()
if not User.objects.filter(username='${DJANGO_SUPERUSER_USERNAME}').exists():
    User.objects.create_superuser(
        username='${DJANGO_SUPERUSER_USERNAME}',
        email='${DJANGO_SUPERUSER_EMAIL}',
        password='${DJANGO_SUPERUSER_PASSWORD}'
    )
    print("Superuser created successfully")
else:
    print("Superuser already exists")
EOF

    # Load sample data if needed
    if [ -f "fixtures/sample_data.json" ]; then
        echo "Loading sample data..."
        python manage.py loaddata fixtures/sample_data.json || true
    fi
fi

echo "Starting server..."
exec "$@"
```

### Frontend Dockerfile

```dockerfile
# docker/frontend/Dockerfile

# Development stage
FROM node:18-alpine AS development

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy application files
COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]

# Build stage
FROM node:18-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build with environment variables
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# Production stage
FROM nginx:alpine AS production

# Copy built files
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY docker/nginx/nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

## 🛠️ Step 3: Makefile for Common Commands

```makefile
# Makefile
.PHONY: help
help:
 @echo "Available commands:"
 @echo "  make setup          - Initial project setup"
 @echo "  make up             - Start all containers"
 @echo "  make down           - Stop all containers"
 @echo "  make rebuild        - Rebuild containers"
 @echo "  make logs           - View container logs"
 @echo "  make shell-backend  - Enter backend container"
 @echo "  make shell-db       - Enter database container"
 @echo "  make migrate        - Run database migrations"
 @echo "  make test           - Run tests"
 @echo "  make clean          - Clean up containers and volumes"

.PHONY: setup
setup:
 @echo "Setting up environment..."
 @cp -n .env.example .env || true
 @echo "Building containers..."
 @docker-compose build
 @echo "Starting services..."
 @docker-compose up -d
 @echo "Waiting for services to be ready..."
 @sleep 5
 @make migrate
 @echo "✅ Setup complete!"
 @echo "Access the application at:"
 @echo "  - Frontend: http://localhost:3000"
 @echo "  - Backend:  http://localhost:8000"
 @echo "  - Admin:    http://localhost:8000/admin"
 @echo "  - Login:    admin / admin123"

.PHONY: up
up:
 docker-compose up -d

.PHONY: down
down:
 docker-compose down

.PHONY: rebuild
rebuild:
 docker-compose down
 docker-compose build --no-cache
 docker-compose up -d

.PHONY: logs
logs:
 docker-compose logs -f

.PHONY: logs-backend
logs-backend:
 docker-compose logs -f backend

.PHONY: shell-backend
shell-backend:
 docker-compose exec backend /bin/bash

.PHONY: shell-db
shell-db:
 docker-compose exec db psql -U postgres -d workload_tracker

.PHONY: migrate
migrate:
 docker-compose exec backend python manage.py makemigrations
 docker-compose exec backend python manage.py migrate

.PHONY: test
test:
 docker-compose exec backend python manage.py test
 docker-compose exec frontend npm test

.PHONY: clean
clean:
 docker-compose down -v
 docker system prune -f
```

## 🔍 Step 4: Health Checks & Monitoring

### Backend Health Check Endpoint

```python
# backend/config/health.py
from django.http import JsonResponse
from django.db import connection
import os

def health_check(request):
    """Health check endpoint for Docker and monitoring"""
    health_data = {
        'status': 'healthy',
        'service': 'backend',
        'environment': os.getenv('DEBUG', 'false'),
        'checks': {}
    }
    
    # Database check
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        health_data['checks']['database'] = 'ok'
    except Exception as e:
        health_data['status'] = 'unhealthy'
        health_data['checks']['database'] = str(e)
    
    # Check required environment variables
    required_vars = ['SECRET_KEY', 'DATABASE_URL']
    for var in required_vars:
        if os.getenv(var):
            health_data['checks'][f'env_{var}'] = 'ok'
        else:
            health_data['status'] = 'unhealthy'
            health_data['checks'][f'env_{var}'] = 'missing'
    
    status_code = 200 if health_data['status'] == 'healthy' else 503
    return JsonResponse(health_data, status=status_code)

# backend/config/urls.py
urlpatterns = [
    # ... other patterns
    path('api/health/', health_check, name='health_check'),
]
```

## 🚀 Step 5: Development Workflow

### Daily Development Commands

```bash
# Start your development environment
make setup  # First time only
make up     # Daily startup

# View logs if something isn't working
make logs-backend  # See what's happening

# Access the database
make shell-db
# Then run SQL queries directly

# Run Django commands
docker-compose exec backend python manage.py createsuperuser
docker-compose exec backend python manage.py shell

# Stop everything
make down
```

### Debugging Connection Issues

```bash
# 1. Check if containers are running
docker-compose ps

# 2. Check container logs
docker-compose logs backend
docker-compose logs db

# 3. Test network connectivity
docker-compose exec backend ping db
docker-compose exec backend curl http://frontend:3000

# 4. Verify environment variables
docker-compose exec backend env | grep DATABASE

# 5. Test database connection
docker-compose exec backend python -c "
from django.db import connection
cursor = connection.cursor()
cursor.execute('SELECT 1')
print('Database connected!')
"
```

## ⚠️ Critical Best Practices

### 1. **Always Use Container Names for Internal Communication**

```javascript
// frontend/.env
// Wrong - uses localhost
VITE_API_URL=http://localhost:8000/api

// Right - uses container name
VITE_API_URL=http://backend:8000/api

// Best - different for dev vs production
VITE_API_URL=${VITE_API_URL:-http://localhost:8000/api}
```

### 2. **Never Hardcode Ports or Hosts**

```python
# backend/settings.py
# Wrong
DATABASES = {
    'default': {
        'HOST': 'localhost',
        'PORT': 5432,
    }
}

# Right
import dj_database_url
DATABASES = {
    'default': dj_database_url.parse(
        os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@db:5432/workload_tracker')
    )
}
```

### 3. **Always Include Wait Scripts**

```bash
# wait-for-it.sh - Include this in your project
#!/bin/bash
# Use: ./wait-for-it.sh db:5432 -t 30
# This prevents "database not ready" errors
```

### 4. **Use Profiles for Different Environments**

```yaml
# docker-compose.yml
services:
  # Development tools
  adminer:
    image: adminer
    profiles: ["dev", "debug"]  # Only runs when specified
    ports:
      - "8080:8080"
      
  # Production services
  redis:
    image: redis:alpine
    profiles: ["production"]

# Run with: docker-compose --profile dev up
```

### 5. **Always Create Default Admin User**

```python
# backend/management/commands/init_admin.py
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

class Command(BaseCommand):
    def handle(self, *args, **options):
        User = get_user_model()
        if not User.objects.filter(username='admin').exists():
            User.objects.create_superuser(
                username=os.getenv('DJANGO_SUPERUSER_USERNAME', 'admin'),
                email=os.getenv('DJANGO_SUPERUSER_EMAIL', 'admin@example.com'),
                password=os.getenv('DJANGO_SUPERUSER_PASSWORD', 'admin123')
            )
            self.stdout.write('Superuser created.')
        else:
            self.stdout.write('Superuser already exists.')
```

## 🧪 Testing Your Docker Setup

### Verification Checklist

```bash
# Run this after setup to verify everything works

#!/bin/bash
echo "🧪 Testing Docker Setup..."

# Test 1: Containers running
echo "✓ Checking containers..."
docker-compose ps

# Test 2: Database connection
echo "✓ Testing database..."
docker-compose exec backend python -c "from django.db import connection; connection.cursor().execute('SELECT 1')"

# Test 3: API health
echo "✓ Testing API..."
curl -f http://localhost:8000/api/health/ || echo "❌ API health check failed"

# Test 4: Frontend
echo "✓ Testing frontend..."
curl -f http://localhost:3000 || echo "❌ Frontend not responding"

# Test 5: Admin login
echo "✓ Testing admin..."
curl -f http://localhost:8000/admin/ || echo "❌ Admin not accessible"

echo "✅ Docker setup verification complete!"
```

## 🔄 Quick Recovery Commands

When things go wrong:

```bash
# Nuclear option - rebuild everything
make clean
make setup

# Database issues
docker-compose down -v  # Remove volumes
docker-compose up -d db
make migrate

# Permission issues
docker-compose exec -u root backend chown -R appuser:appuser /app

# Port conflicts
lsof -i :8000  # Find what's using the port
kill -9 <PID>  # Kill it

# Environment variable issues
docker-compose config  # See resolved configuration
docker-compose exec backend env  # See container environment
```

## 📝 Production Deployment Readiness

Your development Docker setup should mirror production:

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  backend:
    image: ghcr.io/yourname/workload-tracker-backend:latest
    restart: always
    environment:
      - DEBUG=false
      - SECRET_KEY=${SECRET_KEY}  # From secrets manager
      - DATABASE_URL=${DATABASE_URL}  # Production database
    # No volumes - code is in image
    # No exposed ports - nginx handles it
    
  frontend:
    image: ghcr.io/yourname/workload-tracker-frontend:latest
    restart: always
    # Static files served by nginx
    
  nginx:
    image: nginx:alpine
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./ssl:/etc/nginx/ssl
      - ./nginx.prod.conf:/etc/nginx/nginx.conf
```

This setup ensures:

1. **No surprises** - Development matches production
2. **Quick debugging** - All tools included
3. **Easy onboarding** - One command setup
4. **Reliable deployment** - Same container everywhere

The key is starting with Docker from day one, not adding it later!
