"""
Django settings for workload-tracker project.
"""

import os
import dj_database_url
from pathlib import Path
from datetime import timedelta
import logging
import sentry_sdk
from sentry_sdk.integrations.django import DjangoIntegration
from sentry_sdk.integrations.logging import LoggingIntegration

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = os.getenv('DEBUG', 'false').lower() == 'true'

ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')

# Get HOST_IP for network access configuration
HOST_IP = os.getenv('HOST_IP')
if HOST_IP and HOST_IP not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append(HOST_IP)

# Application definition
DJANGO_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
]

THIRD_PARTY_APPS = [
    'rest_framework',
    'corsheaders',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'drf_spectacular',
]

LOCAL_APPS = [
    'core',
    'people',
    'projects', 
    'assignments',
    'deliverables',
    'departments',
    'dashboard',
    'skills',
    'monitoring',
    'roles',
    'accounts',
    'reports',
    'personal',
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'core.middleware.RequestIDLogMiddleware',
    'core.middleware.ReadOnlyModeMiddleware',
    'core.middleware.CSPMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# Database
DATABASES = {
    'default': dj_database_url.parse(
        os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@db:5432/workload_tracker'),
        conn_max_age=int(os.getenv('DB_CONN_MAX_AGE', '60'))  # Phase 3: connection pooling
    )
}
# Optional: enable TLS for Postgres connections via env toggles
try:
    _db_sslmode = os.getenv('DB_SSLMODE')
    _db_sslrootcert = os.getenv('DB_SSLROOTCERT')
    if _db_sslmode or _db_sslrootcert:
        DATABASES['default'].setdefault('OPTIONS', {})
    if _db_sslmode:
        DATABASES['default']['OPTIONS']['sslmode'] = _db_sslmode
    if _db_sslrootcert:
        DATABASES['default']['OPTIONS']['sslrootcert'] = _db_sslrootcert
except Exception:
    pass
# Enable Django connection health checks (pings before reuse) where supported
try:
    DATABASES['default']['CONN_HEALTH_CHECKS'] = os.getenv('DB_CONN_HEALTH_CHECKS', 'true').lower() == 'true'
except Exception:
    pass

# --- End Sentry ---

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Backups configuration (Phase 0: Step 0.1)
# Use a non-public directory for database backups; never place under MEDIA_ROOT
BACKUPS_DIR = os.getenv('BACKUPS_DIR', '/backups')
# Read-only maintenance mode switch (also used during restore via lock file)
READ_ONLY_MODE = os.getenv('READ_ONLY_MODE', 'false').lower() == 'true'
# Optional privileged DSN for restore operations (DB owner)
DB_ADMIN_URL = os.getenv('DB_ADMIN_URL')

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Optional encryption/offsite toggles (Phase 0: Step 0.6)
BACKUP_ENCRYPTION_ENABLED = os.getenv('BACKUP_ENCRYPTION_ENABLED', 'false').lower() == 'true'
BACKUP_ENCRYPTION_PROVIDER = os.getenv('BACKUP_ENCRYPTION_PROVIDER', 'gpg')  # 'gpg'|'kms'
BACKUP_ENCRYPTION_RECIPIENT = os.getenv('BACKUP_ENCRYPTION_RECIPIENT')  # e.g., GPG recipient or KMS key id

BACKUP_OFFSITE_ENABLED = os.getenv('BACKUP_OFFSITE_ENABLED', 'false').lower() == 'true'
BACKUP_OFFSITE_PROVIDER = os.getenv('BACKUP_OFFSITE_PROVIDER')  # e.g., 's3'|'gcs'|'azure'|'rclone'
BACKUP_OFFSITE_BUCKET = os.getenv('BACKUP_OFFSITE_BUCKET')
BACKUP_OFFSITE_PREFIX = os.getenv('BACKUP_OFFSITE_PREFIX', '')

# Max upload size for backup archives (bytes). Default 5 GiB.
BACKUP_UPLOAD_MAX_BYTES = int(os.getenv('BACKUP_UPLOAD_MAX_BYTES', str(5 * 1024 * 1024 * 1024)))

# People import upload limits (bytes). Default 500 MiB.
PEOPLE_UPLOAD_MAX_BYTES = int(os.getenv('PEOPLE_UPLOAD_MAX_BYTES', str(500 * 1024 * 1024)))

# Projects import upload limits (bytes). Default 500 MiB.
PROJECTS_UPLOAD_MAX_BYTES = int(os.getenv('PROJECTS_UPLOAD_MAX_BYTES', str(500 * 1024 * 1024)))

# Feature flags for progressive enhancement
# Initialize and populate FEATURES
FEATURES = {}
FEATURES.update({
    'USE_PROJECT_OBJECTS': True,   # ◎. Chunk 5 Complete - Project objects implemented
    'USE_DEPARTMENTS': True,       # ◎. Chunk 6 Active - Department filtering enabled
    'USE_SKILLS': True,            # ◎. Chunk 6 Active - Skills tagging system enabled
    'USE_DELIVERABLES': True,      # Deliverables feature enabled
})

# Security/auth flags via env
FEATURES.update({
    'COOKIE_REFRESH_AUTH': ((os.getenv('COOKIE_REFRESH_AUTH').lower() == 'true') if os.getenv('COOKIE_REFRESH_AUTH') is not None else (not DEBUG)),
    'LOGIN_PROTECTION': os.getenv('LOGIN_PROTECTION', 'false').lower() == 'true',
    'SHORT_TTL_AGGREGATES': os.getenv('SHORT_TTL_AGGREGATES', 'false').lower() == 'true',
    'AUTH_ENFORCED': os.getenv('AUTH_ENFORCED', 'true').lower() == 'true',
    'ASYNC_JOBS': os.getenv('ASYNC_JOBS', 'false').lower() == 'true',
    # Always-on flag for safe server-side weekly-hours operations
    'AUTO_REALLOCATION': True,
    # Week key policy controls (Section 3/4)
    'WEEK_KEYS_CANONICAL': os.getenv('WEEK_KEYS_CANONICAL', 'sunday').lower(),
    'WEEK_KEYS_TRANSITION_READ_BOTH': os.getenv('WEEK_KEYS_TRANSITION_READ_BOTH', 'true').lower() == 'true',
})

# With header-only JWT auth, do not allow credentials by default.
# Enable credentials when cookie-based refresh flow is active.
CORS_ALLOW_CREDENTIALS = bool(FEATURES.get('COOKIE_REFRESH_AUTH'))

# Helper: robust env rate parsing (treat blanks/malformed as default)
def _rate(env_key: str, default: str) -> str:
    v = os.getenv(env_key)
    if v is None:
        return default
    v = v.strip()
    return v if ('/' in v and v.split('/', 1)[0].isdigit()) else default

# REST Framework
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    # Default permission enforcement can be staged via AUTH_ENFORCED
    'DEFAULT_PERMISSION_CLASSES': (
        [
            'rest_framework.permissions.IsAuthenticated',
            'accounts.permissions.RoleBasedAccessPermission',
        ] if FEATURES.get('AUTH_ENFORCED', True) else [
            'rest_framework.permissions.AllowAny',
        ]
    ),
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
        'rest_framework.throttling.ScopedRateThrottle',
    ],
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ],
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 100,  # Tuned down for API payload size (Phase 3)
    'PAGE_SIZE_QUERY_PARAM': 'page_size',  # Allow client to specify page size
    'MAX_PAGE_SIZE': 200,  # Safety cap tuned (Phase 3)
    'DEFAULT_THROTTLE_RATES': {
        'anon': _rate('DRF_THROTTLE_ANON', '100/min'),
        'user': _rate('DRF_THROTTLE_USER', '1000/min'),
        'hot_endpoint': _rate('DRF_THROTTLE_HOT', '300/hour'),  # Special limit for hot endpoints
        'heatmap': _rate('DRF_THROTTLE_HEATMAP', '1200/min'),
        'skill_match': _rate('DRF_THROTTLE_SKILL_MATCH', '600/min'),
        'project_availability': _rate('DRF_THROTTLE_PROJECT_AVAILABILITY', '600/min'),
        'find_available': _rate('DRF_THROTTLE_FIND_AVAILABLE', '600/min'),
        'grid_snapshot': _rate('DRF_THROTTLE_GRID_SNAPSHOT', '600/min'),
        'login': _rate('DRF_THROTTLE_LOGIN', '10/min'),
        # Backup/restore endpoints (Phase 0: Step 0.3)
        'backup_create': _rate('DRF_THROTTLE_BACKUP_CREATE', '2/hour'),
        'backup_delete': _rate('DRF_THROTTLE_BACKUP_DELETE', '5/hour'),
        'backup_download': _rate('DRF_THROTTLE_BACKUP_DOWNLOAD', '20/hour'),
        'backup_status': _rate('DRF_THROTTLE_BACKUP_STATUS', '120/min'),
        # New granular scopes for restore and upload+restore
        'backup_restore': _rate('DRF_THROTTLE_BACKUP_RESTORE', _rate('DRF_THROTTLE_BACKUP_CREATE', '2/hour')),
        'backup_upload_restore': _rate('DRF_THROTTLE_BACKUP_UPLOAD_RESTORE', _rate('DRF_THROTTLE_BACKUP_CREATE', '2/hour')),
    }
}

# drf-spectacular (OpenAPI)
SPECTACULAR_SETTINGS = {
    'TITLE': 'Workload Tracker API',
    'DESCRIPTION': 'OpenAPI schema for Workload Tracker (People, Projects, Assignments, Deliverables, Departments).',
    'VERSION': os.getenv('APP_VERSION', '0.1.0'),
    'SERVE_INCLUDE_SCHEMA': False,  # keep UI fast; the schema endpoint serves the document
    'COMPONENT_SPLIT_REQUEST': True,
    'SCHEMA_PATH_PREFIX': r'/api',
}

# Gate OpenAPI schema serving in production. Leave open in dev by default.
OPENAPI_PUBLIC = os.getenv('OPENAPI_PUBLIC', 'true' if DEBUG else 'false').lower() == 'true'
if not OPENAPI_PUBLIC:
    # Require authentication to access the OpenAPI schema in prod
    SPECTACULAR_SETTINGS['SERVE_PERMISSIONS'] = [
        'rest_framework.permissions.IsAuthenticated'
    ]

# SimpleJWT configuration
_jwt_access_minutes = int(os.getenv('JWT_ACCESS_MINUTES', '60'))
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=_jwt_access_minutes),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=30),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# Cache configuration: LocMem by default; Redis if REDIS_URL provided
REDIS_URL = os.getenv('REDIS_URL')
if REDIS_URL:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.redis.RedisCache',
            'LOCATION': REDIS_URL,
            'TIMEOUT': int(os.getenv('CACHE_DEFAULT_TIMEOUT', '300')),
            'OPTIONS': {
                # Short, resilient timeouts to avoid request hangs
                'socket_connect_timeout': float(os.getenv('CACHE_SOCKET_CONNECT_TIMEOUT', '2')),
                'socket_timeout': float(os.getenv('CACHE_SOCKET_TIMEOUT', '2')),
                'retry_on_timeout': True,
            },
        }
    }
    # Optional: enable TLS for Redis if using rediss:// or REDIS_TLS=true
    try:
        from urllib.parse import urlparse as _urlparse
        _parsed = _urlparse(REDIS_URL)
        _redis_tls = os.getenv('REDIS_TLS', '').lower() == 'true' or (_parsed.scheme or '').lower() == 'rediss'
        if _redis_tls:
            CACHES['default'].setdefault('OPTIONS', {})
            # ssl_cert_reqs: 'required' (default) | 'none' for dev/self-signed
            _reqs = os.getenv('REDIS_SSL_CERT_REQS', 'required')
            CACHES['default']['OPTIONS']['ssl_cert_reqs'] = _reqs
    except Exception:
        pass
else:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'workload-tracker-locmem',
            'TIMEOUT': int(os.getenv('CACHE_DEFAULT_TIMEOUT', '300')),
        }
    }

# Aggregate/dashboard caching TTLs (seconds)
# Use AGGREGATE_CACHE_TTL globally for heavy aggregate endpoints.
# Optionally set DASHBOARD_CACHE_TTL to override just the dashboard cache TTL.
# Precedence: DASHBOARD_CACHE_TTL > AGGREGATE_CACHE_TTL > 30s default in view fallback.
AGGREGATE_CACHE_TTL = int(os.getenv('AGGREGATE_CACHE_TTL', '30'))
# DASHBOARD_CACHE_TTL is intentionally not set by default; set via env when needed.

# CORS
# CORS - Build allowed origins dynamically
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

# Add network IP if HOST_IP is set
if HOST_IP:
    CORS_ALLOWED_ORIGINS.append(f"http://{HOST_IP}:3000")

# Allow overriding via env (comma-separated)
_cors_from_env = os.getenv('CORS_ALLOWED_ORIGINS')
if _cors_from_env:
    CORS_ALLOWED_ORIGINS = [o.strip() for o in _cors_from_env.split(',') if o.strip()]

# Expose headers for client-side downloads (filename via Content-Disposition)
try:
    CORS_EXPOSE_HEADERS = list(set((globals().get('CORS_EXPOSE_HEADERS') or []) + ['Content-Disposition']))
except Exception:
    CORS_EXPOSE_HEADERS = ['Content-Disposition']

# CSRF trusted origins (optional env override; comma-separated)
_csrf_from_env = os.getenv('CSRF_TRUSTED_ORIGINS')
if _csrf_from_env:
    CSRF_TRUSTED_ORIGINS = [o.strip() for o in _csrf_from_env.split(',') if o.strip()]

# Feature flags for progressive enhancement
FEATURES = {
    'USE_PROJECT_OBJECTS': True,   # ✅ Chunk 5 Complete - Project objects implemented
    'USE_DEPARTMENTS': True,       # ✅ Chunk 6 Active - Department filtering enabled
    'USE_SKILLS': True,            # ✅ Chunk 6 Active - Skills tagging system enabled
    'USE_DELIVERABLES': True,      # Deliverables feature enabled
}

# Security/auth flags via env
FEATURES.update({
    'COOKIE_REFRESH_AUTH': ((os.getenv('COOKIE_REFRESH_AUTH').lower() == 'true') if os.getenv('COOKIE_REFRESH_AUTH') is not None else (not DEBUG)),
    'LOGIN_PROTECTION': os.getenv('LOGIN_PROTECTION', 'false').lower() == 'true',
    'SHORT_TTL_AGGREGATES': os.getenv('SHORT_TTL_AGGREGATES', 'false').lower() == 'true',
    'AUTH_ENFORCED': os.getenv('AUTH_ENFORCED', 'true').lower() == 'true',
})

# With header-only JWT auth, do not allow credentials by default.
# Enable credentials when cookie-based refresh flow is active.
CORS_ALLOW_CREDENTIALS = bool(FEATURES.get('COOKIE_REFRESH_AUTH'))

# (AUTO_REALLOCATION already enabled earlier)

# Performance monitoring configuration
# Silk enablement: default to on in DEBUG, but allow explicit override.
_silk_env = os.getenv('SILK_ENABLED')
SILK_ENABLED = (_silk_env.lower() == 'true') if _silk_env is not None else DEBUG
if SILK_ENABLED:
    # Enable Silk only when explicitly allowed or in DEBUG
    INSTALLED_APPS.append('silk')
    try:
        # Place Silk AFTER our maintenance/read-only middleware so that during
        # restores, our guard can short-circuit before Silk touches the DB.
        ro_idx = MIDDLEWARE.index('core.middleware.ReadOnlyModeMiddleware') + 1
    except Exception:
        ro_idx = len(MIDDLEWARE)
    MIDDLEWARE.insert(ro_idx, 'silk.middleware.SilkyMiddleware')
    # Avoid DB writes for health/readiness and job-polling endpoints, which are
    # frequently hit during backup/restore when schema may be transient.
    SILKY_IGNORE_PATHS = list(set([
        r'^/silk/.*',
        r'^/admin/.*',
        r'^/static/.*',
        r'^/media/.*',
        r'^/csp-report/.*',
        r'^/health/.*',
        r'^/readiness/.*',
        r'^/api/health/.*',
        r'^/api/readiness/.*',
        r'^/api/jobs/.*',
    ] + (globals().get('SILKY_IGNORE_PATHS') or [])))

# Sentry configuration for production monitoring
if not DEBUG and os.getenv('SENTRY_DSN'):
    sentry_sdk.init(
        dsn=os.getenv('SENTRY_DSN'),
        integrations=[
            DjangoIntegration(
                transaction_style='url',
                middleware_spans=True,
                signals_spans=True,
            ),
            # Capture INFO+ logs as breadcrumbs; send ERROR+ as events
            LoggingIntegration(
                level=logging.INFO,
                event_level=logging.ERROR,
            ),
        ],
        environment=os.getenv('ENVIRONMENT', 'production'),
        release=os.getenv('APP_VERSION'),
        traces_sample_rate=float(os.getenv('SENTRY_TRACES_SAMPLE_RATE', '0.1')),
        profiles_sample_rate=float(os.getenv('SENTRY_PROFILES_SAMPLE_RATE', '0.1')),
        attach_stacktrace=True,
        send_default_pii=False,
    )

# Production hardening (only when DEBUG=False)
if not DEBUG:
    # Honor X-Forwarded-Proto from nginx when TLS terminates at proxy
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    # Enforce HTTPS
    SECURE_SSL_REDIRECT = os.getenv('SECURE_SSL_REDIRECT', 'true').lower() == 'true'
    # Strict Transport Security (1 year; include subdomains; preload)
    SECURE_HSTS_SECONDS = int(os.getenv('SECURE_HSTS_SECONDS', '31536000'))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = os.getenv('SECURE_HSTS_INCLUDE_SUBDOMAINS', 'true').lower() == 'true'
    SECURE_HSTS_PRELOAD = os.getenv('SECURE_HSTS_PRELOAD', 'true').lower() == 'true'
    # Secure cookies
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    # Explicit SameSite in production
    SESSION_COOKIE_SAMESITE = os.getenv('SESSION_COOKIE_SAMESITE', 'Lax')
    CSRF_COOKIE_SAMESITE = os.getenv('CSRF_COOKIE_SAMESITE', 'Lax')
    # Honor X-Forwarded-Host when behind proxy
    USE_X_FORWARDED_HOST = True

# Optional: django-axes login protection under feature flag
if FEATURES.get('LOGIN_PROTECTION'):
    INSTALLED_APPS.append('axes')
    # Insert just after Authentication/Session for proper ordering
    try:
        insert_at = MIDDLEWARE.index('django.contrib.auth.middleware.AuthenticationMiddleware') + 1
        MIDDLEWARE.insert(insert_at, 'axes.middleware.AxesMiddleware')
    except Exception:
        MIDDLEWARE.append('axes.middleware.AxesMiddleware')
    # Thresholds
    AXES_FAILURE_LIMIT = int(os.getenv('AXES_FAILURE_LIMIT', '5'))
    # django-axes 8: AXES_COOLOFF_TIME replaced by AXES_COOLOFF (timedelta)
    AXES_COOLOFF = timedelta(hours=float(os.getenv('AXES_COOLOFF_TIME', '1')))
    AXES_ONLY_USER_FAILURES = True
    AXES_LOCKOUT_PARAMETERS = ['username']
    AXES_RESET_ON_SUCCESS = True
    AXES_LOCKOUT_TEMPLATE = None
    AXES_LOCKOUT_CALLABLE = None
    # Whitelist: admin usernames and/or trusted CIDR nets
    AXES_NEVER_LOCKOUT_USERNAMES = [u.strip() for u in os.getenv('AXES_NEVER_LOCKOUT_USERNAMES', '').split(',') if u.strip()]
    AXES_ALLOWED_CIDR_NETS = [c.strip() for c in os.getenv('AXES_ALLOWED_CIDR_NETS', '').split(',') if c.strip()]
    # Optional: email alert to ADMINS on lockout
    AXES_ALERT_ADMINS = os.getenv('AXES_ALERT_ADMINS', 'false').lower() == 'true'

# Common constants
REFRESH_COOKIE_NAME = os.getenv('REFRESH_COOKIE_NAME', 'refresh_token')
# Structured logging configuration
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'json': {
            '()': 'config.logging_utils.JSONFormatter',
        },
    },
    'handlers': {
        'console_json': {
            'class': 'logging.StreamHandler',
            'formatter': 'json',
        },
    },
    'loggers': {
        'request': {
            'handlers': ['console_json'],
            'level': os.getenv('REQUEST_LOG_LEVEL', 'INFO'),
            'propagate': False,
        },
        'db': {
            'handlers': ['console_json'],
            'level': os.getenv('DB_LOG_LEVEL', 'INFO'),
            'propagate': False,
        },
    },
}

# Celery (background jobs)
CELERY_BROKER_URL = os.getenv('CELERY_BROKER_URL', os.getenv('REDIS_URL', 'redis://redis:6379/1'))
CELERY_RESULT_BACKEND = os.getenv('CELERY_RESULT_BACKEND', os.getenv('REDIS_URL', 'redis://redis:6379/1'))
CELERY_TASK_ALWAYS_EAGER = os.getenv('CELERY_TASK_ALWAYS_EAGER', 'false').lower() == 'true'
CELERY_TASK_EAGER_PROPAGATES = True
CELERY_TASK_ROUTES = {
    'core.backup_tasks.*': {'queue': 'db_maintenance'},
}

# CSP rollout configuration
CSP_ENABLED = os.getenv('CSP_ENABLED', 'true').lower() == 'true'
# Default to report-only when DEBUG or when explicitly set
CSP_REPORT_ONLY = os.getenv('CSP_REPORT_ONLY', 'true' if DEBUG else 'false').lower() == 'true'
CSP_POLICY = os.getenv(
    'CSP_POLICY',
    "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; img-src 'self' data:; "
    "font-src 'self' https://fonts.gstatic.com data:; connect-src 'self'; frame-ancestors 'none'",
)
# Optional absolute/relative endpoint to receive violation reports
CSP_REPORT_URI = os.getenv('CSP_REPORT_URI', '/csp-report/')


