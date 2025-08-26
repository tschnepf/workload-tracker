# R2-REBUILD-003: PRODUCTION READY - Days 5-6

## Objective
Polish the application, add error handling, containerize, and deploy. Focus on making it production-ready, not perfect.

## Day 5: Polish & Error Handling

### Step 1: Backend Error Handling (1 hour)

```python
# config/middleware.py
import logging
import json
from django.http import JsonResponse
from django.core.exceptions import ValidationError, ObjectDoesNotExist

logger = logging.getLogger(__name__)

class ErrorHandlingMiddleware:
    """Global error handling for API"""
    
    def __init__(self, get_response):
        self.get_response = get_response
    
    def __call__(self, request):
        try:
            response = self.get_response(request)
            return response
        except Exception as e:
            return self.handle_exception(e, request)
    
    def handle_exception(self, exc, request):
        if isinstance(exc, ValidationError):
            return JsonResponse({
                'error': 'Validation Error',
                'details': exc.message_dict if hasattr(exc, 'message_dict') else str(exc),
            }, status=400)
        
        elif isinstance(exc, ObjectDoesNotExist):
            return JsonResponse({
                'error': 'Not Found',
                'details': str(exc)
            }, status=404)
        
        else:
            # Log unexpected errors
            logger.error(f"Unexpected error: {exc}", exc_info=True, extra={
                'request_path': request.path,
                'request_method': request.method,
                'user': str(request.user) if hasattr(request, 'user') else 'Anonymous'
            })
            
            # Don't expose internal errors in production
            if settings.DEBUG:
                return JsonResponse({
                    'error': 'Internal Server Error',
                    'details': str(exc)
                }, status=500)
            else:
                return JsonResponse({
                    'error': 'Internal Server Error',
                    'details': 'An error occurred processing your request'
                }, status=500)

# Add to settings.py MIDDLEWARE
MIDDLEWARE = [
    # ... existing middleware ...
    'config.middleware.ErrorHandlingMiddleware',
]

# config/settings.py - Add logging configuration
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'file': {
            'level': 'INFO',
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': 'workload_tracker.log',
            'maxBytes': 1024 * 1024 * 15,  # 15MB
            'backupCount': 10,
            'formatter': 'verbose',
        },
        'console': {
            'level': 'INFO',
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console', 'file'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['console', 'file'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}
```

### Step 2: Frontend Error Handling (1 hour)

```typescript
// frontend/src/components/ErrorBoundary.tsx
import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="bg-white p-8 rounded-lg shadow-lg max-w-md">
            <h1 className="text-2xl font-bold text-red-600 mb-4">
              Something went wrong
            </h1>
            <p className="text-gray-600 mb-4">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// frontend/src/hooks/useErrorHandler.ts
import { useState } from 'react';

export function useErrorHandler() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const execute = async <T,>(
    fn: () => Promise<T>,
    errorMessage = 'An error occurred'
  ): Promise<T | null> => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await fn();
      return result;
    } catch (err) {
      console.error(errorMessage, err);
      setError(err instanceof Error ? err.message : errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { error, loading, execute, clearError: () => setError(null) };
}

// frontend/src/components/Toast.tsx
import { useEffect } from 'react';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, type, onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const bgColor = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    info: 'bg-blue-500'
  }[type];

  return (
    <div className={`fixed top-4 right-4 ${bgColor} text-white px-6 py-3 rounded-lg shadow-lg z-50`}>
      {message}
    </div>
  );
}

// Update App.tsx to use ErrorBoundary
// frontend/src/App.tsx
import { ErrorBoundary } from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        {/* ... rest of app ... */}
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
```

### Step 3: Add Loading States (1 hour)

```typescript
// frontend/src/components/LoadingSpinner.tsx
export function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  };

  return (
    <div className="flex justify-center items-center p-4">
      <div
        className={`${sizeClasses[size]} border-4 border-blue-500 border-t-transparent rounded-full animate-spin`}
      />
    </div>
  );
}

// frontend/src/components/DataTable.tsx
interface DataTableProps<T> {
  data: T[];
  columns: Array<{
    key: keyof T;
    header: string;
    render?: (item: T) => React.ReactNode;
  }>;
  loading?: boolean;
  error?: string | null;
}

export function DataTable<T extends { id?: number }>({
  data,
  columns,
  loading,
  error
}: DataTableProps<T>) {
  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
        {error}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No data available
      </div>
    );
  }

  return (
    <table className="w-full border-collapse border">
      <thead>
        <tr className="bg-gray-100">
          {columns.map(col => (
            <th key={String(col.key)} className="border p-2 text-left">
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((item, index) => (
          <tr key={item.id || index}>
            {columns.map(col => (
              <td key={String(col.key)} className="border p-2">
                {col.render ? col.render(item) : String(item[col.key])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

### Step 4: Add Basic Tests (2 hours)

```python
# Backend tests
# tests/test_models.py
from django.test import TestCase
from django.core.exceptions import ValidationError
from datetime import date, timedelta
from people.models import Person
from projects.models import Project
from assignments.models import Assignment

class PersonModelTest(TestCase):
    def setUp(self):
        self.person = Person.objects.create(
            name="John Doe",
            email="john@example.com",
            department="Engineering",
            role="Developer",
            weekly_capacity=40,
            hire_date=date.today()
        )
    
    def test_utilization_calculation(self):
        """Test utilization calculation is correct"""
        project = Project.objects.create(
            name="Test Project",
            client="Test Client",
            start_date=date.today(),
            end_date=date.today() + timedelta(days=30),
            estimated_hours=160
        )
        
        Assignment.objects.create(
            person=self.person,
            project=project,
            weekly_hours=20,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=30),
            role="Developer"
        )
        
        utilization = self.person.get_current_utilization()
        self.assertEqual(utilization['weekly_hours'], 20)
        self.assertEqual(utilization['utilization_percent'], 50.0)
    
    def test_capacity_validation(self):
        """Test that overallocation is prevented"""
        project1 = Project.objects.create(
            name="Project 1",
            client="Client 1",
            start_date=date.today(),
            end_date=date.today() + timedelta(days=30),
            estimated_hours=160
        )
        
        Assignment.objects.create(
            person=self.person,
            project=project1,
            weekly_hours=35,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=30),
            role="Developer"
        )
        
        project2 = Project.objects.create(
            name="Project 2",
            client="Client 2",
            start_date=date.today(),
            end_date=date.today() + timedelta(days=30),
            estimated_hours=100
        )
        
        # This should fail - would exceed capacity
        assignment2 = Assignment(
            person=self.person,
            project=project2,
            weekly_hours=10,  # 35 + 10 = 45 > 40 capacity
            start_date=date.today(),
            end_date=date.today() + timedelta(days=30),
            role="Developer"
        )
        
        with self.assertRaises(ValidationError):
            assignment2.full_clean()

# Run tests
# python manage.py test
```

```typescript
// Frontend tests
// frontend/src/services/api.test.ts
import { peopleAPI } from './api';

describe('People API', () => {
  it('should fetch people list', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      data: { results: [{ id: 1, name: 'John Doe' }] }
    });
    
    // Mock axios
    jest.mock('axios', () => ({
      create: () => ({
        get: mockFetch,
        interceptors: {
          request: { use: jest.fn() }
        }
      })
    }));
    
    const people = await peopleAPI.getAll();
    expect(mockFetch).toHaveBeenCalledWith('/people/');
    expect(people).toHaveLength(1);
  });
});
```

## Day 6: Containerization & Deployment

### Step 1: Docker Setup (1 hour)

```dockerfile
# backend/Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Collect static files
RUN python manage.py collectstatic --noinput

EXPOSE 8000

CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000"]
```

```dockerfile
# frontend/Dockerfile
FROM node:18-alpine as build

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build application
RUN npm run build

# Production stage
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

```nginx
# frontend/nginx.conf
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Step 2: Docker Compose (30 minutes)

```yaml
# docker-compose.yml
version: '3.8'

services:
  db:
    image: postgres:15
    environment:
      POSTGRES_DB: workload_tracker
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    build: ./backend
    command: >
      sh -c "
      python manage.py migrate &&
      python manage.py runserver 0.0.0.0:8000
      "
    volumes:
      - ./backend:/app
    ports:
      - "8000:8000"
    environment:
      DEBUG: 'True'
      SECRET_KEY: 'dev-secret-key-change-in-production'
      DATABASE_URL: 'postgresql://postgres:postgres@db:5432/workload_tracker'
    depends_on:
      db:
        condition: service_healthy

  frontend:
    build: ./frontend
    ports:
      - "3000:80"
    depends_on:
      - backend
    environment:
      - VITE_API_URL=http://localhost:8000/api

volumes:
  postgres_data:
```

### Step 3: Production Configuration (1 hour)

```python
# backend/config/settings_production.py
from .settings import *
import os

DEBUG = False
ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', '').split(',')

# Security settings
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'

# Database from environment
import dj_database_url
DATABASES = {
    'default': dj_database_url.config(
        default=os.environ.get('DATABASE_URL')
    )
}

# Static files
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

# Add whitenoise to middleware
MIDDLEWARE.insert(1, 'whitenoise.middleware.WhiteNoiseMiddleware')

# Cache configuration (optional, add Redis later if needed)
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.db.DatabaseCache',
        'LOCATION': 'cache_table',
    }
}
```

```bash
# .env.production
SECRET_KEY=your-production-secret-key-generate-with-django
DEBUG=False
ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Generate secret key
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

### Step 4: Deployment Script (30 minutes)

```bash
#!/bin/bash
# deploy.sh

echo "Starting deployment..."

# Build and push Docker images (if using registry)
docker-compose -f docker-compose.production.yml build
docker-compose -f docker-compose.production.yml push

# On production server
ssh user@server << 'ENDSSH'
  cd /var/www/workload-tracker
  
  # Pull latest code
  git pull origin main
  
  # Pull and restart containers
  docker-compose -f docker-compose.production.yml pull
  docker-compose -f docker-compose.production.yml down
  docker-compose -f docker-compose.production.yml up -d
  
  # Run migrations
  docker-compose -f docker-compose.production.yml exec backend python manage.py migrate
  
  # Collect static files
  docker-compose -f docker-compose.production.yml exec backend python manage.py collectstatic --noinput
  
  echo "Deployment complete!"
ENDSSH
```

### Step 5: Monitoring & Health Checks (1 hour)

```python
# backend/health/views.py
from django.http import JsonResponse
from django.db import connection
from django.core.cache import cache
import time

def health_check(request):
    """Basic health check endpoint"""
    health_status = {
        'status': 'healthy',
        'timestamp': time.time(),
        'checks': {}
    }
    
    # Check database
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        health_status['checks']['database'] = 'ok'
    except Exception as e:
        health_status['status'] = 'unhealthy'
        health_status['checks']['database'] = str(e)
    
    # Check cache
    try:
        cache.set('health_check', 'ok', 10)
        if cache.get('health_check') == 'ok':
            health_status['checks']['cache'] = 'ok'
        else:
            health_status['checks']['cache'] = 'fail'
    except Exception as e:
        health_status['checks']['cache'] = str(e)
    
    status_code = 200 if health_status['status'] == 'healthy' else 503
    return JsonResponse(health_status, status=status_code)

# Add to urls.py
path('health/', health_check, name='health_check'),
```

```typescript
// frontend/src/components/HealthStatus.tsx
import { useEffect, useState } from 'react';

export function HealthStatus() {
  const [status, setStatus] = useState<'healthy' | 'unhealthy' | 'checking'>('checking');

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch('/api/health/');
        const data = await response.json();
        setStatus(data.status);
      } catch (error) {
        setStatus('unhealthy');
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 30000); // Check every 30 seconds
    
    return () => clearInterval(interval);
  }, []);

  const statusColor = {
    healthy: 'bg-green-500',
    unhealthy: 'bg-red-500',
    checking: 'bg-yellow-500'
  }[status];

  return (
    <div className={`w-2 h-2 rounded-full ${statusColor}`} title={`System ${status}`} />
  );
}
```

## Production Deployment Checklist

### Pre-Deployment
- ✅ All tests passing
- ✅ Environment variables configured
- ✅ Database backups configured
- ✅ SSL certificates ready
- ✅ Domain configured

### Deployment Steps
```bash
# 1. Clone repository on server
git clone https://github.com/yourname/workload-tracker.git
cd workload-tracker

# 2. Create production env file
cp .env.example .env.production
# Edit with production values

# 3. Build and start containers
docker-compose -f docker-compose.production.yml up -d

# 4. Run initial migrations
docker-compose exec backend python manage.py migrate

# 5. Create superuser
docker-compose exec backend python manage.py createsuperuser

# 6. Load initial data (optional)
docker-compose exec backend python manage.py loaddata initial_data.json
```

### Post-Deployment
- ✅ Health check endpoint responding
- ✅ Can login and create records
- ✅ Error logging working
- ✅ Database connections stable
- ✅ Static files loading

## Simple Backup Strategy

```bash
#!/bin/bash
# backup.sh - Run daily via cron

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups"

# Backup database
docker-compose exec -T db pg_dump -U postgres workload_tracker > $BACKUP_DIR/db_$DATE.sql

# Keep only last 7 days
find $BACKUP_DIR -name "db_*.sql" -mtime +7 -delete

echo "Backup completed: db_$DATE.sql"
```

## Production Monitoring

### Option 1: Simple Logs
```bash
# View logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Check container status
docker-compose ps
```

### Option 2: Basic Metrics (Add Later)
```python
# Use django-prometheus for metrics
pip install django-prometheus

# Add to INSTALLED_APPS
'django_prometheus',

# Add to MIDDLEWARE
'django_prometheus.middleware.PrometheusBeforeMiddleware',  # At top
'django_prometheus.middleware.PrometheusAfterMiddleware',   # At bottom

# Add to urls.py
path('', include('django_prometheus.urls')),
```

## What We Built in Days 5-6
- ✅ Global error handling
- ✅ Loading states and error boundaries
- ✅ Basic test coverage
- ✅ Docker containerization
- ✅ Production configuration
- ✅ Health checks and monitoring
- ✅ Deployment scripts
- ✅ Backup strategy

## Future Enhancements (Add When Needed)
- ⏳ Redis caching (when performance requires)
- ⏳ Celery for background tasks (when async needed)
- ⏳ Full test coverage (as features stabilize)
- ⏳ CI/CD pipeline (when team grows)
- ⏳ Advanced monitoring (when scale requires)
- ⏳ Multi-tenancy (when customer base requires)

## Key Takeaways
1. **Start simple** - Basic Docker Compose works for most deployments
2. **Monitor what matters** - Health checks and logs are usually sufficient
3. **Security basics** - HTTPS, environment variables, and Django security settings
4. **Backup early** - Simple pg_dump is better than no backup

**Time Invested**: 6 days total  
**Result**: Production-ready workload tracking system

## Final Notes

This lean approach delivered a working product in 6 days instead of 6 weeks. The application:
- ✅ Solves the core business problem
- ✅ Is maintainable and extendable
- ✅ Uses proven, boring technology
- ✅ Can scale to hundreds of users
- ✅ Has room to grow based on actual needs

Remember: **Perfect is the enemy of good.** This system is good enough to start using, and that's what matters.