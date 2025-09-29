from .settings import *  # noqa

# Disable migrations for local apps during tests to run against SQLite
# without vendor-specific SQL in migrations (e.g., DROP COLUMN IF EXISTS).
# Django's test runner will create tables from models via syncdb for these apps.
MIGRATION_MODULES = {
    'core': None,
    'people': None,
    'projects': None,
    'assignments': None,
    'deliverables': None,
    'departments': None,
    'dashboard': None,
    'skills': None,
    'monitoring': None,
    'roles': None,
    'accounts': None,
    'reports': None,
    'personal': None,
}

# Test-friendly overrides
DEBUG = True
SECURE_SSL_REDIRECT = False
ALLOWED_HOSTS = ["testserver", "localhost", "127.0.0.1"]

# Disable auto-creating empty UserProfile records so tests can attach Person via get_or_create defaults
ENABLE_PROFILE_AUTO_CREATE = False
