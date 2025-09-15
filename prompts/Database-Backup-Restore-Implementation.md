# Database Backup and Restore Implementation Plan

## Overview
This document provides step-by-step prompts for implementing comprehensive database backup and restore functionality in the Workload Tracker application. Each step is designed to be fed to an AI agent as an individual task to ensure manageable implementation and avoid breaking changes.

## Implementation Phases

### Phase 0: Environment & Safety Prep (New)

Before implementing any code, ensure the runtime can safely create and restore backups without breaking production:

#### Step 0.1: Standardize Backup Location
```
Update configuration to define and use a non-public backups directory.

Files to update:

1) backend/config/settings.py
- Add constants near other path settings:

    BACKUPS_DIR = os.getenv('BACKUPS_DIR', '/backups')
    READ_ONLY_MODE = os.getenv('READ_ONLY_MODE', 'false').lower() == 'true'
    DB_ADMIN_URL = os.getenv('DB_ADMIN_URL')  # optional privileged DSN for restore

- In REST_FRAMEWORK.DEFAULT_THROTTLE_RATES (see step 0.3), add backup_* rates.

2) .env.example
- Append variables:

    BACKUPS_DIR=/backups
    READ_ONLY_MODE=false
    # Optional privileged DSN for restore (DB owner)
    DB_ADMIN_URL=

3) .gitignore (root)
- Add this line if not present:

    backups/

Operational notes:
- Do not place backups under MEDIA_ROOT or any web-served directory.
- Ensure host directory ./backups exists and is writable by the backend container user.
```

#### Step 0.2: Dockerfile and Compose Updates
```
Make Postgres client tools available in production and mount backups volume.

1) docker/backend/Dockerfile (production stage)
- Add postgresql-client to the production stage apt-get list:

    RUN apt-get update && apt-get install -y --no-install-recommends \
        netcat-openbsd \
        postgresql-client \
        && rm -rf /var/lib/apt/lists/*

2) docker-compose.yml (dev)
- In services.backend.volumes add: - ./backups:/backups:rw
- In services.worker.volumes add: - ./backups:/backups:rw
- Ensure env exposes BACKUPS_DIR=/backups for backend and worker.

3) docker-compose.prod.yml (prod)
- In services.backend.volumes add: - ./backups:/backups:rw
- In services.worker.volumes add: - ./backups:/backups:rw
- Add a dedicated maintenance worker (optional but recommended):

    worker_db:
      build:
        context: ./backend
        dockerfile: ../docker/backend/Dockerfile
        target: production
      restart: unless-stopped
      command: celery -A config worker -l info --concurrency=1 -Q db_maintenance
      environment:
        - DEBUG=false
        - DJANGO_SETTINGS_MODULE=config.settings
        - REDIS_URL=redis://:${REDIS_PASSWORD:-workload-redis-prod}@redis:6379/1
        - CELERY_BROKER_URL=${CELERY_BROKER_URL:-redis://:${REDIS_PASSWORD:-workload-redis-prod}@redis:6379/1}
        - CELERY_RESULT_BACKEND=${CELERY_RESULT_BACKEND:-redis://:${REDIS_PASSWORD:-workload-redis-prod}@redis:6379/1}
      volumes:
        - ./backend:/app:ro
        - ./backups:/backups
      depends_on:
        - db
        - redis

Notes:
- Do NOT mount `/backups` into nginx; backups are downloaded via authenticated API only.
```

#### Step 0.3: App Settings, Throttles, and Ignore Rules
```
Add DRF throttle scopes and env overrides for backup endpoints.

1) backend/config/settings.py
- In REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'], add:

    'backup_create': os.getenv('DRF_THROTTLE_BACKUP_CREATE', '2/hour'),
    'backup_delete': os.getenv('DRF_THROTTLE_BACKUP_DELETE', '5/hour'),
    'backup_download': os.getenv('DRF_THROTTLE_BACKUP_DOWNLOAD', '20/hour'),
    'backup_status': os.getenv('DRF_THROTTLE_BACKUP_STATUS', '120/min'),

2) .env.example
- Append:

    DRF_THROTTLE_BACKUP_CREATE=2/hour
    DRF_THROTTLE_BACKUP_DELETE=5/hour
    DRF_THROTTLE_BACKUP_DOWNLOAD=20/hour
    DRF_THROTTLE_BACKUP_STATUS=120/min
```

#### Step 0.4: Maintenance Mode and Concurrency Guard
```
Add operational safety switches:

1) backend/core/middleware.py
- Implement ReadOnlyModeMiddleware:
  - For unsafe methods (POST/PUT/PATCH/DELETE), if settings.READ_ONLY_MODE is true OR file exists at BACKUPS_DIR/.restore.lock, return 503 JSON {detail: 'Read-only maintenance'}
  - For GET/HEAD/OPTIONS, pass through

2) backend/config/settings.py
- Insert 'core.middleware.ReadOnlyModeMiddleware' in MIDDLEWARE right after RequestIDLogMiddleware

3) Commands will create/remove .backup.lock and .restore.lock in BACKUPS_DIR to guard concurrency.
```

#### Step 0.5: Naming Convention and Discovery
```
Adopt a consistent, sortable naming format for backup files:
- <app>_<env>_<db>_YYYYmmddTHHMMSSZ.pgcustom (for custom format) or .sql.gz (for plain SQL)
- Sanitize all user-provided parts (description becomes sidecar meta only)
- Sidecar metadata file: same basename with .meta.json
```

#### Step 0.6: Encryption and Offsite (Optional)
```
Plan for secure storage and disaster recovery:
- Optional GPG/KMS encryption: encrypt archives at rest; manage keys outside the repo
- Optional offsite sync: configure S3/GCS/Azure via rclone/awscli; enable server-side encryption
- Never store keys in the repo; use environment variables or secret stores
```

#### Step 0.7: Celery & Queue Readiness (Mandatory for Backup/Restore)
```
Ensure async infrastructure is available and configured:
- Celery + Redis must be running; endpoints return 503 if unavailable
- Add a dedicated queue ("db_maintenance") with worker concurrency=1
- Use per-task timeouts for backup/restore (soft 7200s, hard 10800s); disable retries for restore
- Tasks must not use Django ORM during backup/restore; use subprocess to call pg_dump/pg_restore

Code changes:
1) backend/config/settings.py
- Add task routes so backup tasks land on the db_maintenance queue:

    CELERY_TASK_ROUTES = {
        'core.backup_tasks.*': {'queue': 'db_maintenance'},
    }

2) Add new file backend/core/backup_tasks.py
- Create Celery tasks that wrap management commands without ORM usage:

    from celery import shared_task
    from django.core.management import call_command

    @shared_task(bind=True, soft_time_limit=7200, time_limit=10800)
    def create_backup_task(self, description: str | None = None) -> dict:
        return call_command('backup_database', description=description)

    @shared_task(bind=True, soft_time_limit=7200, time_limit=10800)
    def restore_backup_task(self, path: str, jobs: int = 2, confirm: str | None = None, migrate: bool = False) -> dict:
        return call_command('restore_database', path=path, jobs=jobs, confirm=confirm, migrate=migrate)

Worker changes:
- Dev/Prod compose: run a dedicated worker bound to -Q db_maintenance with concurrency=1 (see step 0.2).
```

#### Step 0.8: Privileged Restore Credentials
```
Provide a separate privileged DSN for restore operations:
- .env.example: add DB_ADMIN_URL= (left empty by default)
- backend/config/settings.py reads DB_ADMIN_URL; commands must use it when present
- Use PGPASSFILE for auth where possible; never log credentials
- Required role: DB/schema owner; superuser only if you plan to terminate sessions
```

### Phase 1: Backend Infrastructure Setup

#### Step 1.1: Create Database Backup Service
**Prompt for AI Agent:**
```
Add backend/core/management/commands/backup_database.py (management command) that:
- Builds pg_dump command from DATABASE_URL (use DB_ADMIN_URL if provided) without ORM calls
- Default: pg_dump -Fc -Z 6 --no-owner --no-privileges; support --format=plain (then gzip)
- Args: --filename (optional), --format (custom|plain), --description (optional)
- Preflight: ensure settings.BACKUPS_DIR exists/writable; estimate DB size; check free disk
- Lock: create BACKUPS_DIR/.backup.lock; abort if exists; always remove on exit
- Output: write under BACKUPS_DIR with sanitized name; refuse MEDIA_ROOT or project paths
- Metadata: compute SHA256; write sidecar JSON <name>.meta.json with { appVersion, migrationsHash, dbVersion, startedAt, finishedAt, size, sha256, format, description }
- Return dict { path, filename, size, sha256, createdAt }
- Use subprocess.run([...], check=True); never log credentials

Implementation outline (key points):
- Resolve DSN via os.getenv('DB_ADMIN_URL') or DATABASES['default']
- For plain: pipe pg_dump to gzip; for custom: direct file
- Sanitize filename with re.sub and os.path.basename
```

#### Step 1.2: Create Database Restore Service  
**Prompt for AI Agent:**
```
Add backend/core/management/commands/restore_database.py (management command) that:
- Requires --confirm phrase: "I understand this will irreversibly overwrite data"
- Args: --path (required, under BACKUPS_DIR), --jobs (int, default 2), --migrate (bool), --postvacuum (bool)
- Use DB_ADMIN_URL when present; fallback to DATABASE_URL; prefer PGPASSFILE
- Validate: path under BACKUPS_DIR; archive type (custom vs .sql.gz); for custom, run pg_restore -l
- Migration compatibility:
  - Capture current migration state (app labels → last migration) before restore
  - After restore, re-check migration state; if mismatched, report and, when --migrate/--force-migrate provided, run migrations
  - Validate backup sidecar metadata appVersion/migrationsHash and warn when incompatible
- Session control (if privileges allow): REVOKE/limit connections; pg_terminate_backend existing sessions
- Drop and recreate public schema only
- Restore:
  - If custom: pg_restore -j {jobs} --no-owner --no-privileges --if-exists --clean -d <dsn> <file>
  - If .sql.gz: gunzip -c <file> | psql <dsn>
- Locking: create BACKUPS_DIR/.restore.lock; remove after; respect READ_ONLY_MODE semantics
- Post: optionally run manage.py migrate; VACUUM ANALYZE when requested
- Return dict { success, restoredFrom, jobs, migrated, vacuumed }
- Never log credentials; capture stdout/stderr
```

#### Step 1.3: Create Backup Management Service
**Prompt for AI Agent:**
```
Create backend/core/backup_service.py with a BackupService class that:
- Lists available backup files in settings.BACKUPS_DIR
- Provides file metadata (size, creation date, checksum, description)
- Stores human description and code version in a sidecar JSON (filename.meta.json) to avoid DB dependencies
- Validates backup file integrity (gzip header/custom format list, checksum verification)
- Maintains an "incoming" subfolder for uploaded archives; quarantine until validated
- Implements a retention policy (e.g., 7 daily, 4 weekly, 12 monthly) with a cleanup method
- Implements a single-operation lock (lock file) to guard concurrent backup/restore
- Handles backup file deletion with path safety checks and admin audit hooks
- Provides methods for both creating and restoring backups (wrapping the management commands)
- Returns structured data suitable for API responses
- Includes proper error handling and logging; never expose secrets
```

### Phase 2: API Endpoints

#### Step 2.1: Create Backup API Views
**Prompt for AI Agent:**
```
Add backend/core/backup_views.py implementing admin-only DRF views:

Classes and endpoints:
- class BackupListCreateView(APIView):
  - permission_classes = [IsAdminUser]; throttle_scope for POST='backup_create'
  - POST /api/backups/: body { description? }
    - validate Celery availability; enqueue create_backup_task(description) on db_maintenance; return { jobId, statusUrl }
  - GET /api/backups/: return BackupService.list_backups()

- class BackupStatusView(APIView):
  - throttle_scope='backup_status'
  - GET /api/backups/status/: return BackupService.get_status()

- class BackupDownloadView(APIView):
  - throttle_scope='backup_download'
  - GET /api/backups/{id}/download/: validate path; stream FileResponse with safe headers

- class BackupDeleteView(APIView):
  - throttle_scope='backup_delete'
  - DELETE /api/backups/{id}/: validate and delete via BackupService; log AdminAuditLog

Implementation details:
- Use ScopedRateThrottle per view; build absolute statusUrl to existing job endpoint: `/api/jobs/{job_id}/` via request.build_absolute_uri
- Use BackupService for listing/validation/deletion/status; never use MEDIA storage here
- On Celery unavailable: return 503 for POST; GET endpoints still work
```

#### Step 2.2: Create Restore API Views
**Prompt for AI Agent:**
```
Add restore endpoints to backend/core/backup_views.py:

- class BackupRestoreView(APIView): permission_classes=[IsAdminUser]
  - POST /api/backups/{id}/restore/: body { confirm: string, jobs?: number, migrate?: boolean }
  - Require exact confirm phrase; validate path under BACKUPS_DIR; enqueue restore_backup_task(path, jobs, confirm, migrate) on db_maintenance
  - Return { jobId, statusUrl }

- class UploadAndRestoreView(APIView): permission_classes=[IsAdminUser]
  - POST /api/backups/upload-restore/: multipart file + confirm phrase
  - Stream to BACKUPS_DIR/incoming; validate; move to canonical location; enqueue restore task

Notes:
- Do not toggle READ_ONLY_MODE in views; the command/task manages lock and mode
- On Celery unavailable: return 503 for restore requests
```

#### Step 2.3: Add Backup URLs to Django Configuration
**Prompt for AI Agent:**
```
Wire URLs in backend/config/urls.py:
- Import: from core import backup_views as backups
- Append to urlpatterns:
  path('api/backups/', backups.BackupListCreateView.as_view(), name='backups_list_create'),
  path('api/backups/status/', backups.BackupStatusView.as_view(), name='backups_status'),
  path('api/backups/<str:id>/download/', backups.BackupDownloadView.as_view(), name='backups_download'),
  path('api/backups/<str:id>/', backups.BackupDeleteView.as_view(), name='backups_delete'),
  path('api/backups/<str:id>/restore/', backups.BackupRestoreView.as_view(), name='backups_restore'),
  path('api/backups/upload-restore/', backups.UploadAndRestoreView.as_view(), name='backups_upload_restore'),
```

### Phase 3: Frontend Infrastructure

#### Step 3.1: Add Backup API Methods to Existing Service
**Prompt for AI Agent:**
```
Update frontend/src/services/api.ts to add a new export const backupApi = { ... } using existing apiClient pattern.

Implement methods:
- createBackup(description?: string): POST '/backups/' → { jobId, statusUrl }
- getBackups(): GET '/backups/' → BackupListResponse
- getBackupStatus(): GET '/backups/status/' → BackupStatus
- deleteBackup(id: string): DELETE `/backups/${id}/`
- restoreBackup(id: string, confirm: string, options?: { jobs?: number; migrate?: boolean }): POST `/backups/${id}/restore/` → { jobId, statusUrl }
- uploadAndRestore(file: File, confirm: string, options?: { jobs?: number; migrate?: boolean }): POST '/backups/upload-restore/' (multipart) → { jobId, statusUrl }

Implementation details:
- Use encodeURIComponent for dynamic path segments
- Use FormData for uploads and set Content-Type to multipart/form-data
- Reuse authHeaders()/apiClient; follow error handling/toast patterns used elsewhere
- Expose React Query hooks (optional): useQuery(['backups'], backupApi.getBackups), invalidate on mutations

Notes:
- UI must not expect granular table-level progress; rely on JobStatus polling with coarse phases
- If backend returns 503, disable backup/restore buttons and show guidance via toast
```

#### Step 3.2: Create Backup TypeScript Interfaces
**Prompt for AI Agent:**
```
Create frontend/src/types/backup.ts with:
- interface Backup { id: string; filename: string; size: number; createdAt: string; description?: string; sha256?: string; format: 'custom'|'plain' }
- interface BackupListResponse { items: Backup[] }
- interface BackupStatus { lastBackupAt?: string; lastBackupSize?: number; retentionOk: boolean; offsiteEnabled: boolean; offsiteLastSyncAt?: string; policy?: string }
- interface BackupRestoreRequest { confirm: string; jobs?: number; migrate?: boolean }

Follow naming and export patterns used in frontend/src/types/models.ts; re-export from a central index if applicable.
```

### Phase 4: UI Components

#### Step 4.1: Create Backup Management Component
**Prompt for AI Agent:**
```
Create frontend/src/components/settings/BackupManagement.tsx that:
- Displays list of available backups in a table format
- Shows backup metadata (date, size, description)
- Includes "Create Backup" button with optional description input
- Provides download links for backup files
- Includes delete buttons with confirmation dialogs
- Uses existing Card, Button, and Table components
- Follow existing design system (components/ui) for theming and spacing
- Handles loading states and error messages appropriately
- Use existing toast system (lib/toastBus) for success/error notifications
- Use React Query invalidate/refetch patterns after create/delete
```

#### Step 4.2: Create Restore Functionality Component  
**Prompt for AI Agent:**
```
Create frontend/src/components/settings/RestoreManagement.tsx that:
- Provides restore buttons for each backup in the list
- Includes file upload area for external backup files
- Shows prominent warning about data loss during restore
 - Requires typing an explicit confirmation phrase before restore
- Displays phase-based progress (prechecks → drop schema → restore → post-restore) via job polling
- Shows success/error messages after restore completion
- Uses existing modal/dialog patterns for confirmations
- Follow existing design system (components/ui) consistently
- Use existing toast system (lib/toastBus) for job start/success/error
```

#### Step 4.3: Create Confirmation Dialog Component
**Prompt for AI Agent:**
```
Create frontend/src/components/ui/ConfirmationDialog.tsx that:
- Accepts title, message, and confirmation text as props
- Shows clear warning about destructive operations
- Requires typing specific confirmation text to enable action
- Includes cancel and confirm buttons with appropriate styling
- Uses existing modal/dialog patterns from the codebase
- Follows VSCode dark theme color scheme
- Returns promise that resolves when user confirms or cancels
- Can be reused for other destructive operations
```

### Phase 5: Settings Integration

#### Step 5.1: Integrate Backup Components into Settings Page

### Phase 10: Postgres Major Upgrade Plan (to 17)

Goal: Align Postgres server with client tools (pg_dump/pg_restore) at version 17, remove restore incompatibilities, and standardize environments. This phase includes discrete, auditable steps for dev first, then production.

#### Step 10.1: Preconditions and Safety
```
Confirm prerequisites before any cutover:

- Verify recent backup exists and passes a test restore in dev:
  - File present under `./backups` and readable.
  - Sidecar `.meta.json` exists; record `dbVersion`, `size`, and `sha256`.
- Disable non-essential DB-writing middleware and profilers during maintenance:
  - In dev/prod: set `SILK_ENABLED=false` (already supported by settings override).
- Ensure backup/restore API works end-to-end in dev.
- Identify DB extensions in use (pg_stat_statements is default and supported in PG17):
  - `SELECT extname FROM pg_extension;`
- Note current DB size to estimate restore window.
```

#### Step 10.2: Dev Upgrade (Compose)
```
Edit docker-compose.yml to upgrade Postgres and isolate data:

1) services.db.image → postgres:17
2) services.db.volumes → use a new named volume to avoid cross-major reuse:
   - From: postgres_data:/var/lib/postgresql/data
   - To:   postgres_data_v17:/var/lib/postgresql/data
3) Keep existing `command:` tuning flags (pg_stat_statements works on PG17).

Apply and restore:
- docker compose down
- docker compose up -d db
- Wait for DB healthy
- Start app services: docker compose up -d backend worker worker_db
- Restore via UI (Backups → Restore) or CLI task if needed
- Verify:
  - /api/health/ 200
  - App login + core flows
  - Celery workers consume; Beat writes schedule to `/var/run/celery/beat-schedule` (named volume `beat_state`)
```

#### Step 10.3: Client Tooling Alignment
```
Target: pg_dump/pg_restore should match server major version (17).

- Current images already carry 17.x tools; no change required after DB is 17.
- If pinning is desired, ensure Dockerfile installs `postgresql-client` (not a specific older major).
- Keep the cross-version fallback in restore command as defense-in-depth, but it should no longer trigger.
```

#### Step 10.4: Production/Staging Upgrade (Compose.prod)
```
Edit docker-compose.prod.yml similarly:

1) services.db.image: postgres:17
2) services.db.volumes: use new volume name (e.g., postgres_data_v17)
3) Keep tuning flags; mount `./backups:/backups` for restore

Runbook (maintenance window):
1) Announce downtime; freeze writes (optional: set READ_ONLY_MODE=true)
2) Take a final backup in PG15 env; copy artifact off-host
3) Deploy compose changes; stop app services that hit DB
4) Start PG17 DB: docker compose -f docker-compose.prod.yml up -d db
5) Restore backup via API or management command; run migrations
6) Optional: run `VACUUM ANALYZE` (the command supports `--postvacuum`)
7) Start workers/beat/backend; verify health, login, critical flows
8) Remove READ_ONLY_MODE; reopen traffic (nginx)

Rollback plan:
- Keep old PG15 volume (original name) intact.
- If issues arise, stop services, switch db image back to postgres:15 and original volume, bring up, and restore service.
```

#### Step 10.5: Verification Checklist
```
- DB readiness: /api/readiness/ shows database=ok
- App migrations applied successfully
- Celery workers process a test task; Beat ticking without errors
- Backup/restore endpoints operate normally
- Logs free of `transaction_timeout` / cross-version errors
- Extensions present: `SELECT extname FROM pg_extension;`
```

#### Step 10.6: Post-Upgrade Tasks
```
- Update any ops docs to reflect PG17 baseline
- Monitor performance; optionally run `ANALYZE`/`REINDEX` for large tables if needed
- Confirm Sentry/metrics dashboards
- Remove legacy client pinning if present; standardize on matching major server/client
```

#### Step 10.7: Prompts for AI Agent
```
- Patch docker-compose.yml to set db image to postgres:17 and switch volume to postgres_data_v17
- Patch docker-compose.prod.yml similarly (postgres:17 + postgres_data_v17)
- Ensure backend/worker Dockerfile retains compatible client tools (17)
- Add a short upgrade script or Make target:
  - make db-upgrade-dev: brings up PG17, restores latest backup, runs migrations
- Validate health endpoints and basic flows; report findings
```
**Prompt for AI Agent:**
```
Update frontend/src/pages/Settings/Settings.tsx to include backup functionality:
- Add new "Backup & Restore" section to existing settings tabs/sections
- Import and render BackupManagement and RestoreManagement components
- Maintain existing settings page layout and styling
- Add appropriate section headers and descriptions
- Ensure components are properly spaced and organized
- Keep existing settings sections unchanged
- Test that navigation and layout remain functional
- Follow patterns used by existing settings components (e.g., RoleList/RoleForm) for structure and wiring
```

#### Step 5.2: Add Backup Section Navigation
**Prompt for AI Agent:**
```
Update settings navigation in frontend/src/pages/Settings/ (index or containing component) to include:
- "Backup & Restore" option in settings menu/tabs
- Appropriate icon for backup section (database or save icon)
- Maintain existing navigation patterns and styling
- Ensure proper active state highlighting
- Keep existing navigation structure intact
- Test that all navigation links work correctly
```

#### Step 5.3: Backup Dashboard Enhancements
```
Enhance UI for operational clarity:
- Show last successful backup time, size, and retention compliance (uses getBackupStatus)
- Show offsite sync status if enabled
- Expose parallel restore threads setting (default 2–4) with inline help
- Show encryption status and key management guidance if enabled
- Provide a clear warning and confirm phrase for restores; require typing the phrase
```

### Phase 6: Security and Validation

#### Step 6.1: Add Backend Security Measures
**Prompt for AI Agent:**
```
Enhance backup/restore endpoints with security measures:
- Restrict backup/restore operations to admin users only
- Add rate limiting to prevent abuse of backup creation
- Validate uploaded backup files for security threats
- Sanitize backup filenames to prevent directory traversal
- Add audit logging for all backup/restore operations
- CSRF: JWT-authenticated DRF endpoints do not require CSRF; if session auth is used, rely on existing DRF CSRF handling
- Validate file sizes to prevent disk space issues
- Add timeout protection for long-running operations
- Do NOT serve backups from MEDIA; only via authenticated API streaming
- Support optional archive encryption; keys must be provided via secure env and never logged
- Forbid backups under publicly served directories; enforce path allowlist under BACKUPS_DIR
```

#### Step 6.2: Add Frontend Validation and Safety
**Prompt for AI Agent:**  
```
Add client-side validation and safety measures:
- Validate backup file types and sizes before upload
- Show clear warnings about restore operation consequences
- Add progress indicators with cancel options
- Implement client-side timeout handling
- Show confirmation dialogs for all destructive operations
- Add form validation for backup descriptions
- Include proper error boundary handling
- Test all user interaction scenarios thoroughly
```

### Phase 7: Testing and Documentation

#### Step 7.1: Create Backend Tests
**Prompt for AI Agent:**
```
Create comprehensive tests in backend/core/tests/test_backup.py:
- Test backup creation with various scenarios
- Test backup restoration functionality  
- Test error handling for corrupted files
- Test permission restrictions work correctly
- Test file cleanup and validation
- Use Django's test database for safety
- Mock file system operations where appropriate
- Include edge cases and error conditions
- Verify AdminAuditLog entries are written for backup/restore/delete
- Verify throttles enforce limits on backup endpoints
- Verify lock file prevents concurrent operations
- Verify status endpoint reports last backup and retention
- Verify path traversal attempts are rejected
- When Celery is unavailable, endpoints return 503 and do not run in-process
- Restore task runs on queue "db_maintenance" and enforces READ_ONLY_MODE during execution
```

#### Step 7.2: Create Frontend Tests
**Prompt for AI Agent:**
```
Create frontend tests for backup components:
- Test backup list display and interactions
- Test restore confirmation flows
- Test file upload functionality
- Test error handling and user feedback
- Test responsive design and accessibility
- Use existing testing patterns from the codebase
- Include user interaction testing with appropriate libraries
- Test integration with settings page
```

### Phase 8: Documentation and Deployment

#### Step 8.1: Update Docker Configuration
**Prompt for AI Agent:**
```
Update docker-compose.yml to support backup functionality:
- Add volume mount for backup storage directory: ./backups:/backups to backend and worker
- Ensure backend production container can execute pg_dump/pg_restore (install postgresql-client in prod stage)
- Add BACKUPS_DIR env var with default /backups
- Keep backups volume off nginx to prevent public exposure
- Test that backup/restore works in Docker environment
- Document new volumes and configuration requirements
- Optionally enable Celery beat for scheduled backups and retention cleanup
```

#### Step 8.2: Create User Documentation
**Prompt for AI Agent:**
```
Update CLAUDE.md with backup/restore usage instructions:
- Document new backup management commands
- Explain backup file locations and formats
- Provide restore procedure and safety warnings
- Include troubleshooting common issues
- Add backup best practices recommendations
- Document new settings page functionality
- Include Docker-specific backup considerations
- Document retention policy, scheduled backups, and offsite sync configuration
- Document encryption workflow and key management responsibilities
```

### Phase 9: Automation, Retention, and Offsite (Optional but Recommended)

#### Step 9.1: Implement Retention Cleanup Command
**Prompt for AI Agent:**
```
Create backend/core/management/commands/cleanup_backups.py that:
- Reads a retention policy (e.g., 7 daily, 4 weekly, 12 monthly) from settings or env
- Deletes expired backups safely using metadata timestamps and naming
- Skips files with active lock/in-progress markers
- Logs a concise summary and updates status for /api/backups/status/
```

#### Step 9.2: Schedule Backups and Cleanup (Celery Beat)
**Prompt for AI Agent:**
```
Add optional Celery beat schedule to run:
- Nightly backup creation (off-hours), with description and policy tags
- Daily retention cleanup (after backup)
- Expose schedules via env (cron expressions)
- Document enabling/disabling via env flags

Notes:
- Schedules are environment-specific; default to env-driven cron strings (e.g., BACKUP_SCHEDULE_CRON, CLEANUP_SCHEDULE_CRON)
- Provide sensible defaults (e.g., 02:00 backup, 02:30 cleanup) and document timezone
- Ensure tasks run on queue "db_maintenance" (single concurrency worker)
```

#### Step 9.3: Offsite Sync Command
**Prompt for AI Agent:**
```
Create backend/core/management/commands/sync_backups.py that:
- Pushes verified backups to S3/GCS/Azure (choose AWS S3 via boto3 or generic rclone)
- Supports server-side encryption (SSE/SSE-KMS)
- Skips in-progress files and updates sidecar meta with offsite sync timestamp
- Uses credentials via env variables; never commit secrets
```

#### Step 9.4: Notifications
**Prompt for AI Agent:**
```
Add optional Slack/email notification helper:
- On backup/restore/cleanup/sync success/failure, send a short summary
- Configure via env (e.g., SLACK_WEBHOOK_URL)
- Integrate into management commands and API flows (errors captured in Sentry)
```

#### Step 9.5: Nightly Restore Test (Safety Drill)
**Prompt for AI Agent:**
```
Add an optional management command to restore latest backup into a disposable database and run health checks:
- Create temp database, restore with limited connections, run manage.py check and migrate --check
- Drop temp database; report status via logs/notifications and /api/backups/status/
- Disabled by default; enable via env

What it does (for operators):
- Restores the newest backup into a temporary database, verifies basic health (manage.py check) and schema compatibility (migrate --check), then drops the temp DB.

Why it matters:
- Validates backups continuously so you’re not discovering restore problems during an incident.

Cost:
- Runtime and disk I/O scale with database size; schedule off-hours and keep it disabled by default.
```

#### Step 9.6: Backup Schedule UI (Admin Settings)
**Prompt for AI Agent:**
```
Add a new admin-only Scheduling section under Settings → Backup & Restore that allows configuring automation:

UI Requirements:
- Toggle: Enable scheduled backups
- Time: Daily time-of-day picker (and optional day-of-week selector)
- Retention inputs: daily / weekly / monthly counts
- Offsite toggle: enable/disable offsite sync (credentials remain in env; show read-only provider/target info)
- Read-only info: shows current cron strings and next run time; shows last run results (green/red) with concise message
- Buttons: Run backup now, Run cleanup now, Run offsite sync now

Backend Wiring:
- Provide a simple config endpoint (admin-only) to persist schedule and retention settings (model or settings store)
- When updated, refresh Celery beat schedule in-process; keep env overrides as fallback
- Never store secrets in the UI (offsite credentials remain env-only)

Accessibility & Safety:
- Clear warnings about off-hours execution and resource usage
- Confirm dialogs for "Run now" actions
```

## Implementation Notes

### Key Principles:
1. **Safety First**: All restore operations must require explicit confirmation
2. **Data Integrity**: Validate backup files before restoration attempts  
3. **User Experience**: Provide clear feedback during long-running operations
4. **Security**: Restrict access to admin users only
5. **Maintainability**: Follow existing code patterns and architecture
6. **Docker Compatibility**: Ensure functionality works within containerized environment
7. **No Public Exposure**: Never serve backups from MEDIA or static; only via authenticated API

### Error Handling Strategy:
- Graceful degradation for file system errors
- Clear user messages for common failure scenarios
- Comprehensive logging for debugging
- Rollback capabilities where possible

### Performance Considerations:
- Async operations for large backup/restore processes
- Progress tracking for user feedback
- File size limits to prevent system overload
- Cleanup of temporary files
- Prefer pg_dump custom format with compression; use pg_restore -j for parallel restore
- Run VACUUM ANALYZE after restore to warm statistics

### Observability & Notifications
- Emit Sentry breadcrumbs/events for backup start/success/failure (no secrets)
- Optional Slack/email notifications on success/failure with summary metadata
- Expose /api/backups/status/ for UI and external monitoring

### Automation & Retention
- Implement retention policy enforcement via a cleanup command and schedule (Celery beat)
- Optional nightly restore test into a disposable database to validate archives

### Repository & Layout Notes (Repo-Specific)
- Place API views at backend/core/backup_views.py (align with existing core/job_views.py pattern)
- Place service at backend/core/backup_service.py (avoid creating a new services/ package)
- Use settings.BACKUPS_DIR instead of hardcoding backend/backups/
- Add backups/ to .gitignore and do not commit backup artifacts
- Document an ops alternative: run restore from the db container as a privileged user (e.g., `docker compose exec db bash -lc "pg_restore ..."`) for environments preferring out-of-app execution

This implementation plan ensures a robust, secure, and user-friendly backup and restore system while maintaining code quality and following Django/React best practices.
