"""
Django settings for workload-tracker project.
"""

import os
import sys
import dj_database_url
from pathlib import Path
from datetime import timedelta
import logging
from urllib.parse import urlparse
import sentry_sdk
from django.core.exceptions import ImproperlyConfigured
from sentry_sdk.integrations.django import DjangoIntegration
from sentry_sdk.integrations.logging import LoggingIntegration

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = os.getenv('DEBUG', 'false').lower() == 'true'
RUNNING_TESTS = 'test' in sys.argv

INSECURE_SECRET_KEY_VALUES = {
    '',
    'dev-secret-key-change-in-production',
    'changeme',
    'change-me',
    'change-me-restore-token-secret',
    'change_me_restore_token_secret',
    'change_me_production_secret',
    'secret',
    'django-insecure',
}


def _is_insecure_secret_key(value: str) -> bool:
    raw = (value or '').strip()
    lowered = raw.lower()
    if lowered in INSECURE_SECRET_KEY_VALUES:
        return True
    return lowered.startswith('dev-') or lowered.startswith('test-')


def validate_secret_key_for_env(secret_key: str, debug: bool, running_tests: bool = False) -> None:
    if debug or running_tests:
        return
    if _is_insecure_secret_key(secret_key):
        raise ImproperlyConfigured(
            'SECRET_KEY must be explicitly set to a non-default value when DEBUG=false'
        )


def _parse_origin_list(raw_value: str) -> list[str]:
    return [o.strip() for o in (raw_value or '').split(',') if o.strip()]


def _validate_origin_list(origins: list[str], *, name: str) -> None:
    for origin in origins:
        parsed = urlparse(origin)
        if parsed.scheme not in ('http', 'https') or not parsed.netloc:
            raise ImproperlyConfigured(f'{name} contains invalid origin: {origin}')
        if parsed.path not in ('', '/'):
            raise ImproperlyConfigured(f'{name} entries must not include paths: {origin}')


# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.getenv('SECRET_KEY') or 'dev-secret-key-change-in-production'
validate_secret_key_for_env(SECRET_KEY, DEBUG, RUNNING_TESTS)

ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')
# Always allow localhost/127.0.0.1 for internal healthchecks and container self-probes
for _h in ('localhost', '127.0.0.1'):
    if _h not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(_h)

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
    'verticals',
    'dashboard',
    'skills',
    'monitoring',
    'roles',
    'accounts',
    'reports',
    'personal',
    'integrations',
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
except Exception:  # nosec B110
    pass
# Enable Django connection health checks (pings before reuse) where supported
try:
    DATABASES['default']['CONN_HEALTH_CHECKS'] = os.getenv('DB_CONN_HEALTH_CHECKS', 'true').lower() == 'true'
except Exception:  # nosec B110
    pass
# PgBouncer compatibility: disable server-side cursors when transaction pooling is used.
try:
    _disable_ssc = os.getenv('DISABLE_SERVER_SIDE_CURSORS')
    if _disable_ssc is not None:
        DATABASES['default']['DISABLE_SERVER_SIDE_CURSORS'] = _disable_ssc.lower() == 'true'
except Exception:  # nosec B110
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

# Protected risk attachments (outside MEDIA_ROOT by default)
RISK_ATTACHMENTS_DIR = os.getenv('RISK_ATTACHMENTS_DIR', str(BASE_DIR / 'risk_attachments'))
# Max upload size for risk attachments (bytes). Default 100 MiB.
RISK_UPLOAD_MAX_BYTES = int(os.getenv('RISK_UPLOAD_MAX_BYTES', str(100 * 1024 * 1024)))

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
    'UTILIZATION_SCHEME_ENABLED': True,  # Enable utilization scheme (hour-range color mapping)
    # Project Roles by Department: default OFF, enable via env
    'PROJECT_ROLES_BY_DEPARTMENT': os.getenv('PROJECT_ROLES_BY_DEPARTMENT', 'false').lower() == 'true',
})

# Security/auth flags via env
FEATURES.update({
    'COOKIE_REFRESH_AUTH': ((os.getenv('COOKIE_REFRESH_AUTH').lower() == 'true') if os.getenv('COOKIE_REFRESH_AUTH') is not None else (not DEBUG)),
    'LOGIN_PROTECTION': os.getenv('LOGIN_PROTECTION', 'false').lower() == 'true',
    'SHORT_TTL_AGGREGATES': os.getenv('SHORT_TTL_AGGREGATES', 'false').lower() == 'true',
    'AUTH_ENFORCED': os.getenv('AUTH_ENFORCED', 'true').lower() == 'true',
    'ASYNC_JOBS': os.getenv('ASYNC_JOBS', 'false').lower() == 'true',
    'JOB_AUTHZ_WRITE_REQUIRED': os.getenv('JOB_AUTHZ_WRITE_REQUIRED', 'false').lower() == 'true',
    'JOB_AUTHZ_ENFORCED': os.getenv('JOB_AUTHZ_ENFORCED', 'false').lower() == 'true',
    'JOB_RESTORE_TOKEN_MODE': os.getenv('JOB_RESTORE_TOKEN_MODE', 'true').lower() == 'true',
    'FF_UI_BOOTSTRAP': os.getenv('FF_UI_BOOTSTRAP', 'true').lower() == 'true',
    'FF_ASSIGNMENTS_AUTO_HOURS_BUNDLE': os.getenv('FF_ASSIGNMENTS_AUTO_HOURS_BUNDLE', 'true').lower() == 'true',
    'FF_PEOPLE_SKILLS_SETTINGS_SNAPSHOTS': os.getenv('FF_PEOPLE_SKILLS_SETTINGS_SNAPSHOTS', 'true').lower() == 'true',
    'FF_MODERATE_PAGES_SNAPSHOTS': os.getenv('FF_MODERATE_PAGES_SNAPSHOTS', 'true').lower() == 'true',
    # Always-on flag for safe server-side weekly-hours operations
    'AUTO_REALLOCATION': True,
    # Week key policy controls (Section 3/4)
    'WEEK_KEYS_CANONICAL': os.getenv('WEEK_KEYS_CANONICAL', 'sunday').lower(),
    'WEEK_KEYS_TRANSITION_READ_BOTH': os.getenv('WEEK_KEYS_TRANSITION_READ_BOTH', 'true').lower() == 'true',
})

ADMIN_PASSWORD_RESET_SUPERUSER_ONLY = os.getenv('ADMIN_PASSWORD_RESET_SUPERUSER_ONLY', 'false').lower() == 'true'
RESTORE_JOB_TOKEN_SECRET = os.getenv('RESTORE_JOB_TOKEN_SECRET', SECRET_KEY if DEBUG else '')
RESTORE_JOB_TOKEN_TTL_SECONDS = int(os.getenv('RESTORE_JOB_TOKEN_TTL_SECONDS', '300'))

REQUIRED_FEATURE_FLAGS = (
    'AUTH_ENFORCED',
    'ASYNC_JOBS',
    'JOB_AUTHZ_WRITE_REQUIRED',
    'JOB_AUTHZ_ENFORCED',
    'JOB_RESTORE_TOKEN_MODE',
)
for _required_feature in REQUIRED_FEATURE_FLAGS:
    if _required_feature not in FEATURES:
        raise ImproperlyConfigured(f'Missing required feature flag: {_required_feature}')

# Integrations
INTEGRATIONS_ENABLED = os.getenv('INTEGRATIONS_ENABLED', 'false').lower() == 'true'
INTEGRATIONS_SECRET_KEY = os.getenv('INTEGRATIONS_SECRET_KEY')
INTEGRATIONS_RESTORE_MAX_AGE_DAYS = int(os.getenv('INTEGRATIONS_RESTORE_MAX_AGE_DAYS', '14'))

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


def _int_non_negative(env_key: str, default: int) -> int:
    raw = os.getenv(env_key, str(default))
    try:
        return max(0, int(raw))
    except Exception:
        return max(0, int(default))

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
        'snapshots': _rate('DRF_THROTTLE_SNAPSHOTS', '120/min'),
        'heatmap': _rate('DRF_THROTTLE_HEATMAP', '1200/min'),
        'skill_match': _rate('DRF_THROTTLE_SKILL_MATCH', '600/min'),
        'project_availability': _rate('DRF_THROTTLE_PROJECT_AVAILABILITY', '600/min'),
        'find_available': _rate('DRF_THROTTLE_FIND_AVAILABLE', '600/min'),
        'grid_snapshot': _rate('DRF_THROTTLE_GRID_SNAPSHOT', '600/min'),
        'ui_bootstrap': _rate('DRF_THROTTLE_UI_BOOTSTRAP', '120/min'),
        'reports_departments_overview': _rate('DRF_THROTTLE_REPORTS_DEPARTMENTS_OVERVIEW', '120/min'),
        # Dedicated auth endpoint throttle scopes to avoid refresh/login coupling.
        # Defaults preserve moderate brute-force resistance on obtain and allow
        # higher refresh throughput under concurrent active sessions.
        'token_obtain': _rate('DRF_THROTTLE_TOKEN_OBTAIN', '30/min'),
        'token_refresh': _rate('DRF_THROTTLE_TOKEN_REFRESH', '120/min'),
        'login': _rate('DRF_THROTTLE_LOGIN', '10/min'),
        # Backup/restore endpoints (Phase 0: Step 0.3)
        # Keep practical defaults and let tests override stricter limits when needed.
        'backup_create': _rate('DRF_THROTTLE_BACKUP_CREATE', '30/min'),
        'backup_delete': _rate('DRF_THROTTLE_BACKUP_DELETE', '5/hour'),
        'backup_download': _rate('DRF_THROTTLE_BACKUP_DOWNLOAD', '20/hour'),
        'backup_status': _rate('DRF_THROTTLE_BACKUP_STATUS', '120/min'),
        # New granular scopes for restore and upload+restore
        'backup_restore': _rate('DRF_THROTTLE_BACKUP_RESTORE', '2/hour'),
        'backup_upload_restore': _rate('DRF_THROTTLE_BACKUP_UPLOAD_RESTORE', '2/hour'),
        # Department ↔ Project Role mapping endpoints (feature-phase)
        'department_roles_map': _rate('DRF_THROTTLE_DEPT_ROLES_MAP', '600/min'),
        'department_roles_mutate': _rate('DRF_THROTTLE_DEPT_ROLES_MUTATE', '60/min'),
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
    'ENUM_NAME_OVERRIDES': {
        'DeliverablePhaseEnum': 'core.choices.DeliverablePhase',
    },
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
    except Exception:  # nosec B110
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
# Snapshot/page endpoint-specific cache controls (seconds)
ASSIGNMENTS_PAGE_CACHE_TTL_SECONDS = _int_non_negative('ASSIGNMENTS_PAGE_CACHE_TTL_SECONDS', 20)
GRID_SNAPSHOT_CACHE_TTL_SECONDS = _int_non_negative('GRID_SNAPSHOT_CACHE_TTL_SECONDS', 20)
SNAPSHOT_CACHE_SWR_SECONDS = _int_non_negative('SNAPSHOT_CACHE_SWR_SECONDS', 30)
# Assignment hours storage strategy:
# - dual: write JSON + normalized rows, read path may progressively adopt normalized queries
# - normalized: canonical read/write through normalized rows (JSON kept for compatibility window)
ASSIGNMENT_HOURS_STORAGE_MODE = os.getenv('ASSIGNMENT_HOURS_STORAGE_MODE', 'dual').strip().lower() or 'dual'
if ASSIGNMENT_HOURS_STORAGE_MODE not in ('dual', 'normalized'):
    ASSIGNMENT_HOURS_STORAGE_MODE = 'dual'
# Scoped snapshot invalidation controls for read-after-write guarantees.
SNAPSHOT_SCOPE_INVALIDATION_ENABLED = os.getenv('SNAPSHOT_SCOPE_INVALIDATION_ENABLED', 'true').lower() == 'true'
SNAPSHOT_INVALIDATION_CHANNEL = os.getenv('SNAPSHOT_INVALIDATION_CHANNEL', 'snapshot_invalidation')
# DASHBOARD_CACHE_TTL is intentionally not set by default; set via env when needed.

# CORS/CSRF
DEV_ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
]
if HOST_IP:
    DEV_ALLOWED_ORIGINS.append(f'http://{HOST_IP}:3000')

_cors_from_env = os.getenv('CORS_ALLOWED_ORIGINS')
if _cors_from_env is not None:
    CORS_ALLOWED_ORIGINS = _parse_origin_list(_cors_from_env)
else:
    CORS_ALLOWED_ORIGINS = list(DEV_ALLOWED_ORIGINS) if DEBUG else []
_validate_origin_list(CORS_ALLOWED_ORIGINS, name='CORS_ALLOWED_ORIGINS')

# Expose headers for client-side downloads (filename via Content-Disposition)
try:
    CORS_EXPOSE_HEADERS = list(set((globals().get('CORS_EXPOSE_HEADERS') or []) + ['Content-Disposition']))
except Exception:
    CORS_EXPOSE_HEADERS = ['Content-Disposition']

_csrf_from_env = os.getenv('CSRF_TRUSTED_ORIGINS')
if _csrf_from_env is not None:
    CSRF_TRUSTED_ORIGINS = _parse_origin_list(_csrf_from_env)
else:
    CSRF_TRUSTED_ORIGINS = list(DEV_ALLOWED_ORIGINS) if DEBUG else []
_validate_origin_list(CSRF_TRUSTED_ORIGINS, name='CSRF_TRUSTED_ORIGINS')

_oauth_popup_origins_env = os.getenv('OAUTH_POPUP_ALLOWED_ORIGINS')
if _oauth_popup_origins_env is not None:
    OAUTH_POPUP_ALLOWED_ORIGINS = _parse_origin_list(_oauth_popup_origins_env)
else:
    OAUTH_POPUP_ALLOWED_ORIGINS = list(CORS_ALLOWED_ORIGINS)
_validate_origin_list(OAUTH_POPUP_ALLOWED_ORIGINS, name='OAUTH_POPUP_ALLOWED_ORIGINS')

if not DEBUG and not RUNNING_TESTS:
    if CORS_ALLOW_CREDENTIALS and not CORS_ALLOWED_ORIGINS:
        raise ImproperlyConfigured(
            'CORS_ALLOWED_ORIGINS must be explicitly configured when cookie auth is enabled in production'
        )
    if not CSRF_TRUSTED_ORIGINS:
        raise ImproperlyConfigured('CSRF_TRUSTED_ORIGINS must be explicitly configured when DEBUG=false')
    if not OAUTH_POPUP_ALLOWED_ORIGINS:
        raise ImproperlyConfigured('OAUTH_POPUP_ALLOWED_ORIGINS must be configured when DEBUG=false')
    if FEATURES.get('JOB_RESTORE_TOKEN_MODE', True):
        if _is_insecure_secret_key(RESTORE_JOB_TOKEN_SECRET):
            raise ImproperlyConfigured(
                'RESTORE_JOB_TOKEN_SECRET must be set to a non-default value when DEBUG=false'
            )
        if RESTORE_JOB_TOKEN_TTL_SECONDS <= 0 or RESTORE_JOB_TOKEN_TTL_SECONDS > 900:
            raise ImproperlyConfigured(
                'RESTORE_JOB_TOKEN_TTL_SECONDS must be between 1 and 900 when DEBUG=false'
            )

# (AUTO_REALLOCATION already enabled earlier)

# Performance monitoring configuration
# Silk enablement: default to on in DEBUG, but allow explicit override.
_silk_env = os.getenv('SILK_ENABLED')
SILK_ENABLED = (_silk_env.lower() == 'true') if _silk_env is not None else (DEBUG and not RUNNING_TESTS)
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
# Test/ops toggle: control auto-creation of UserProfile on user creation
ENABLE_PROFILE_AUTO_CREATE = os.getenv('ENABLE_PROFILE_AUTO_CREATE', 'true').lower() == 'true'
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
CELERY_BEAT_SCHEDULE = globals().get('CELERY_BEAT_SCHEDULE', {})
CELERY_BEAT_SCHEDULE['integrations-rule-planner'] = {
    'task': 'integrations.tasks.integration_rule_planner',
    'schedule': timedelta(minutes=int(os.getenv('INTEGRATIONS_PLANNER_INTERVAL_MINUTES', '5'))),
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

# Public app base URL for building links in emails (password reset, invites)
# Prefer EMAIL_DOMAIN (domain or full URL) when provided, else fallback to APP_BASE_URL.
EMAIL_DOMAIN = os.getenv('EMAIL_DOMAIN', '')
APP_BASE_URL = os.getenv('APP_BASE_URL', 'http://localhost:3000')

# Email configuration (SMTP or console)
# Defaults to console backend in DEBUG unless explicitly overridden.
_default_email_backend = 'django.core.mail.backends.console.EmailBackend' if DEBUG else 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_BACKEND = os.getenv('EMAIL_BACKEND', _default_email_backend)
EMAIL_HOST = os.getenv('EMAIL_HOST', 'smtp.gmail.com')
EMAIL_PORT = int(os.getenv('EMAIL_PORT', '587'))
EMAIL_USE_TLS = os.getenv('EMAIL_USE_TLS', 'true').lower() == 'true'
EMAIL_USE_SSL = os.getenv('EMAIL_USE_SSL', 'false').lower() == 'true'
EMAIL_TIMEOUT = int(os.getenv('EMAIL_TIMEOUT', '10'))
EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD', '')

_from_default = f"Workload Tracker <{EMAIL_HOST_USER}>" if EMAIL_HOST_USER else 'Workload Tracker <no-reply@example.com>'
DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL', _from_default)
SERVER_EMAIL = os.getenv('SERVER_EMAIL', DEFAULT_FROM_EMAIL.split('<')[-1].strip('>') if '<' in DEFAULT_FROM_EMAIL else DEFAULT_FROM_EMAIL)
