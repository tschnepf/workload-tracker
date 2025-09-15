# Package Upgrade Path - Workload Tracker

## Executive Summary
This document outlines a comprehensive, step-by-step approach to upgrading all outdated packages in the Workload Tracker application. The upgrade path is organized by severity, with detailed prompts for AI agents to execute each upgrade safely.

Current Risk Level: HIGH (Multiple security vulnerabilities and performance issues)
Target State: Latest stable versions of all packages
Estimated Timeline: 3-4 weeks (phased approach)
Development Effort: 15-20 days total

## Lean Programming Best Practices (Apply to Every Step)
- Always create a backup before starting any upgrade
- Test each upgrade in isolation before moving to the next
- Maintain backward compatibility where possible
- Document all breaking changes and their fixes
- Use semantic versioning principles
- Run full test suite after each upgrade
- Update Docker images and rebuild containers after package changes

---

## PHASE 0: ENVIRONMENT & PRE-FLIGHT (Before Week 1)

Goal: Align environment and safety tooling to reduce risk during upgrades.

Instructions for the AI Agent:
- Always apply Lean Programming Best Practices (above)
- Ensure database backup tooling is ready and verified
- Standardize Node.js and Docker base images for reproducibility

Pre-Flight Tasks (Updated):
- Backups: Prefer full-fidelity, engine-native backups over `dumpdata`.
  - Primary: `docker-compose exec backend python manage.py backup_database`
  - Fallback: `make backup-db` (uses `pg_dump` into `./backups/`)
  - Verify backup exists in `./backups` and metadata generated
- Node.js baseline: Update frontend images to Node 20 LTS
  - Edit `docker/frontend/Dockerfile` stages to `node:20-alpine`
  - Rebuild: `docker-compose build frontend`
- OpenAPI workflow: Capture and type-gen wiring
  - `make openapi-schema` then `make openapi-client` to ensure typed client stays in sync post-backend changes
- Sanity checks: `docker-compose up -d && curl http://localhost:8000/api/health/`

Prompt for the AI Agent:
```
Goal: Prepare the environment for safe upgrades (Node 20, backups, OpenAPI sync).

Do:
1) Confirm DB backup works
   - Run: docker-compose up -d
   - Run: docker-compose exec backend python manage.py backup_database
   - Verify new file in ./backups and JSON metadata sidecar
2) Enforce Node 20 for frontend builds
   - Edit docker/frontend/Dockerfile: change all stages to FROM node:20-alpine
   - Run: docker-compose build frontend
3) Verify OpenAPI workflow
   - Run: make openapi-schema
   - Run: make openapi-client
   - Run: docker-compose exec frontend npm run build
4) Health checks
   - Run: curl -f http://localhost:8000/api/health/

Rollback:
- Revert Dockerfile and skip building if issues arise.
```

---

## PHASE 1: CRITICAL SECURITY UPDATES (Week 1)

### Step 1 - Django Security Update (5.0.14 -> 5.2.6)
Risk Level: CRITICAL | Priority: IMMEDIATE | Estimated Time: 4-6 hours

Goal: Upgrade Django to latest LTS version to patch security vulnerabilities and gain performance improvements.

Instructions for the AI Agent:
- Always apply Lean Programming Best Practices (above)
- Pre-Upgrade Analysis:
  - Check current Django version: `docker-compose exec backend python -c "import django; print(django.get_version())"`
  - Document current settings configuration
  - Backup database (Updated):
    - Preferred: `docker-compose exec backend python manage.py backup_database`
    - Fallback: `make backup-db`
- Backend Upgrade:
  - Update `backend/requirements.txt`: Change `Django==5.0.14` to `Django==5.2.6`
  - Rebuild backend container: `docker-compose build backend`
  - Run migrations: `docker-compose exec backend python manage.py migrate`
  - Check for deprecated settings warnings: `docker-compose exec backend python manage.py check`
- Settings Updates (Based on Django 5.0->5.2 changes):
  - Update `backend/config/settings.py`:
    - Ensure `DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'` is set
    - Update database connection settings for PostgreSQL 14+ compatibility
    - Add `STORAGES` setting if using custom file storage (replaces deprecated `DEFAULT_FILE_STORAGE`) — not required in this repo unless a custom storage backend is introduced
  - If using PostgreSQL, verify version compatibility (requires PostgreSQL 14+)
- Code Changes Required:
  - Replace any usage of `django.utils.timezone.utc` with `datetime.timezone.utc` (none found in repo)
  - Update any custom storage backends to use new `STORAGES` setting (not used in repo)
  - Fix any deprecated `force_text()` calls to use `force_str()` (none found in repo)
- Testing Protocol:
  - Verify admin interface loads: `http://localhost:8000/admin`
  - Test API endpoints: `curl http://localhost:8000/api/health/`
  - Run Django test suite: `docker-compose exec backend python manage.py test`
  - Validate dependencies: `docker-compose exec backend python -m pip check`
  - Verify database queries work correctly
  - Check for any console warnings or deprecation messages
- Rollback Plan:
  - Revert `requirements.txt` to `Django==5.0.14`
  - Restore database from backup if needed
- Success Criteria:
  - All tests passing
  - No deprecation warnings
  - Admin and API endpoints functional
  - Database migrations successful

Prompt for the AI Agent:
```
Goal: Upgrade Django to 5.2.6 and validate.

Do:
1) Create a backup: docker-compose exec backend python manage.py backup_database
2) Update versions in backend/requirements.txt
   - Set: Django==5.2.6
3) Rebuild + migrate
   - docker-compose build backend
   - docker-compose up -d backend
   - docker-compose exec backend python manage.py migrate
   - docker-compose exec backend python manage.py check
4) Verify settings
   - Ensure DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField' in backend/config/settings.py
5) Tests
   - docker-compose exec backend python manage.py test
   - docker-compose exec backend python -m pip check

Notes:
- No repo usages of force_text or timezone.utc were found; no code edits expected.

Rollback:
- Restore old requirements line and rebuild; restore DB from backup if needed.
```

### Step 2 - Django REST Framework Update (3.14.0 -> 3.16.1)
Risk Level: MEDIUM | Priority: HIGH | Estimated Time: 2-3 hours

Goal: Update DRF to latest version for security patches and Django 5.2 compatibility.

Instructions for the AI Agent:
- Always apply Lean Programming Best Practices (above)
- Pre-Upgrade Analysis:
  - Check current DRF version: `docker-compose exec backend python -c "import rest_framework; print(rest_framework.__version__)"`
  - Document current DRF settings and custom serializers
- Backend Upgrade:
  - Update `backend/requirements.txt`: Change `djangorestframework==3.14.0` to `djangorestframework==3.16.1`
  - Rebuild backend container: `docker-compose build backend`
- Code Changes Required:
  - Review and update any custom permission classes for new Django 5.2 compatibility
  - Check pagination classes for any deprecated methods
  - Verify JWT token handling with `djangorestframework-simplejwt==5.3.1` compatibility
- Settings Updates:
  - Review `REST_FRAMEWORK` settings in `backend/config/settings.py`
  - Ensure all authentication classes are compatible
  - Verify CORS settings work with new version
- Testing Protocol:
  - Test API authentication: Login via `/api/auth/login/`
  - Verify API pagination works correctly
  - Test all CRUD operations on main models (People, Projects, Assignments)
  - Check API schema generation: `docker-compose exec backend python manage.py spectacular --file openapi_test.json`
  - Regenerate frontend types and compile: `make openapi-client && docker-compose exec frontend npm run build`
  - Run full API test suite: `docker-compose exec backend python manage.py test`
- Success Criteria:
  - All API endpoints functional
  - Authentication working correctly
  - No breaking changes in serializers
  - OpenAPI schema generates without errors; typed client compiles

Prompt for the AI Agent:
```
Goal: Upgrade DRF to 3.16.1 and keep the typed client in sync.

Do:
1) Backup: docker-compose exec backend python manage.py backup_database
2) Update backend/requirements.txt
   - Set: djangorestframework==3.16.1
3) Rebuild + health
   - docker-compose build backend && docker-compose up -d backend
   - curl -f http://localhost:8000/api/health/
4) Regenerate OpenAPI and types
   - make openapi-schema
   - make openapi-client
   - docker-compose exec frontend npm run build
5) Tests
   - docker-compose exec backend python manage.py test

Rollback:
- Restore previous DRF pin; rebuild.
```

### Step 3 - Security Package Updates (Adjusted to latest)
Risk Level: HIGH | Priority: HIGH | Estimated Time: 1-2 hours

Goal: Update security-critical packages with known vulnerabilities.

Instructions for the AI Agent:
- Always apply Lean Programming Best Practices (above)
- Backend Security Updates:
  - Update `backend/requirements.txt`:
    - `openpyxl==3.1.2` -> `openpyxl==3.1.5` (CVE-2024-41962 fix)
    - `sentry-sdk[django]==2.37.0` -> `sentry-sdk[django]==2.38.0`
    - `psycopg2-binary==2.9.9` -> `psycopg2-binary==2.9.10`
- Frontend Security Updates:
  - Run security audit: `docker-compose exec frontend npm audit`
  - Fix high/critical vulnerabilities: `docker-compose exec frontend npm audit fix`
  - Keep React type definitions at 18.x for now (Updated):
    - Defer `@types/react` and `@types/react-dom` upgrades to Step 4 when React 19 is installed
- Testing Protocol:
  - Verify Excel import/export functionality works with new openpyxl
  - Test Sentry error reporting integration
  - Check database connections with new psycopg2
  - Run security scan: `docker-compose exec frontend npm audit --audit-level=high`
- Success Criteria:
  - No high/critical security vulnerabilities
  - All core functionality working
  - Sentry integration functional

Prompt for the AI Agent:
```
Goal: Apply critical security updates to backend and audit frontend.

Do:
1) Backup: docker-compose exec backend python manage.py backup_database
2) Update backend/requirements.txt pins
   - openpyxl==3.1.5
   - sentry-sdk[django]==2.38.0
   - psycopg2-binary==2.9.10
3) Rebuild + quick checks
   - docker-compose build backend && docker-compose up -d backend
   - docker-compose exec backend python -c "import openpyxl, psycopg2; print('ok')"
4) Frontend audit
   - docker-compose exec frontend npm audit
   - docker-compose exec frontend npm audit fix || true
5) Validate
   - Exercise Excel import/export path
   - Confirm Sentry DSN logs events (if configured)

Rollback:
- Restore previous pins.
```

---

## PHASE 2: MAJOR FRAMEWORK UPGRADES (Week 2-3)

### Step 4 - React 18 to React 19 Upgrade (Streamlined)
Risk Level: HIGH | Priority: CRITICAL | Estimated Time: 1-2 days

Goal: Upgrade to React 19 for performance improvements and modern features.

Instructions for the AI Agent:
- Always apply Lean Programming Best Practices (above)
- Pre-Upgrade Preparation:
  - Already on React 18.3.1; no intermediate step needed (Updated)
  - Ensure Node.js 20 LTS is used for frontend builds (Phase 0)
- Main React 19 Upgrade:
  - Update `frontend/package.json`:
    - `"react": "19.1.1"`
    - `"react-dom": "19.1.1"`
    - Then update types to match:
      - `"@types/react": "19.1.13"`
      - `"@types/react-dom": "19.1.9"`
- Code Changes Required:
  - Replace any `ReactDOM.render()` calls with `ReactDOM.createRoot()`
  - Remove any PropTypes usage (deprecated in React 19)
  - Update test files to import `act` from `react` instead of `react-dom/test-utils`
  - Check for any legacy Context API usage and migrate to modern Context
  - Note: Repo already uses `ReactDOM.createRoot` in `frontend/src/main.tsx` (Updated)
- Testing Protocol:
  - Run all unit tests: `docker-compose exec frontend npm run test:run`
  - Run E2E tests: `docker-compose exec frontend npm run e2e`
  - Test all major user workflows manually
  - Check browser console for React warnings
  - Verify performance with React DevTools Profiler
- Performance Validation:
  - Measure page load times before/after upgrade
  - Check render performance on large datasets (assignments grid)
  - Verify memory usage hasn't increased significantly
- Rollback Plan:
  - Revert `package.json` changes
  - Rebuild frontend container
  - Test basic functionality
- Success Criteria:
  - All tests passing
  - No React warnings in console
  - Application performs better or equal to React 18
  - All components render correctly

Prompt for the AI Agent:
```
Goal: Upgrade React/DOM to 19.1.1 and align types.

Do:
1) Update frontend/package.json deps
   - react: 19.1.1
   - react-dom: 19.1.1
   - @types/react: 19.1.13
   - @types/react-dom: 19.1.9
2) Install + build
   - docker-compose exec frontend npm install
   - docker-compose exec frontend npm run build
3) Verify code
   - Ensure ReactDOM.createRoot used in frontend/src/main.tsx
   - Grep for ReactDOM.render (should be none)
4) Tests
   - docker-compose exec frontend npm run test:run
   - docker-compose exec frontend npm run e2e || true

Rollback:
- Restore package.json and reinstall.
```

### Step 5 - TypeScript Update (5.6.3 -> 5.9.2)
Risk Level: LOW | Priority: MEDIUM | Estimated Time: 2-4 hours

Goal: Update TypeScript for better type checking and modern language features.

Instructions for the AI Agent:
- Always apply Lean Programming Best Practices (above)
- Frontend Upgrade:
  - Update `frontend/package.json`: `"typescript": "5.6.3"` -> `"typescript": "5.9.2"`
  - Rebuild container: `docker-compose build frontend`
- Type Checking:
  - Run type check: `docker-compose exec frontend npx tsc --noEmit`
  - Fix any new TypeScript errors that surface with stricter checking
  - Update any deprecated type usage
- Code Changes Required:
  - Review and fix any new strict null checks
  - Update import/export statements if needed
  - Fix any enum-related breaking changes
- Testing Protocol:
  - Build project: `docker-compose exec frontend npm run build`
  - Verify no TypeScript compilation errors
  - Test type safety in IDE (VSCode)
  - Run linting: `docker-compose exec frontend npm run lint`
- Success Criteria:
  - Clean TypeScript compilation
  - No regression in type safety
  - Build process works correctly

Prompt for the AI Agent:
```
Goal: Upgrade TypeScript to 5.9.2 and fix types.

Do:
1) Update frontend/package.json: typescript: 5.9.2
2) Install + typecheck
   - docker-compose exec frontend npm install
   - docker-compose exec frontend npx tsc --noEmit
3) Fix surfaced errors (strict null checks, enums, import syntax)
4) Build + lint
   - docker-compose exec frontend npm run build
   - docker-compose exec frontend npm run lint
```

---

## PHASE 3: BUILD TOOLING UPGRADES (Week 3-4)

### Step 6 - Vite Update (5.4.19 -> 7.1.5)
Risk Level: MEDIUM | Priority: MEDIUM | Estimated Time: 4-6 hours

Goal: Upgrade Vite for faster build times and modern ESM support.

Instructions for the AI Agent:
- Always apply Lean Programming Best Practices (above)
- Pre-Upgrade Analysis:
  - Document current Vite configuration in `frontend/vite.config.ts`
  - Check plugin compatibility with Vite 6
- Frontend Upgrade:
  - Update `frontend/package.json`:
    - `"vite": "5.4.19"` -> `"vite": "7.1.5"`
    - `"@vitejs/plugin-react": "4.3.3"` -> `"@vitejs/plugin-react": "5.0.2"`
- Configuration Updates (Check `frontend/vite.config.ts`):
  - Update plugin syntax if needed for Vite 6
  - Check build target compatibility
  - Verify proxy configuration syntax
  - Update any deprecated Vite options
- Plugin Compatibility:
  - Update Sentry Vite plugin if incompatible: `"@sentry/vite-plugin": "4.2.0"` -> latest 4.x/5.x compatible
  - Check `rollup-plugin-visualizer` compatibility
- Code Changes Required:
  - Review and update any Vite-specific imports
  - Check environment variable usage (import.meta.env)
  - Update any dynamic imports if syntax changed
  - After Router v7 (Step 8), update `vite.config.ts` manualChunks and `optimizeDeps.include` to reference `react-router` instead of `react-router-dom` (Updated)
  - Vite 7 notes: requires Node 18+ (we use Node 20). If using deprecated server.proxy syntax or optimizeDeps options, adjust to Vite 7 docs.
- Testing Protocol:
  - Test development server: `docker-compose exec frontend npm run dev`
  - Test build process: `docker-compose exec frontend npm run build`
  - Verify hot module replacement works
  - Check bundle analysis: `docker-compose exec frontend npm run build:analyze`
  - Measure build times before/after upgrade
- Performance Validation:
  - Compare development server startup time
  - Measure production build time
  - Verify bundle size hasn't increased significantly
- Success Criteria:
  - Faster or equal build times vs Vite 5
  - Development server works correctly
  - Hot module replacement functional
  - Production build succeeds

Prompt for the AI Agent:
```
Goal: Upgrade Vite to 7.1.5 and @vitejs/plugin-react to 5.0.2.

Do:
1) Update frontend/package.json
   - vite: 7.1.5
   - @vitejs/plugin-react: 5.0.2
2) Install + dev + build
   - docker-compose exec frontend npm install
   - docker-compose exec frontend npm run dev (smoke test HMR)
   - docker-compose exec frontend npm run build
3) Validate config
   - Ensure server.proxy works
   - Ensure analyzer still writes dist/stats.html

Notes:
- Requires Node >= 18 (we use Node 20 in Phase 0).
```

### Step 7 - Backend Ecosystem Updates (Plus cleanup)
Risk Level: MEDIUM | Priority: MEDIUM | Estimated Time: 3-4 hours

Goal: Update backend dependencies for security and performance improvements.

Instructions for the AI Agent:
- Always apply Lean Programming Best Practices (above)
- Backend Updates (to latest stable):
  - Update `backend/requirements.txt`:
    - `celery[redis]==5.4.0` -> `celery[redis]==5.5.3`
    - `redis==5.0.1` -> `redis==6.4.0` (verify Celery broker/result behavior)
    - `gunicorn==21.2.0` -> `gunicorn==23.0.0`
    - `django-silk==5.2.0` -> `django-silk==5.4.3`
    - `django-axes==6.5.0` -> `django-axes==8.0.0` (MAJOR)
    - `djangorestframework-simplejwt==5.3.1` -> `5.5.1`
    - `django-cors-headers==4.3.1` -> `4.8.0`
    - `dj-database-url==2.1.0` -> `3.0.1`
    - `boto3==1.35.21` -> `1.40.30`
    - `gevent==23.9.1` -> `25.8.2`
    - Remove `dataclasses==0.6` (bundled in Python 3.11; avoid conflicts) (Updated)
- Configuration Updates:
  - Check Celery configuration for any deprecated settings in `backend/config/celery.py`
  - Verify Redis connection settings in `backend/config/settings.py`
  - Update Gunicorn configuration if needed
  - django-axes 8 (MAJOR): review setting names (e.g., lockout, cooldown) and middleware paths; run migrations, confirm admin integration; keep feature flag off until verified
  - dj-database-url 3.x: no functional changes expected; ensure `conn_max_age` and health checks still applied
  - django-axes 8 explicit change: replace `AXES_COOLOFF_TIME` (float hours) with `AXES_COOLOFF = timedelta(hours=<float>)` and verify related settings (`AXES_ONLY_USER_FAILURES`, `AXES_LOCKOUT_PARAMETERS`, `AXES_ALERT_ADMINS`) still apply
- Code Changes Required:
  - Review Celery task decorators for any syntax changes
  - Check Redis connection handling; if using SSL or new timeouts, update URL/opts; validate `.ping()`
  - Update any Gunicorn-specific deployment scripts
 - Deployment sequencing (avoid migration races):
   - Start backend first so `manage.py migrate` completes; then start worker/beat containers
   - Alternatively, gate worker/beat migrations with an env (e.g., `SKIP_MIGRATIONS=true`) and skip migrate in their entrypoints
- Testing Protocol:
  - Test Celery worker: `docker-compose exec worker celery -A config worker --loglevel=info`
  - Verify Redis connection: `docker-compose exec backend python -c "import redis; r=redis.Redis(); print(r.ping())"`
  - Test background job processing
  - Check Django Silk profiling interface
  - Verify Django Axes login protection
  - Validate dependencies: `docker-compose exec backend python -m pip check`
- Success Criteria:
  - All background jobs working
  - Redis connectivity maintained
  - Performance monitoring functional
  - Security features operational

Prompt for the AI Agent:
```
Goal: Update backend ecosystem deps to latest and adjust settings.

Do:
1) Backup: docker-compose exec backend python manage.py backup_database
2) Update backend/requirements.txt pins
   - celery[redis]==5.5.3
   - redis==6.4.0
   - gunicorn==23.0.0
   - django-silk==5.4.3
   - django-axes==8.0.0
   - djangorestframework-simplejwt==5.5.1
   - django-cors-headers==4.8.0
   - dj-database-url==3.0.1
   - boto3==1.40.30
   - gevent==25.8.2
   - Remove: dataclasses==0.6
3) Update settings for django-axes 8
   - backend/config/settings.py: replace AXES_COOLOFF_TIME with
     AXES_COOLOFF = timedelta(hours=float(os.getenv('AXES_COOLOFF_TIME','1')))
   - Verify other AXES_* flags by name
4) Deployment sequencing
   - Start backend first to run migrate; then start worker/beat
5) Rebuild + validate
   - docker-compose build backend worker worker_db worker_beat
   - docker-compose up -d
   - docker-compose exec backend python -c "import redis;print(redis.Redis().ping())"
   - docker-compose exec worker celery -A config worker --loglevel=info -Q db_maintenance -c 1
6) pip check
   - docker-compose exec backend python -m pip check

Rollback:
- Restore previous pins one by one if a service fails to start.
```

---

## PHASE 4: ADVANCED UPGRADES (Week 4-5)

### Step 8 - React Router Upgrade (react-router-dom 6.28.0 -> react-router 7.9.1)
Risk Level: HIGH | Priority: MEDIUM | Estimated Time: 1-2 days

Goal: Upgrade React Router for improved type safety and modern routing patterns.

WARNING: This upgrade involves significant breaking changes and should be done last.

Instructions for the AI Agent:
- Always apply Lean Programming Best Practices (above)
- Pre-Upgrade Preparation:
  - Ensure React Router v6 future flags are enabled (already partially enabled via `future` options in `App.tsx`) (Updated)
- Package Updates:
  - IMPORTANT: React Router v7 consolidates packages
  - Update `frontend/package.json`:
    - Remove `"react-router-dom": "6.28.0"`
    - Add `"react-router": "7.9.1"`
    - Install: `docker-compose exec frontend npm install`
- Code Changes Required (BREAKING CHANGES):
  - Update ALL imports from `react-router-dom` to `react-router`:
    ```typescript
    // OLD
    import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';

    // NEW
    import { BrowserRouter, Routes, Route, Link } from 'react-router';
    ```
  - Update routing configuration to use `createBrowserRouter` pattern:
    ```typescript
    // Preferred v7 pattern
    const router = createBrowserRouter([
      {
        path: "/",
        element: <Layout />,
        children: [
          { path: "dashboard", element: <Dashboard /> },
          { path: "assignments", element: <AssignmentGrid /> },
          // ... other routes
        ],
      },
    ]);

    // Use RouterProvider instead of BrowserRouter
    root.render(<RouterProvider router={router} />);
    ```
  - Prefer scripted change (codemod) to avoid misses. For example, use a jscodeshift/ts-morph script to replace import sources project‑wide (Updated)
- File Updates Required:
  - `frontend/src/main.tsx` - Update to render `<RouterProvider>`
  - `frontend/src/App.tsx` - Remove BrowserRouter wrapper and route tree
  - All component files importing from react-router-dom
  - Navigation components (likely in `frontend/src/components/layout/`)
  - `frontend/vite.config.ts` - Update `manualChunks.router` and `optimizeDeps.include` from `react-router-dom` to `react-router` (Updated)
  - Vite config exact edits after migration:
    - In `manualChunks`: change `'router': ['react-router-dom']` to `'router': ['react-router']`
    - In `optimizeDeps.include`: replace `'react-router-dom'` with `'react-router'`
- Testing Protocol:
  - Test all navigation paths manually
  - Verify nested routing works correctly
  - Check browser back/forward buttons
  - Test programmatic navigation
  - Run E2E tests: `docker-compose exec frontend npm run e2e`
  - Verify URL parameters and query strings work
- Rollback Plan (Complex due to breaking changes):
  - Keep a full backup of all routing-related files
  - Document all import changes made
  - Be prepared for potential 1-day rollback effort
- Success Criteria:
  - All routes navigable
  - No routing-related console errors
  - Browser navigation works correctly
  - All tests passing

Prompt for the AI Agent:
```
Goal: Migrate to react-router v7 and update imports/config.

Do:
1) Update frontend/package.json
   - Remove: react-router-dom
   - Add: react-router@7.9.1
2) Install
   - docker-compose exec frontend npm install
3) Codemod imports project-wide
   - Replace `from 'react-router-dom'` with `from 'react-router'`
4) Router setup
   - frontend/src/main.tsx: createBrowserRouter([...]); root.render(<RouterProvider router={router} />)
   - frontend/src/App.tsx: remove <BrowserRouter> wrapper
5) Vite config updates
   - frontend/vite.config.ts: manualChunks.router -> ['react-router']; optimizeDeps.include: replace 'react-router-dom' with 'react-router'
6) Test
   - docker-compose exec frontend npm run build
   - docker-compose exec frontend npm run test:run
   - Navigate main flows manually

Rollback:
- Reinstall react-router-dom and revert import changes.
```

### Step 8B - Test Reliability Fixes After React 19 + Router v7
Risk Level: MEDIUM | Priority: HIGH | Estimated Time: 0.5–1.5 days

Goal: Resolve non-functional unit test failures introduced by React 19’s stricter act semantics and Router v7 changes, without altering app behavior.

Scope Notes:
- Text expectation changes like "On_hold" vs "On Hold" are intentionally deferred (tracked in Known Issues). Focus here is on structural test errors (act, concurrency, query assumptions, and router test utils).
- Tests should render with the same providers used at runtime (e.g., React Query). Introduce a lightweight TestProviders wrapper to reduce boilerplate and flakiness.

Issues and Fixes

1) Error: "An update to TestComponent inside a test was not wrapped in act(...)"
- Cause: Tests trigger state updates (setState, hooks, or async effects) and immediately assert without waiting for React to flush updates.
- Solution:
  - Prefer React Testing Library async APIs first: `await screen.findBy...`, `await waitFor(...)`, and `userEvent.setup()` helpers which internally use act.
  - Use manual `act` sparingly; if needed, wrap state-changing code in a single `await act(async () => { ... })` and avoid nested/parallel acts.
  - In React 19, import `act` from `react` (not react-dom/test-utils).
- Proposed change pattern:
  - Replace sync queries (`getBy*`) that race effects with async queries (`findBy*`) or `waitFor` (keep `getBy*` for truly synchronous elements).
  - Wrap imperative state updates and async handler invocations in one awaited act.

2) Error: "You seem to have overlapping act() calls ..."
- Cause: Tests launch multiple `act(async () => ...)` calls concurrently (e.g., by pushing Promises into an array and `Promise.all(...)`). React disallows overlapping act scopes.
- Solution:
  - Run updates sequentially: loop with `await act(async () => { ... })` for each iteration.
  - Or batch updates in a single act block if feasible.

3) Error: "Found multiple elements with the text: Unknown"
- Cause: Test uses `getByText` which requires a unique match, but the UI legitimately renders multiple matching nodes.
- Solution:
  - Use `getAllByText` and assert the expected count or specific instance.
  - Or scope the query using `within(container).getByText(...)` or prefer role/name queries (`getByRole('link', { name: /unknown/i })`) for stronger semantics.

4) Router v7 testing utilities alignment
- Cause: After switching to `react-router` v7 and `RouterProvider`, any tests that render routes or use router helpers may still rely on `react-router-dom` testing utilities, or custom wrappers assuming `BrowserRouter`.
- Solution:
  - Use `createMemoryRouter` + `RouterProvider` in tests to render routes.
  - Update imports to come from `react-router` (or `react-router/testing` if using their helpers) instead of `react-router-dom`. If tests mock hooks (e.g., `useNavigate`, `useLocation`, `useParams`), ensure they import from `react-router` in v7.
  - If tests mount components that depend on route context, wrap them with a small helper that returns a memory router and providers.

5) Providers and data fetching stability (React Query)
- Cause: Tests rendering components that depend on QueryClient may retry or schedule async updates, increasing act warnings and flakiness.
- Solution:
  - Provide a shared `TestProviders` wrapper that includes `QueryClientProvider` with retries disabled and any global context providers from `App`.
  - Example:
    ```tsx
    // test-utils.tsx
    import { render } from '@testing-library/react'
    import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
    import { RouterProvider, createMemoryRouter } from 'react-router'

    export function renderWithProviders(ui: React.ReactElement, { route = '/', routes } = {}) {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      const router = routes
        ? createMemoryRouter(routes, { initialEntries: [route] })
        : null
      const tree = (
        <QueryClientProvider client={client}>
          {router ? <RouterProvider router={router} /> : ui}
        </QueryClientProvider>
      )
      return render(router ? tree : (<QueryClientProvider client={client}>{ui}</QueryClientProvider>))
    }
    ```
  - Prefer `userEvent.setup()` for interactions and `await screen.findBy...`/`waitFor` for assertions.

Testing Protocol
- Run unit tests: `docker-compose exec frontend npm run test:run`
- For E2E in-container, install browsers first: `docker-compose exec frontend npx playwright install chromium` then `docker-compose exec frontend npm run e2e`
- Validate no act warnings appear; verify reduced flakiness and that failing tests either pass or are limited to the deferred text-formatting expectations.

Prompt for the AI Agent:
```
Goal: Fix React 19/Router v7 related test failures (act usage, overlapping acts, non-unique queries, router test utils).

Do:
1) Wrap state updates with act and use async queries (prefer async helpers first)
   - Search tests for act warnings:
     - Run: docker-compose exec frontend npm run test:run
     - Note failing files mentioning "not wrapped in act" or "overlapping act".
   - For each failing test:
     - Prefer: `const user = userEvent.setup()` and RTL async queries; only import `act` (from `react`) if necessary.
     - Replace direct state-changing calls with a single `await act(async () => { /* triggers */ })` when required.
     - Replace `getBy*` used immediately after async triggers with `await screen.findBy*` or `await waitFor(...)` (keep `getBy*` for synchronous elements).
     - Ensure no concurrent acts: sequentially `await act(...)` per iteration.

2) Fix non-unique text queries
   - Replace `getByText('Unknown')` with either:
     - `const nodes = screen.getAllByText('Unknown'); expect(nodes.length).toBe(/* expected count */)`; or
     - `within(someScopedContainer).getByText('Unknown')`; or
     - A role-based query if appropriate (e.g., `getByRole('link', { name: /unknown/i })`).

3) Align router testing utils to v7
   - If any tests import from 'react-router-dom' for routing helpers, update to:
     - `import { createMemoryRouter, RouterProvider } from 'react-router'` (or from 'react-router/testing' if using that entry).
   - Wrap components needing route context with a helper:
     ```tsx
     const router = createMemoryRouter([{ path: '/', element: <ComponentUnderTest /> }]);
     render(<RouterProvider router={router} />);
     ```

4) Render with app providers
   - Add a `renderWithProviders` helper that includes `QueryClientProvider` (retry: false) and optional memory router support.
   - Migrate tests that rely on app context to use the helper.

5) Re-run tests
   - docker-compose exec frontend npm run test:run
   - For E2E: docker-compose exec frontend npm run e2e

Notes:
- Do not change application logic. Only adjust tests (queries, act, and router wrappers).
- Keep any text-formatting expectation changes (e.g., On_hold vs On Hold) deferred for now.
```

Rollback:
- Revert test changes if behavior diverges from user-observable UI.

Success Criteria:
- No React 19 act warnings or overlapping act errors during unit tests.
- Router-dependent tests render with memory router without import errors.
- Remaining failures limited to explicitly deferred text assertions.

### Step 9 - Final Updates and Optimizations
Risk Level: LOW | Priority: LOW | Estimated Time: 2-3 hours

Goal: Complete remaining minor updates and optimize the updated stack.

Instructions for the AI Agent:
- Always apply Lean Programming Best Practices (above)
- Minor Frontend Updates (to latest stable):
  - Update `frontend/package.json`:
    - `"autoprefixer": "10.4.20"` -> `"autoprefixer": "10.4.21"`
    - `"postcss": "8.4.47"` -> `"postcss": "8.5.6"`
    - `"vitest": "2.1.4"` -> `"vitest": "3.2.4"` (MAJOR; review config and expect API changes)
    - ESLint: keep `"eslint": "9.35.0"` (current) or update to latest 9.x if available — avoid downgrades (Updated)
    - `"@vitejs/plugin-react"` already updated in Step 6
    - Optional: bump testing and Sentry libs to latest
      - `"@testing-library/jest-dom"` -> latest (e.g., `6.8.0`)
      - `"@testing-library/react"` -> latest (e.g., `16.3.0`)
      - `"@testing-library/user-event"` -> latest (e.g., `14.6.1`)
      - `"@playwright/test"` -> latest (e.g., `1.55.0`)
      - `"@sentry/react"` -> latest (e.g., `10.11.0`)
      - `"@sentry/vite-plugin"` -> latest (e.g., `4.3.0`)
      - `"openapi-typescript"` -> latest (e.g., `7.9.1`)
      - `"openapi-fetch"` -> latest (e.g., `0.14.0`)
      - `"@tanstack/react-query"` and devtools -> latest 5.x (e.g., `5.87.4`)
      - `"@tanstack/react-virtual"` -> latest 3.x (e.g., `3.13.12`)
      - ESLint plugins:
        - `eslint-plugin-react-hooks` -> latest (e.g., `5.2.0`)
        - `eslint-plugin-react-refresh` -> latest (e.g., `0.4.20`)
  - openapi-fetch import update (if bumped to 0.14.x):
    - Change in `frontend/src/api/client.ts`:
      - From: `import createClient from 'openapi-fetch'`
      - To:   `import { createClient } from 'openapi-fetch'`
    - Usage stays: `const rawClient = createClient<paths>({ baseUrl: API_BASE_URL })`
  - Optional: bump `jsdom` to latest (e.g., `27.0.0`) for best compatibility with Vitest 3
- Final Backend Updates:
  - Update `backend/requirements.txt`:
    - `drf-spectacular==0.27.2` -> `drf-spectacular==0.28.0`
- Configuration Optimization:
  - Update ESLint configuration for new version compatibility
  - Optimize Tailwind purge settings
  - Review and clean up any deprecated configuration
- Final Testing Protocol:
  - Run complete test suite: Frontend and Backend
  - Perform full application smoke test
  - Check all major user workflows
  - Verify performance hasn't degraded
  - Run security audit: `docker-compose exec frontend npm audit --audit-level=high` and fix remaining issues
- Documentation Updates:
  - Update README.md with new package versions
  - Document any configuration changes made
  - Update development setup instructions if needed
- Success Criteria:
  - All packages at latest versions
  - All tests passing
  - No security vulnerabilities
  - Application performance maintained or improved

Prompt for the AI Agent:
```
Goal: Finalize frontend tooling and optional library bumps.

Do:
1) Update frontend/package.json
   - postcss: 8.5.6
   - autoprefixer: 10.4.21
   - vitest: 3.2.4
   - Optional libs: @testing-library/*, @playwright/test, @sentry/*, openapi-typescript, openapi-fetch, @tanstack/*, jsdom
2) Apply openapi-fetch import change if bumped to 0.14.x
   - frontend/src/api/client.ts: `import { createClient } from 'openapi-fetch'`
3) Install + run
   - docker-compose exec frontend npm install
   - docker-compose exec frontend npm run build
   - docker-compose exec frontend npm run test:run
   - docker-compose exec frontend npm audit --audit-level=high
```

### Step 10 - Tailwind CSS v4 Migration (3.4.x -> 4.1.13)
Risk Level: HIGH | Priority: MEDIUM | Estimated Time: 1-2 days

Goal: Upgrade to Tailwind CSS v4 which includes a new config approach and design tokens.

Instructions for the AI Agent:
- Always apply Lean Programming Best Practices (above)
- Package Updates:
  - Update `frontend/package.json`:
    - `"tailwindcss": "^4.1.13"`
    - Keep `postcss` and `autoprefixer` at latest versions from Step 9
- Configuration Changes (MAJOR):
  - Replace `@tailwind base/components/utilities` in `frontend/src/index.css` with the new import:
    - `@import "tailwindcss";`
  - Introduce design tokens if needed using the new `@theme` CSS directive
  - Tailwind v4 reduces/changes the need for `content` in `tailwind.config.*`; review your `frontend/tailwind.config.js` and migrate customizations (colors, fonts) to v4 style or tokens. Remove deprecated options.
  - Verify dark mode strategy (`class`) still applies in v4; update if the setting moved
- Build Tooling:
  - Ensure Vite PostCSS pipeline loads Tailwind v4 without extra plugins (v4 bundles its own)
- Code Changes Required:
  - Review custom classes and any plugin usage; update incompatible utilities
  - Validate any `@apply` usage still compiles; adjust for renamed utilities if any
- Testing Protocol:
  - Run dev/build: `docker-compose exec frontend npm run dev` / `npm run build`
  - Visual QA key screens (Dashboard, Assignments grid, Settings)
  - Run E2E tests
- Rollback Plan:
  - Keep a branch with v3 config and CSS in case of regressions
- Success Criteria:
  - Visual parity (or approved adjustments) across pages
  - No CSS build errors
  - Bundle size remains acceptable

Prompt for the AI Agent:
```
Goal: Migrate Tailwind to v4 with new CSS entry and tokens.

Do:
1) Update frontend/package.json: tailwindcss: ^4.1.13
2) Update CSS entry
   - frontend/src/index.css: replace `@tailwind base; @tailwind components; @tailwind utilities;` with `@import "tailwindcss";`
3) Migrate config
   - Move colors/fonts to v4 approach (tokens via @theme)
   - Remove deprecated config fields (content scanning may change)
4) Install + build + QA
   - docker-compose exec frontend npm install
   - docker-compose exec frontend npm run build
   - Visual QA: Dashboard, Assignments grid, Settings
   - docker-compose exec frontend npm run e2e || true

Rollback:
- Revert CSS entry and config to v3 version.
```

---

## VALIDATION & TESTING PROTOCOLS

### Pre-Upgrade Checklist
- [ ] Full database backup created (manage.py `backup_database` or `make backup-db`)
- [ ] Git repository clean with all changes committed
- [ ] Development environment tested and working
- [ ] All existing tests passing
- [ ] Performance baseline established

### Post-Upgrade Validation (Run after each phase)
- [ ] All containers start successfully: `docker-compose up -d`
- [ ] Health check passes: `curl http://localhost:8000/api/health/`
- [ ] Frontend loads without errors: `curl http://localhost:3000/`
- [ ] Database migrations successful
- [ ] Admin interface accessible: `http://localhost:8000/admin`
- [ ] API endpoints functional
- [ ] Authentication working correctly
- [ ] All major user workflows tested
- [ ] No console errors or warnings
- [ ] Performance within acceptable range

### Critical User Workflows to Test
1. Authentication Flow
   - Login/logout functionality
   - JWT token refresh
   - Permission checking

2. Core CRUD Operations
   - Create/edit/delete people
   - Create/edit/delete projects
   - Create/edit/delete assignments

3. Assignment Grid Functionality
   - Load assignment grid
   - Edit hours inline
   - Filter by status/department
   - Export functionality

4. Performance Critical Features
   - Large dataset handling (100+ people)
   - Dashboard loading
   - Real-time updates

### Rollback Procedures
Each step includes specific rollback instructions, but general process:
1. Stop containers: `docker-compose down`
2. Revert package files (package.json, requirements.txt)
3. Restore database backup if needed
4. Rebuild containers: `docker-compose build`
5. Restart services: `docker-compose up -d`
6. Verify functionality restored

---

## RISK MITIGATION STRATEGIES

### High-Risk Upgrades (React 19, React Router v7)
- Staged Rollout: Test in development -> staging -> production
- Feature Flags: Use feature toggles for new functionality
- Parallel Versions: Consider running old/new versions side-by-side temporarily
- Extended Testing: Allow 2-3 days for comprehensive testing

### Database Migration Safety
- Always backup before Django upgrades
- Test migrations on copy of production data
- Reversible migrations: Ensure all migrations can be safely reversed
- Monitor performance of migration on large datasets

### Container and Deployment
- Layer caching: Structure Docker builds to maximize cache reuse
- Health checks: Ensure all services have proper health check endpoints
- Zero-downtime: Plan deployment strategy to minimize downtime
- Resource monitoring: Watch memory/CPU usage during upgrades

---

## SUCCESS METRICS

### Performance Targets (Post-Upgrade)
- Frontend Load Time: <= 3 seconds (React 19 should improve this)
- API Response Time: <= 200ms for CRUD operations
- Build Time: <= 30 seconds (Vite 6 should improve this)
- Bundle Size: No significant increase (monitor with analyzer)

### Security Targets
- Zero Critical/High vulnerabilities in `npm audit`
- All packages within 1 major version of latest
- Security headers properly configured
- Dependencies with active maintenance

### Compatibility Targets
- Browser Support: Modern browsers (Chrome/Firefox/Safari/Edge latest)
- Node.js: 20+
- Python: 3.10+ (Django 5.2 requirement)
- PostgreSQL: 14+ (Django 5.2 requirement)

---

## FINAL NOTES

1. Prioritize Security: Steps 1-3 should be completed immediately due to security vulnerabilities
2. Test Thoroughly: Each upgrade builds on the previous ones - a failure in Step 8 shouldn't require redoing Steps 1-7
3. Document Everything: Keep detailed notes of any custom changes needed for future upgrades
4. Monitor Performance: Watch for regressions throughout the process
5. Team Communication: Ensure all team members are aware of upgrade timeline and potential impacts
6. Backup Strategy: Maintain ability to rollback to any previous step

This upgrade path will modernize your stack while minimizing risk through careful planning and testing. The phased approach allows for early wins (security fixes) while building toward the more complex upgrades (React Router v7).
