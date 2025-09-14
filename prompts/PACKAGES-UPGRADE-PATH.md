# Package Upgrade Path - Workload Tracker

## Executive Summary
This document outlines a comprehensive, step-by-step approach to upgrading all outdated packages in the Workload Tracker application. The upgrade path is organized by severity, with detailed prompts for AI agents to execute each upgrade safely.

**Current Risk Level**: HIGH (Multiple security vulnerabilities and performance issues)
**Target State**: Latest stable versions of all packages
**Estimated Timeline**: 3-4 weeks (phased approach)
**Development Effort**: 15-20 days total

## Lean Programming Best Practices (Apply to Every Step)
- Always create a backup before starting any upgrade
- Test each upgrade in isolation before moving to the next
- Maintain backward compatibility where possible
- Document all breaking changes and their fixes
- Use semantic versioning principles
- Run full test suite after each upgrade
- Update Docker images and rebuild containers after package changes

---

## PHASE 1: CRITICAL SECURITY UPDATES (Week 1)

### Step 1 - Django Security Update (5.0.14 → 5.2.6)
**Risk Level**: CRITICAL | **Priority**: IMMEDIATE | **Estimated Time**: 4-6 hours

Goal: Upgrade Django to latest LTS version to patch security vulnerabilities and gain performance improvements.

Instructions for the AI Agent:
- Always apply Lean Programming Best Practices (above)
- **Pre-Upgrade Analysis**:
  - Check current Django version: `docker-compose exec backend python -c "import django; print(django.get_version())"`
  - Document current settings configuration
  - Backup database: `docker-compose exec backend python manage.py dumpdata > backup_pre_django_upgrade.json`
- **Backend Upgrade**:
  - Update `backend/requirements.txt`: Change `Django==5.0.14` to `Django==5.2.6`
  - Rebuild backend container: `docker-compose build backend`
  - Run migrations: `docker-compose exec backend python manage.py migrate`
  - Check for deprecated settings warnings: `docker-compose exec backend python manage.py check`
- **Settings Updates** (Based on Django 5.0→5.2 changes):
  - Update `backend/config/settings.py`:
    - Ensure `DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'` is set
    - Update database connection settings for PostgreSQL 14+ compatibility
    - Add `STORAGES` setting if using custom file storage (replaces deprecated `DEFAULT_FILE_STORAGE`)
  - If using PostgreSQL, verify version compatibility (requires PostgreSQL 14+)
- **Code Changes Required**:
  - Replace any usage of `django.utils.timezone.utc` with `datetime.timezone.utc`
  - Update any custom storage backends to use new `STORAGES` setting
  - Fix any deprecated `force_text()` calls to use `force_str()`
- **Testing Protocol**:
  - Verify admin interface loads: `http://localhost:8000/admin`
  - Test API endpoints: `curl http://localhost:8000/api/health/`
  - Run Django test suite: `docker-compose exec backend python manage.py test`
  - Verify database queries work correctly
  - Check for any console warnings or deprecation messages
- **Rollback Plan**:
  - Revert `requirements.txt` to `Django==5.0.14`
  - Restore database from backup if needed
- **Success Criteria**:
  - All tests passing
  - No deprecation warnings
  - Admin and API endpoints functional
  - Database migrations successful

### Step 2 - Django REST Framework Update (3.14.0 → 3.15.2)
**Risk Level**: MEDIUM | **Priority**: HIGH | **Estimated Time**: 2-3 hours

Goal: Update DRF to latest version for security patches and Django 5.2 compatibility.

Instructions for the AI Agent:
- Always apply Lean Programming Best Practices (above)
- **Pre-Upgrade Analysis**:
  - Check current DRF version: `docker-compose exec backend python -c "import rest_framework; print(rest_framework.__version__)"`
  - Document current DRF settings and custom serializers
- **Backend Upgrade**:
  - Update `backend/requirements.txt`: Change `djangorestframework==3.14.0` to `djangorestframework==3.15.2`
  - Rebuild backend container: `docker-compose build backend`
- **Code Changes Required**:
  - Review and update any custom permission classes for new Django 5.2 compatibility
  - Check pagination classes for any deprecated methods
  - Verify JWT token handling with `djangorestframework-simplejwt==5.3.1` compatibility
- **Settings Updates**:
  - Review `REST_FRAMEWORK` settings in `backend/config/settings.py`
  - Ensure all authentication classes are compatible
  - Verify CORS settings work with new version
- **Testing Protocol**:
  - Test API authentication: Login via `/api/auth/login/`
  - Verify API pagination works correctly
  - Test all CRUD operations on main models (People, Projects, Assignments)
  - Check API schema generation: `docker-compose exec backend python manage.py spectacular --file openapi_test.json`
  - Run full API test suite: `docker-compose exec backend python manage.py test`
- **Success Criteria**:
  - All API endpoints functional
  - Authentication working correctly
  - No breaking changes in serializers
  - OpenAPI schema generates without errors

### Step 3 - Security Package Updates
**Risk Level**: HIGH | **Priority**: HIGH | **Estimated Time**: 1-2 hours

Goal: Update security-critical packages with known vulnerabilities.

Instructions for the AI Agent:
- Always apply Lean Programming Best Practices (above)
- **Backend Security Updates**:
  - Update `backend/requirements.txt`:
    - `openpyxl==3.1.2` → `openpyxl==3.1.5` (CVE-2024-41962 fix)
    - `sentry-sdk[django]==2.37.0` → `sentry-sdk[django]==2.40.0`
    - `psycopg2-binary==2.9.9` → `psycopg2-binary==2.9.10`
- **Frontend Security Updates**:
  - Run security audit: `docker-compose exec frontend npm audit`
  - Fix high/critical vulnerabilities: `docker-compose exec frontend npm audit fix`
  - Update package.json type definitions:
    - `@types/react==18.3.12` → `@types/react==19.1.13`
    - `@types/react-dom==18.3.1` → `@types/react-dom==19.1.9`
- **Testing Protocol**:
  - Verify Excel import/export functionality works with new openpyxl
  - Test Sentry error reporting integration
  - Check database connections with new psycopg2
  - Run security scan: `docker-compose exec frontend npm audit --audit-level=high`
- **Success Criteria**:
  - No high/critical security vulnerabilities
  - All core functionality working
  - Sentry integration functional

---

## PHASE 2: MAJOR FRAMEWORK UPGRADES (Week 2-3)

### Step 4 - React 18 to React 19 Upgrade
**Risk Level**: HIGH | **Priority**: CRITICAL | **Estimated Time**: 1-2 days

Goal: Upgrade to React 19 for performance improvements and modern features.

Instructions for the AI Agent:
- Always apply Lean Programming Best Practices (above)
- **Pre-Upgrade Preparation**:
  - First upgrade to React 18.3 as intermediate step
  - Update `frontend/package.json`:
    - `"react": "18.3.1"` → `"react": "18.3.0"` (temporary)
    - `"react-dom": "18.3.1"` → `"react-dom": "18.3.0"` (temporary)
  - Install and run: `docker-compose exec frontend npm install`
  - Test for deprecation warnings in browser console
- **Main React 19 Upgrade**:
  - Update `frontend/package.json`:
    - `"react": "18.3.0"` → `"react": "19.1.1"`
    - `"react-dom": "18.3.0"` → `"react-dom": "19.1.1"`
    - `"@types/react": "19.1.13"` (already updated in Phase 1)
    - `"@types/react-dom": "19.1.9"` (already updated in Phase 1)
- **Code Changes Required**:
  - Replace any `ReactDOM.render()` calls with `ReactDOM.createRoot()`:
    ```typescript
    // OLD (if any exist)
    ReactDOM.render(<App />, document.getElementById('root'));

    // NEW
    const root = ReactDOM.createRoot(document.getElementById('root')!);
    root.render(<App />);
    ```
  - Remove any PropTypes usage (deprecated in React 19)
  - Update test files to import `act` from `react` instead of `react-dom/test-utils`
  - Check for any legacy Context API usage and migrate to modern Context
- **Testing Protocol**:
  - Run all unit tests: `docker-compose exec frontend npm run test:run`
  - Run E2E tests: `docker-compose exec frontend npm run e2e`
  - Test all major user workflows manually
  - Check browser console for React warnings
  - Verify performance with React DevTools Profiler
- **Performance Validation**:
  - Measure page load times before/after upgrade
  - Check render performance on large datasets (assignments grid)
  - Verify memory usage hasn't increased significantly
- **Rollback Plan**:
  - Revert package.json changes
  - Rebuild frontend container
  - Test basic functionality
- **Success Criteria**:
  - All tests passing
  - No React warnings in console
  - Application performs better or equal to React 18
  - All components render correctly

### Step 5 - TypeScript Update (5.6.3 → 5.9.2)
**Risk Level**: LOW | **Priority**: MEDIUM | **Estimated Time**: 2-4 hours

Goal: Update TypeScript for better type checking and modern language features.

Instructions for the AI Agent:
- Always apply Lean Programming Best Practices (above)
- **Frontend Upgrade**:
  - Update `frontend/package.json`: `"typescript": "5.6.3"` → `"typescript": "5.9.2"`
  - Rebuild container: `docker-compose build frontend`
- **Type Checking**:
  - Run type check: `docker-compose exec frontend npx tsc --noEmit`
  - Fix any new TypeScript errors that surface with stricter checking
  - Update any deprecated type usage
- **Code Changes Required**:
  - Review and fix any new strict null checks
  - Update import/export statements if needed
  - Fix any enum-related breaking changes
- **Testing Protocol**:
  - Build project: `docker-compose exec frontend npm run build`
  - Verify no TypeScript compilation errors
  - Test type safety in IDE (VSCode)
  - Run linting: `docker-compose exec frontend npm run lint`
- **Success Criteria**:
  - Clean TypeScript compilation
  - No regression in type safety
  - Build process works correctly

---

## PHASE 3: BUILD TOOLING UPGRADES (Week 3-4)

### Step 6 - Vite Update (5.4.19 → 6.3.2)
**Risk Level**: MEDIUM | **Priority**: MEDIUM | **Estimated Time**: 4-6 hours

Goal: Upgrade Vite for faster build times and modern ESM support.

Instructions for the AI Agent:
- Always apply Lean Programming Best Practices (above)
- **Pre-Upgrade Analysis**:
  - Document current Vite configuration in `frontend/vite.config.ts`
  - Check plugin compatibility with Vite 6
- **Frontend Upgrade**:
  - Update `frontend/package.json`:
    - `"vite": "5.4.19"` → `"vite": "6.3.2"`
    - `"@vitejs/plugin-react": "4.3.3"` → `"@vitejs/plugin-react": "5.0.0"`
- **Configuration Updates** (Check `frontend/vite.config.ts`):
  - Update plugin syntax if needed for Vite 6
  - Check build target compatibility
  - Verify proxy configuration syntax
  - Update any deprecated Vite options
- **Plugin Compatibility**:
  - Update Sentry Vite plugin if incompatible: `"@sentry/vite-plugin": "4.2.0"` → latest version
  - Check rollup-plugin-visualizer compatibility
- **Code Changes Required**:
  - Review and update any Vite-specific imports
  - Check environment variable usage (import.meta.env)
  - Update any dynamic imports if syntax changed
- **Testing Protocol**:
  - Test development server: `docker-compose exec frontend npm run dev`
  - Test build process: `docker-compose exec frontend npm run build`
  - Verify hot module replacement works
  - Check bundle analysis: `docker-compose exec frontend npm run build:analyze`
  - Measure build times before/after upgrade
- **Performance Validation**:
  - Compare development server startup time
  - Measure production build time
  - Verify bundle size hasn't increased significantly
- **Success Criteria**:
  - Faster build times than Vite 5
  - Development server works correctly
  - Hot module replacement functional
  - Production build succeeds

### Step 7 - Backend Ecosystem Updates
**Risk Level**: MEDIUM | **Priority**: MEDIUM | **Estimated Time**: 3-4 hours

Goal: Update backend dependencies for security and performance improvements.

Instructions for the AI Agent:
- Always apply Lean Programming Best Practices (above)
- **Backend Updates**:
  - Update `backend/requirements.txt`:
    - `celery[redis]==5.4.0` → `celery[redis]==5.5.0`
    - `redis==5.0.1` → `redis==5.2.0`
    - `gunicorn==21.2.0` → `gunicorn==23.0.0`
    - `django-silk==5.2.0` → `django-silk==5.3.0`
    - `django-axes==6.5.0` → `django-axes==6.7.0`
- **Configuration Updates**:
  - Check Celery configuration for any deprecated settings in `backend/config/celery.py`
  - Verify Redis connection settings in `backend/config/settings.py`
  - Update Gunicorn configuration if needed
- **Code Changes Required**:
  - Review Celery task decorators for any syntax changes
  - Check Redis connection handling
  - Update any Gunicorn-specific deployment scripts
- **Testing Protocol**:
  - Test Celery worker: `docker-compose exec worker celery -A config worker --loglevel=info`
  - Verify Redis connection: `docker-compose exec backend python -c "import redis; r=redis.Redis(); print(r.ping())"`
  - Test background job processing
  - Check Django Silk profiling interface
  - Verify Django Axes login protection
- **Success Criteria**:
  - All background jobs working
  - Redis connectivity maintained
  - Performance monitoring functional
  - Security features operational

---

## PHASE 4: ADVANCED UPGRADES (Week 4-5)

### Step 8 - React Router DOM Update (6.28.0 → 7.9.1)
**Risk Level**: HIGH | **Priority**: MEDIUM | **Estimated Time**: 1-2 days

Goal: Upgrade React Router for improved type safety and modern routing patterns.

⚠️ **WARNING**: This upgrade involves significant breaking changes and should be done last.

Instructions for the AI Agent:
- Always apply Lean Programming Best Practices (above)
- **Pre-Upgrade Preparation**:
  - Enable React Router v6 future flags first in `frontend/src/main.tsx`:
    ```typescript
    const router = createBrowserRouter(
      createRoutesFromElements(routes),
      {
        future: {
          v7_startTransition: true,
        }
      }
    );
    ```
  - Test application with future flags enabled
- **Package Updates**:
  - **IMPORTANT**: React Router v7 consolidates packages
  - Remove old package: `docker-compose exec frontend npm uninstall react-router-dom`
  - Install new package: Update `frontend/package.json`:
    - Remove `"react-router-dom": "6.28.0"`
    - Add `"react-router": "7.9.1"`
- **Code Changes Required** (BREAKING CHANGES):
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
- **File Updates Required**:
  - `frontend/src/main.tsx` - Update routing setup
  - `frontend/src/App.tsx` - Remove BrowserRouter wrapper
  - All component files importing from react-router-dom
  - Navigation components (likely in `frontend/src/components/layout/`)
- **Testing Protocol**:
  - Test all navigation paths manually
  - Verify nested routing works correctly
  - Check browser back/forward buttons
  - Test programmatic navigation
  - Run E2E tests: `docker-compose exec frontend npm run e2e`
  - Verify URL parameters and query strings work
- **Rollback Plan** (Complex due to breaking changes):
  - Keep a full backup of all routing-related files
  - Document all import changes made
  - Be prepared for potential 1-day rollback effort
- **Success Criteria**:
  - All routes navigable
  - No routing-related console errors
  - Browser navigation works correctly
  - All tests passing

### Step 9 - Final Updates and Optimizations
**Risk Level**: LOW | **Priority**: LOW | **Estimated Time**: 2-3 hours

Goal: Complete remaining minor updates and optimize the updated stack.

Instructions for the AI Agent:
- Always apply Lean Programming Best Practices (above)
- **Minor Frontend Updates**:
  - Update `frontend/package.json`:
    - `"tailwindcss": "3.4.13"` → `"tailwindcss": "3.4.15"`
    - `"autoprefixer": "10.4.20"` → `"autoprefixer": "10.4.22"`
    - `"postcss": "8.4.47"` → `"postcss": "8.4.49"`
    - `"eslint": "9.35.0"` → `"eslint": "9.14.0"`
    - `"vitest": "2.1.4"` → `"vitest": "2.2.0"`
- **Final Backend Updates**:
  - Update `backend/requirements.txt`:
    - `drf-spectacular==0.27.2` → `drf-spectacular==0.28.0`
- **Configuration Optimization**:
  - Update ESLint configuration for new version compatibility
  - Optimize Tailwind purge settings
  - Review and clean up any deprecated configuration
- **Final Testing Protocol**:
  - Run complete test suite: Frontend and Backend
  - Perform full application smoke test
  - Check all major user workflows
  - Verify performance hasn't degraded
  - Run security audit: `npm audit` and check for vulnerabilities
- **Documentation Updates**:
  - Update README.md with new package versions
  - Document any configuration changes made
  - Update development setup instructions if needed
- **Success Criteria**:
  - All packages at latest versions
  - All tests passing
  - No security vulnerabilities
  - Application performance maintained or improved

---

## VALIDATION & TESTING PROTOCOLS

### Pre-Upgrade Checklist
- [ ] Full database backup created
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
1. **Authentication Flow**
   - Login/logout functionality
   - JWT token refresh
   - Permission checking

2. **Core CRUD Operations**
   - Create/edit/delete people
   - Create/edit/delete projects
   - Create/edit/delete assignments

3. **Assignment Grid Functionality**
   - Load assignment grid
   - Edit hours inline
   - Filter by status/department
   - Export functionality

4. **Performance Critical Features**
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
- **Staged Rollout**: Test in development → staging → production
- **Feature Flags**: Use feature toggles for new functionality
- **Parallel Versions**: Consider running old/new versions side-by-side temporarily
- **Extended Testing**: Allow 2-3 days for comprehensive testing

### Database Migration Safety
- **Always backup** before Django upgrades
- **Test migrations** on copy of production data
- **Reversible migrations**: Ensure all migrations can be safely reversed
- **Monitor performance** of migration on large datasets

### Container and Deployment
- **Layer caching**: Structure Docker builds to maximize cache reuse
- **Health checks**: Ensure all services have proper health check endpoints
- **Zero-downtime**: Plan deployment strategy to minimize downtime
- **Resource monitoring**: Watch memory/CPU usage during upgrades

---

## SUCCESS METRICS

### Performance Targets (Post-Upgrade)
- **Frontend Load Time**: ≤ 3 seconds (React 19 should improve this)
- **API Response Time**: ≤ 200ms for CRUD operations
- **Build Time**: ≤ 30 seconds (Vite 6 should improve this)
- **Bundle Size**: No significant increase (monitor with analyzer)

### Security Targets
- **Zero Critical/High** vulnerabilities in `npm audit`
- **All packages** within 1 major version of latest
- **Security headers** properly configured
- **Dependencies** with active maintenance

### Compatibility Targets
- **Browser Support**: Modern browsers (Chrome/Firefox/Safari/Edge latest)
- **Node.js**: 20+ (already in requirements)
- **Python**: 3.10+ (Django 5.2 requirement)
- **PostgreSQL**: 14+ (Django 5.2 requirement)

---

## FINAL NOTES

1. **Prioritize Security**: Steps 1-3 should be completed immediately due to security vulnerabilities

2. **Test Thoroughly**: Each upgrade builds on the previous ones - a failure in Step 8 shouldn't require redoing Steps 1-7

3. **Document Everything**: Keep detailed notes of any custom changes needed for future upgrades

4. **Monitor Performance**: Watch for regressions throughout the process

5. **Team Communication**: Ensure all team members are aware of upgrade timeline and potential impacts

6. **Backup Strategy**: Maintain ability to rollback to any previous step

This upgrade path will modernize your stack while minimizing risk through careful planning and testing. The phased approach allows for early wins (security fixes) while building toward the more complex upgrades (React Router v7).