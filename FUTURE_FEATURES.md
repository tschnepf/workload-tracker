# Future Features & Enhancements

This document tracks planned features and improvements for the Workload Tracker application.

### Sunday-only Week Keys Transition Completion

Goal: Fully standardize on Sunday-based week keys across backend, frontend, data, and docs; remove all Monday-based logic and fallbacks.

Implementation Steps:
1. Frontend alignment
   - Update `frontend/src/pages/Assignments/grid/utils.ts` to consume Sunday week keys and generate headers accordingly.
   - Remove any Monday-based assumptions in components, hooks, and tests; adjust fixtures to Sunday keys.
2. Backend alignment
   - Enforce Sunday-only keys in `weekly_hours` with a validator; add warnings during a short deprecation window.
   - Replace any Monday-based help text/docs in serializers (e.g., people) with Sunday wording.
3. Data migration
   - Implement a management command to re-key `weekly_hours` JSON from non-Sunday dates to the Sunday of the same week (idempotent; dry-run + report modes).
   - Run in staging; verify parity metrics; then run in production during a low-traffic window (with backups).
4. Transition removal
   - Disable the “read-both (±3 days)” transition layer and remove fallback code paths.
   - Delete transitional tests; add Sunday-only tests for utilization and grid rendering.
5. Documentation and help
   - Update in-app help and README/docs to state Sunday-as-canonical.
   - Add a troubleshooting note for legacy exports/imports referencing Monday.
6. Acceptance criteria
   - No remaining references to Monday-based week starts in code/docs.
   - All `weekly_hours` keys validate as Sundays.
   - Frontend grid renders correct headers and values using Sunday keys.
   - Parity report shows expected utilization totals pre/post migration.
7. Rollback plan
   - Feature flag to re-enable transition read mode if regressions are detected.
   - Re-run migration in reverse (if necessary) using snapshot/backup restore process.

## 🚨 High Priority - Performance & Scalability

### 1. Bulk API Pagination Safeguards

**Problem**: Current bulk APIs (`?all=true`) have no size limits, which could cause memory/performance issues as datasets grow.

**Current Status**: 
- Dataset size: ~500 total records across all APIs
- Risk level: Low (safe for current scale)
- No size limits implemented

**Implementation Steps**:

#### Phase 1: Add Size Limits
1. **Backend Changes**:
   ```python
   # Add to each bulk endpoint in views.py
   if request.query_params.get('all') == 'true':
       count = queryset.count()
       if count > BULK_API_LIMIT:  # e.g., 1000
           return Response({
               'error': 'Dataset too large for bulk operation',
               'count': count,
               'max_bulk_size': BULK_API_LIMIT,
               'suggestion': 'Use pagination instead'
           }, status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
   ```

2. **Configuration**:
   ```python
   # Add to settings.py
   BULK_API_LIMITS = {
       'people': 1000,
       'projects': 1000, 
       'assignments': 2000,  # Higher limit - grows exponentially
       'deliverables': 1500,
       'departments': 100,
   }
   ```

#### Phase 2: Frontend Fallback Handling
3. **Update Frontend APIs**:
   ```typescript
   // Update each listAll() method in api.ts
   listAll: async (): Promise<Project[]> => {
     try {
       return await fetchApi<Project[]>('/projects/?all=true');
     } catch (error) {
       if (error.status === 413) {
         // Fallback to pagination
         console.warn('Dataset too large, falling back to pagination');
         return await this.loadAllWithPagination();
       }
       throw error;
     }
   }
   ```

4. **Add Pagination Fallback**:
   ```typescript
   private async loadAllWithPagination(): Promise<Project[]> {
     const allItems: Project[] = [];
     let page = 1;
     let hasMore = true;

     while (hasMore) {
       const response = await this.list({ page, page_size: 500 });
       allItems.push(...(response.results || []));
       hasMore = !!response.next;
       page++;
     }
     return allItems;
   }
   ```

#### Phase 3: Performance Monitoring
5. **Add Monitoring**:
   - Response time tracking for bulk endpoints
   - Memory usage alerts
   - Dataset growth monitoring
  - Automated alerts when approaching limits

6. **Database Optimization**:
  - Add database indexes for frequently queried fields
  - Implement query optimization for large datasets
  - Consider database-level pagination improvements

## 🧹 Cleanup — Remove Slack Notifications (dead code)

Context
- The codebase contains an optional Slack webhook helper (`backend/core/notifications.py`) referenced by a few management commands, but Slack is not part of the target stack and is not planned for adoption.

Goal
- Remove Slack notification code and references to reduce maintenance surface and avoid confusion.

Scope & Steps
1. Delete helper and imports
   - Remove `backend/core/notifications.py` and any imports of `notify_slack` in:
     - `backend/core/management/commands/cleanup_backups.py`
     - `backend/core/management/commands/sync_backups.py`
     - `backend/core/management/commands/restore_latest_safety.py`
   - Replace with no-op comments or standard logging where appropriate.
2. Environment docs
   - Remove `SLACK_WEBHOOK_URL` from `.env.example` and any docs.
3. Tests
   - Remove Slack webhook validation tests (if present) and adjust any command tests that assumed Slack calls.
4. Security plan alignment
   - Remove or mark Phase 15 (Slack webhook handling) as “not applicable”.

Acceptance Criteria
- No references to Slack or `SLACK_WEBHOOK_URL` remain in code or docs.
- Test suite passes without Slack-related tests.
- Commands previously importing Slack still run without behavioral changes (use logging when needed).

## 👤 Self‑Service Edits (Object‑Level Writes for Regular Users)

Context
- Today, regular users are deny‑by‑default for writes; Admins/Managers perform edits. We added object‑level checks mainly to prevent cross‑object writes.

Goal
- Allow regular (non‑manager) users to edit only their own linked Person record and their own Assignments while preserving RBAC for everything else.

Scope & Steps
1. Permissions logic
   - Update `backend/accounts/permissions.py:RoleBasedAccessPermission.has_object_permission` to return True for:
     - `people.person` when `obj.id == request.user.profile.person_id`.
     - `assignments.assignment` when `obj.person_id == request.user.profile.person_id`.
   - Keep Admins/Managers allowed for all relevant writes; other models remain manager/admin‑only.
2. Tests
   - Add tests asserting regular users can PATCH their own Person and their own Assignments; still 403 for others.
   - Keep existing deny/403 tests for cross‑object edits.
3. API docs / UI
   - Document allowed self‑edits (which fields are user‑editable) and leave sensitive fields admin‑only.
   - UI: enable inline editing for the user’s own profile fields and assignment notes/hours as applicable.
4. Audit & rate limiting
   - Ensure changes still flow through existing throttles; add AdminAuditLog entries where appropriate.

Acceptance Criteria
- Regular users can successfully edit their own Person and their own Assignments; 403 on others.
- Admin/Manager behavior unchanged.
- Tests cover permit/deny matrix; docs updated.

## 🔐 Database TLS (Single‑Host: Defer + Staged Rollout)

Context
- Current deployment runs DB, backend, and frontend on the same machine and private Docker network. Over‑the‑wire exposure is minimal, so TLS is not strictly required for baseline security in this topology.
- Prior bad experience with self‑signed certs causing outages (trust/permissions/restart issues).

Decision
- Defer DB TLS for now as an accepted risk in single‑host deployments. Plan a staged rollout to avoid surprises when/if we need it (multi‑host, remote admin, or compliance).

Triggers to Revisit
- Move to multi‑host or managed DB.
- Compliance mandates “encryption in transit”.
- Remote admin tools connect to DB from outside the host.

Staged Rollout (Low‑Risk)
1. Enable SSL on Postgres
   - Place server.crt/server.key in data dir with correct ownership/permissions.
   - Set `ssl = on` in postgresql.conf; restart Postgres; confirm it comes up clean.
2. Verify on DB
   - `psql -c "SHOW ssl;"` should return `on`.
3. App side change
   - Update `DATABASE_URL` to include `?sslmode=require` (encrypts without strict CA verification to avoid self‑signed trust errors).
   - Verify backend starts and queries/migrations succeed.
4. Rollback plan
   - If errors occur, remove `sslmode=require` and set `ssl=off`; restart Postgres; restore previous state.

Acceptance Criteria
- Postgres runs with SSL=on; app connects successfully with `sslmode=require`.
- No unexpected downtime during maintenance window; clear rollback path tested.
- Documentation updated (PRODUCTION.md) with steps and validation.

**Estimated Timeline**: 1-2 days
**Trigger Point**: When any API dataset exceeds 1,000 records

### 2. One‑Trip Deliverables Fetch (Audit + Refactor)

Problem
- Multiple screens fetch deliverables more than once for the same view (e.g., "next" and "last" in separate calls; or N× per project). This increases latency and server load.

Goal
- Standardize a single-request pattern per view: prefer the calendar API for the visible window; otherwise call one bulk endpoint (`bulkList(projectIds)`); if still needed, fall back to one `listAll()` and filter client-side by project/date.

Scope/Targets to Audit
- Projects list (done): next/prev derived from one bulk fetch.
- Assignments grid (done): calendar → bulkList → single listAll fallback; removed per‑project loops.
- Personal calendar widget, Deliverables calendar page, quick‑actions (milestone review), and any other views that double‑call or loop per project.

Refactor Checklist
- Replace double-calls with one bulk call and compute both "next" and "last" locally.
- Avoid per‑project `listAll(pid)` loops; use a single `listAll()` filtered client‑side when needed.
- Centralize date parsing and selection helpers (e.g., `pickNextUpcoming`, `pickMostRecent`).

Testing
- Add unit tests for next/prev pickers (date boundaries, timezone, "today" handling).
- Add tests for the fallback chain (calendar unavailable → bulkList → listAll) to ensure identical UI outcomes.

Telemetry
- Track request counts and load times before/after to validate improvements.

Rollout
- Optional feature flag; stage and compare metrics, then remove legacy paths.

---

## 📋 Medium Priority - User Experience

### 2. Advanced Filtering & Search
- **Description**: Add advanced filtering options to all list views (date ranges, multiple selections, saved filters)
- **Components**: People, Projects, Assignments, Deliverables lists
- **Estimated Timeline**: 3-5 days

### 3. Bulk Operations
- **Description**: Add bulk edit, delete, and status update capabilities
- **Features**: Select multiple items, batch operations, progress indicators
- **Estimated Timeline**: 2-3 days

### 4. Data Export/Import Enhancements
- **Description**: Expand current Excel import/export with more formats and options
- **Features**: CSV, PDF reports, scheduled exports, import validation
- **Estimated Timeline**: 2-4 days

### 5. Virtualized Lists Across App (People/Projects)
- **Description**: Use lightweight list virtualization (render only visible rows + small buffer) for large lists while keeping paginated fetching for network efficiency.
- **Current**: PeopleList now has a clean, isolated virtualized table component; Projects uses infinite pagination with “Load more”.
- **Plan**:
  - Extract Projects left-panel rows into a `ProjectsListTable` component.
  - Enable virtualization when `items.length > 200`; otherwise map normally.
  - Keep existing infinite query and “Load more” for network payload control.
- **Benefits**:
  - Smooth scrolling and lower memory/DOM size even after many pages are loaded.
  - Clear separation of concerns: page orchestration vs. table rendering.
  - Easier maintenance and reuse of row markup.
- **Trade‑offs**:
  - Virtualization complements but does not replace pagination.
  - Requires a reasonable row height estimate (tuneable; use 44px baseline).
- **Acceptance**:
  - Scrolling remains smooth with 1,000+ items loaded.
  - No visual/interaction regressions vs. current rows.
  - TS build passes; container build green.
- **Estimated Timeline**: 0.5–1 day (Projects parity)

### 5. Real-time Notifications
- **Description**: Add real-time notifications for assignment changes, conflicts, deadlines
- **Technology**: WebSockets or Server-Sent Events
- **Estimated Timeline**: 3-4 days

### Help & Documentation Hub (/help)
- **Scope**: Provide an in-app documentation hub at `/help` with accessible structure, quick navigation, and contextual entry points from across the app.
- **Intended Content**:
  - Quick Start: signing in, linking a person, basic navigation
  - Keyboard Shortcuts: list and how to enable reduced motion
  - People & Departments: filters, include-children hierarchy, autocomplete
  - Projects: status, client, deliverables overview, filter metadata
  - Assignments: grid vs list, conflict checks, weekly hours semantics
  - Reports & Forecasts: capacity heatmap, team forecast
  - Settings & Roles: admin vs manager vs user capabilities
  - Exports/Imports: formats, limits, troubleshooting
  - FAQ & Troubleshooting: common errors and friendly resolutions
- **Related Future UX**:
  - Searchable docs with typeahead (client-side index; highlight matches)
  - Contextual help: deep-link anchors from UI “?” icons to relevant sections
  - Copy-to-clipboard for example queries and shortcuts cheat-sheet
  - Link to API schema once available (Phase 10 OpenAPI)
- **Dependencies**:
  - Router route exists; Coming Soon page implemented (Phase 1.1)
  - Choose content delivery: MDX static pages in frontend or curated markdown compiled at build
  - Optional: surface API schema links after Phase 10.1 (`/schema/`, Swagger UI)
- **Milestones**:
  - M0 (done): `/help` route renders Coming Soon
  - M1: Static Help landing page with sections + anchor links
  - M2: Client-side search + table of contents
  - M3: Contextual links from major screens (e.g., People filters → /help#filters)
  - M4: Tips/Shortcuts overlay and accessibility notes
  - M5: Feedback link (mailto or form) and basic analytics on help usage
 - **Estimated Timeline**: 2–4 days for M1–M2; additional 2–3 days for M3–M5

---

## 📊 Medium Priority - Analytics & Reporting

### 6. Advanced Dashboard Analytics
- **Description**: Expand dashboard with more detailed analytics and visualizations
- **Features**: Trend charts, utilization heatmaps, project timeline views
- **Estimated Timeline**: 4-6 days

### 7. Custom Reporting System
- **Description**: Allow users to create custom reports with flexible parameters
- **Features**: Report builder, scheduled reports, export options
- **Estimated Timeline**: 5-7 days

### 8. Capacity Planning Tools
- **Description**: Add tools for future capacity planning and resource forecasting
- **Features**: Demand forecasting, scenario planning, resource recommendations
- **Estimated Timeline**: 6-8 days

---

## 🔧 Low Priority - Technical Improvements

### 9. API Rate Limiting Enhancements
- **Description**: Implement more sophisticated rate limiting based on user roles and endpoint types
- **Current**: Basic throttling on hot endpoints only
- **Estimated Timeline**: 1-2 days

### 10. Caching Layer Improvements
- **Description**: Add Redis caching for frequently accessed data
- **Benefits**: Improved response times, reduced database load
- **Estimated Timeline**: 2-3 days

#### 10.1 Dockerized Redis Container (Staging/Prod Simulation)
- Intent: simulate deployment with a standalone Redis service while keeping dev on LocMem by default.
- Compose changes (docker-compose.yml):
  - Add `redis` service (image `redis:7-alpine`), `ports: ["6379:6379"]`, healthcheck (`redis-cli ping`).
  - Optional auth: `command: ["redis-server","--requirepass","${REDIS_PASSWORD}"]` and add `REDIS_PASSWORD` to `.env`.
  - Backend: add `depends_on: redis` and set `REDIS_URL` to `redis://${HOST_IP}:6379/1` (or in-network `redis://redis:6379/1`).
- Backend dependency: add `redis>=4.5` to `backend/requirements.txt` and rebuild backend.
- Settings: already support `REDIS_URL` env; LocMem fallback remains.
- Validation:
  - Bring up: `docker-compose up -d --build redis backend` and verify redis healthy.

---

### Global Search (Header)

- Description: Add a fast, global search in the top‑right header to find people, projects, departments, and assignments from anywhere.
- UX
  - Input placeholder: “Search people, projects…” with a compact “Search” button.
  - Keyboard: Ctrl/Cmd+K to focus/expand, Arrow keys to navigate results, Enter to open.
  - Result groups: People, Projects, Departments, Assignments (with small badges and subtle separators).
  - No‑results state with suggestions and recent searches.
- Scope (MVP)
  - Client‑side typeahead that calls a single backend endpoint (e.g., `/search?q=`) which federates across core entities and returns a ranked, trimmed result set.
  - Debounced requests (≈200 ms) with request cancellation; limit 8–10 results per group.
  - Highlight matching substrings in result labels; include small context (e.g., project client, department name).
- API Sketch
  - GET `/search?q=string&limit=8`
  - Response
    ```json
    {
      "people": [{"id":1,"name":"Alex Mehner","department":"Electrical"}],
      "projects": [{"id":42,"name":"Transit Hub","client":"Metro"}],
      "departments": [{"id":7,"name":"Mechanical"}],
      "assignments": [{"id":999,"person":"Brett Grossman","project":"Harbor"}]
    }
    ```
- Implementation Notes
  - Frontend: isolated `GlobalSearch` component; tokenized styles (light/dark friendly), accessible listbox pattern.
  - Backend: aggregator view that queries capped subsets with simple ranking (ILIKE/tsvector/Trigram depending on DB extensions available).
  - Performance: enforce tight caps per group; add total timeout budget (e.g., 150 ms backend target) and return partial groups when hitting limits.
  - Telemetry: record anonymized query length bins and group clicks to improve defaults; never store raw queries server‑side.
- Accessibility
  - ARIA attributes for combobox/listbox; screen‑reader friendly labels; focus ring uses `--focus` token.
  - Provide Escape to close; restore focus to the trigger.
- Estimated Timeline: 1–2 days (MVP) + 1 day for improved ranking/highlights.
  - Shell check: `from django.core.cache import cache; cache.set('k','v',60); cache.get('k')` via `manage.py shell`.
  - Endpoint timing: call `/api/people/capacity_heatmap/` and `/api/people/workload_forecast/` twice; expect HIT on second call.
- Security/ops: restrict Redis exposure (bridge network), set memory limits, optional eviction policy (`allkeys-lru`).

### 11. Automated Testing Suite
- **Description**: Expand test coverage with integration and end-to-end tests
- **Tools**: Playwright for E2E, expanded Django test suite
- **Estimated Timeline**: 4-5 days

### 12. Mobile Responsiveness Enhancements
- **Description**: Improve mobile experience, especially for assignment grid
- **Features**: Touch-friendly interactions, mobile-optimized layouts
- **Estimated Timeline**: 3-4 days

---

## 🚀 Future Vision - Major Features

### 13. Multi-tenant Support
- **Description**: Support multiple organizations/clients in single deployment
- **Complexity**: High - requires significant architecture changes
- **Estimated Timeline**: 3-4 weeks

### 14. Integration APIs
- **Description**: Connect with external project management tools (Jira, Asana, etc.)
- **Features**: Two-way sync, webhook support, data mapping
- **Estimated Timeline**: 4-6 weeks

### 15. Machine Learning Insights
- **Description**: AI-powered insights for resource allocation and project success prediction
- **Features**: Predictive analytics, anomaly detection, optimization suggestions
- **Estimated Timeline**: 6-8 weeks

---

## 📝 Implementation Notes

### Priority Guidelines
- **High Priority**: Critical for stability/performance as app scales
- **Medium Priority**: Significant user experience improvements
- **Low Priority**: Nice-to-have improvements, technical debt
- **Future Vision**: Major features requiring significant development time

### Development Approach
1. Always implement with backward compatibility
2. Add feature flags for gradual rollouts
3. Include comprehensive testing
4. Document breaking changes in CHANGELOG.md
5. Update CLAUDE.md with implementation status

### Monitoring & Success Metrics
- Track implementation against estimated timelines
- Monitor performance impact of new features
- Gather user feedback for priority adjustments
- Regular review and reprioritization (monthly)

---

*Last Updated: August 30, 2025*  
*Next Review: September 30, 2025*

---

## 🎯 Backlog Additions (from R2-REBUILD request)

These are intentionally deferred and tracked here for future implementation.

### Advanced Skills/Departments
- Skill gap analysis across teams and projects
- Department hierarchy visualization and roll-up metrics
- Bulk operations for departments and skills maintenance

Sources: `prompts/R2-REBUILD-DEPARTMENTS.md`, `prompts/R2-REBUILD-MASTER-GUIDE.md` (Chunk 6)

### Contracts/Compliance
- Contract tracking with key dates and budget checks
- Compliance checks aligned to client requirements

Source: `prompts/R2-REBUILD-CONTRACTS.md`

### Automation/Notifications
- Email notifications for assignment additions/changes and upcoming deadlines
- Automated suggestions for workload balancing and risk alerts

Sources: `prompts/R2-REBUILD-004-MANAGER-FEATURES.md`, `prompts/R2-REBUILD-002-BUSINESS-LOGIC.md`
### Infinite Scrolling for Lists
- Description: Replace explicit "Load more" buttons with automatic fetching when users near the bottom of the list.
- Scope: People and Projects left-panel lists (and similar long lists).
- Approach: Use IntersectionObserver/scroll threshold with React Query `fetchNextPage()`; preserve keyboard accessibility and announce loading status.
- Benefits: Fewer clicks; smoother, continuous browsing.
- Trade-offs: Must guard against over-fetching; keep clear end-of-list indicators; still combine with virtualization for render performance.
- Acceptance: Smooth auto-append, no duplicate loads, accessible focus management, works with filtered views.
- Estimated Timeline: 0.5–1 day

### Brotli Compression for Nginx
- **Description**: Enable Brotli compression in Nginx for improved asset compression beyond gzip
- **Status**: Deferred due to implementation complexity vs. marginal benefits
- **Current**: Gzip compression already provides ~80% of Brotli's benefits with `gzip_comp_level 6`
- **Implementation Requirements**:
  - Switch from `nginx:alpine` to `nginxinc/nginx-unprivileged:alpine` or custom build
  - Add Brotli configuration to `nginx/nginx.conf` (already has placeholder config)
  - Update `nginx/sites-available/workload-tracker.conf` for content negotiation
  - Add build-time pre-compression to frontend Dockerfile
  - Add Brotli CLI tools to build containers
- **Benefits**: 15-20% better compression than gzip (~50-100KB savings on JS/CSS)
- **Complexity**: 5-7 file changes, custom Docker images, build process modifications
- **Alternative**: Consider CDN-based Brotli (e.g., Cloudflare auto-enables Brotli)
- **Estimated Timeline**: 1-2 days
- **Trigger**: When asset sizes grow significantly or CDN migration is planned

---

## Notifications & Scheduling

- Add email templates (HTML/text) and wiring for Celery Beat schedules
  - Create HTML and plain-text templates for individual reminders and daily digests
  - Configure Celery Beat entries to schedule reminder and digest tasks
  - Gate schedules behind env flags and document configuration

---

## UI Polish — Calendar Hover Highlight

## VULERABILITY FIXES

Context
- npm audit surfaced a handful of dev-tooling vulnerabilities. These do not ship to end users but impact CI/dev supply chain risk and should be remediated.

Remediation Items (priority ordered)
- High: Playwright/@playwright/test (GHSA-7mvr-c777-76hp)
  - Risk: Browser downloads without SSL cert verification in older versions can enable MITM on CI/dev.
  - Action: Bump @playwright/test to ^1.56.1 (pulls Playwright =1.55.1).

- High: tar-fs symlink traversal (GHSA-vj76-c3g6-qr5v)
  - Risk: Malicious tar could write outside extraction dir during tooling downloads/extracts.
  - Action: Add overrides forcing 	ar-fs to ^3.1.1.

- Moderate: Vite dev server Windows path traversal (GHSA-93m4-6634-74q7)
  - Risk: Dev-only server.fs.deny bypass via backslash; exposure if dev server is reachable by untrusted clients.
  - Action: Bump ite to ^7.1.12.

- Low (transitive): tmp, external-editor, inquirer, @lhci/cli
  - Risk: Temp-file symlink issues and editor/inquirer chains; dev-only impact.
  - Action: Override to patched ranges: 	mp@^0.2.4, external-editor@^3.1.0, inquirer@^9.3.9; update @lhci/cli or pin subdeps via overrides.

Implementation Steps
1. Update rontend/package.json:
   - DevDeps: @playwright/test@^1.56.1, ite@^7.1.12.
   - Add overrides for: 	ar-fs@^3.1.1, 	mp@^0.2.4, external-editor@^3.1.0, inquirer@^9.3.9.
2. cd frontend && npm install (refresh lockfile). Clear CI caches if necessary.
3. Run 
pm run build, 
pm audit, and E2E tests to validate.
4. Commit lockfile changes and push. Track Dependabot to close alerts.

Acceptance Criteria
- 
pm audit reports 0 high/critical issues.
- CI builds green on fresh cache.
- No dev-server behavior regressions; Playwright tests still run/install safely.

- Add project-scoped hover highlight to Deliverables Calendar.
  - Hovering a deliverable or a grouped pre‑deliverable card dims other projects (opacity only) and keeps the target project at full intensity.
  - Keyboard: focusing a card highlights the project; Esc clears. No hover on touch/mobile.
  - No layout changes; only class toggles to avoid reflow. State resets on week/navigation changes.



- NEED TO ADD IN ADDITIONAL REPORTING DATA

## Repo Root Declutter: Move Compose Files into docker/ with COMPOSE_FILE (Option A)

Context
- The repository root has many operational files (several docker-compose*.yml, setup scripts, samples) that make the file list long in GitHub.
- We want to group these by purpose without breaking developer or production workflows.

Decision
- Adopt “Option A”: move compose files under `docker/` and rely on `COMPOSE_FILE` so `docker compose up` still works from the repo root.

Scope & Steps
1. File moves (no functional changes)
   - Move `docker-compose.yml`, `docker-compose.override.yml` (dev) and `docker-compose.prod.yml` (prod) to `docker/`.
   - Optional: Move Unraid and other deployment compose files to `docker/` or `deploy/` uniformly.
2. Path adjustments in moved compose files
   - Because compose resolves paths relative to the compose file location, update:
     - `build.context: ./backend` → `../backend`
     - `build.context: ./frontend` → `../frontend`
     - Volume mounts `./nginx/...` → `../nginx/...`
     - Any `env_file: .env` → `../.env` if used.
3. Root .env update (prod and dev hosts)
   - Add `COMPOSE_FILE=docker/docker-compose.yml:docker/docker-compose.override.yml` (dev) and/or `COMPOSE_FILE=docker/docker-compose.prod.yml` (prod).
   - Keep `COMPOSE_PROJECT_NAME=workload-tracker` for stable container names.
4. Script/automation updates
   - Update systemd/cron/CI scripts that call compose: either rely on `COMPOSE_FILE` or pass `-f docker/<file>.yml` explicitly.
5. Validation
   - From repo root: `docker compose config` (ensure paths resolve), `docker compose pull|build`, `docker compose up -d`.
6. Rollout
   - Zero‑downtime: `docker compose up -d --no-deps --build backend frontend nginx` on prod host.
7. Rollback
   - Temporarily run with explicit `-f` pointing to the old location or keep a one‑release shim file at root.

Acceptance Criteria
- Running `docker compose up -d` from the repo root continues to work for dev and prod (with COMPOSE_FILE set).
- All build contexts and volume mounts resolve after the move.
- CI and deployment scripts succeed without path errors.
