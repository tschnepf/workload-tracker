# Server-Side Aggregation & Heavy-Compute Migration - Action Prompts

These prompts migrate remaining heavy, bursty client-side calculations to the backend. Each prompt is designed to be fed to the AI agent one at a time.

Lean Programming Best Practices (apply to every prompt)
- Write clear, maintainable code; avoid hacks/quick fixes
- Prefer correct solutions over stop-gaps; keep diffs focused and minimal
- Preserve existing behavior, headers (ETag/Last-Modified), and typed contracts
- Keep naming discipline: camelCase to frontend; DRF serializers map snake_case -> camelCase
- Accurately document with drf-spectacular and keep the typed client in sync

Principles
- Prefer one aggregate request per view over N fan-out calls
- Add `@extend_schema` with dedicated serializers (avoid large inline shapes)
- Add short-TTL caching, `ETag`/`Last-Modified`, and conditional 304 handling for aggregate reads
- Use `ScopedRateThrottle` per aggregate endpoint; tune via settings/env
- Regenerate schema and types; ensure CI OpenAPI drift stays green; build must pass
- Canonicalize week keys to Monday in API responses; translate from storage as needed

---

## Prompt 1 - Add People Skill Match Scoring Endpoint

Goal: Move skill match computation off the client and return ranked candidates in one call.

Instructions for the AI Agent
- Always apply Lean Programming Best Practices (top of doc)
- Backend
  - Add a `@action(detail=False, methods=['get'], url_path='skill_match')` to `backend/people/views.py` under `PersonViewSet`.
  - Parameters: `skills` (comma-separated), `department` (int, optional), `include_children` (0|1), `limit` (int, default 50, max 200), `week` (YYYY-MM-DD, optional for availability-aware scoring).
  - Implement server-side scoring using `PersonSkill` and/or `SkillTag` (exact/contains match, case-insensitive) and optionally factor in availability if `week` is provided (use Assignments weekly hours). Use Monday as the canonical week key in all responses; translate from stored keys as needed.
  - Optimize database queries with `select_related()`/`prefetch_related()`. Add indexes where applicable:
    - `PersonSkill`: composite index `(person, skill_tag)` and single index on `skill_tag`
    - `SkillTag`: case-insensitive index on `name` (via `Lower(name)`)
  - Add dedicated serializers in `backend/people/serializers.py`: `SkillMatchRequestSerializer` (query description) and `SkillMatchResultItemSerializer` with fields: `{ personId, name, score (0-100), matchedSkills[], missingSkills[], departmentId, roleName }`.
  - Add `@extend_schema` on the action referencing those serializers.
  - Add short-TTL caching keyed by (skills, dept, include_children, limit, week) and ETag/Last-Modified validators over `PersonSkill/SkillTag` and `Assignment.updated_at` when `week` provided.
  - Add `ScopedRateThrottle` (scope `skill_match`). In `backend/config/settings.py`, add `DEFAULT_THROTTLE_RATES['skill_match']` (e.g., `600/min`, env-overridable).
  - Validate inputs: clamp `limit` (<= 200); return 413 for excessive requests.
  - Prevent cache stampedes: use a per-key cache lock (single-flight) around cache miss paths.
  - Security & scope: ensure default permissions (`IsAuthenticated` and `RoleBasedAccessPermission` if enabled) and enforce department scoping consistent with other endpoints.
- Frontend
  - Add `peopleApi.skillMatch(skills: string[], opts?: { department?: number; include_children?: 0|1; limit?: number; week?: string })` that calls `/people/skill_match/` via typed client.
  - Replace client-side skill scoring in `frontend/src/pages/Assignments/AssignmentForm.tsx` with the server response; remove duplicated compute. Keep a temporary fallback if the endpoint is unavailable (HTTP 404/501).
- Verify
  - Regenerate schema/types; build. Smoke test Assignment form typeahead and ranking. Ensure no 429s.

---

## Prompt 2 - Add Project Availability Snapshot Endpoint

Goal: Replace per-person availability calls on Projects UI with one server burst.

Instructions for the AI Agent
- Always apply Lean Programming Best Practices (top of doc)
- Backend
  - Add `@action(detail=True, methods=['get'], url_path='availability')` to `backend/projects/views.py` under `ProjectViewSet`.
  - Params: `week` (YYYY-MM-DD, default=nearest Monday), optional `department`/`include_children` to scope people if needed.
  - Response: array `{ personId, personName, totalHours, capacity, availableHours, utilizationPercent }` for all candidate people relevant to the project context. Use Monday as the canonical week key in calculations; translate from stored keys as needed.
  - Implement efficient aggregation: prefetch active assignments and compute current-week totals server-side with tolerant date matching (+/- 3 days) to bridge stored keys. Note: weekly hours are stored as JSON; `SUM` over a `week_start_date` column is not applicable. For advanced reporting at scale, consider a normalized `AssignmentWeek` table or a materialized view.
  - Add `@extend_schema` with a dedicated `ProjectAvailabilityItemSerializer`.
  - Add ETag/Last-Modified based on max(updated_at) across People+Assignments and Cache-Control `private, max-age=30`; honor conditional headers.
  - Add `ScopedRateThrottle` (scope `project_availability`) with a sensible rate in settings. Validate inputs and clamp list sizes if applicable.
  - Prevent cache stampedes: use a per-key cache lock (single-flight) around cache miss paths.
  - Security & scope: ensure default permissions (`IsAuthenticated` and `RoleBasedAccessPermission` if enabled) and enforce department scoping.
- Frontend
  - Add `projectsApi.getAvailability(projectId: number, week?: string)` via typed client.
  - Update `frontend/src/pages/Projects/ProjectsList.tsx` to call this endpoint once and stop any remaining per-person availability bursts. Keep a fallback to the one-week heatmap path if the endpoint is unavailable (HTTP 404/501) during rollout.
- Verify
  - Regenerate schema/types; build. Confirm one request per view and stable rendering.

---

## Prompt 3 - Enhance Capacity Heatmap Payload (percent + available)

Goal: Remove remaining client math by returning utilization percentages and available hours per week from the server.

Instructions for the AI Agent
- Always apply Lean Programming Best Practices (top of doc)
- Backend
  - In `backend/people/serializers.py`, extend `PersonCapacityHeatmapItemSerializer` to add optional fields:
    - `percentByWeek: Dict<string, number>` and `availableByWeek: Dict<string, number>` (camelCase)
  - In `backend/people/views.py:capacity_heatmap`, compute those maps based on `weekTotals` and `weekly_capacity` while building the result. Use Monday as canonical week keys in the API; translate from stored keys as needed.
  - Annotate fields with `@extend_schema_field` as needed to keep schema precise.
  - Keep existing ETag/Last-Modified + Cache-Control logic; ensure no regressions.
  - Prevent cache stampedes: use a per-key cache lock (single-flight) around cache miss paths for the heatmap cache.
- Frontend
  - Adjust consumers (e.g., heatmap renderers) to use `percentByWeek`/`availableByWeek` directly when available, falling back to local calculation if absent for backward compatibility.
- Verify
  - Regenerate schema/types; build. Confirm visuals unchanged, less client CPU.

---

## Prompt 4 - People "Find Available" (Server Ranking API)

Goal: Centralize ranking logic for availability and skills.

Instructions for the AI Agent
- Always apply Lean Programming Best Practices (top of doc)
- Backend
  - Add `@action(detail=False, methods=['get'], url_path='find_available')` in `PersonViewSet`.
  - Params: `week` (YYYY-MM-DD), `skills` (comma-separated), `department`, `include_children`, `limit` (default 100), optional `minAvailableHours`.
  - Response item: `{ personId, name, availableHours, capacity, utilizationPercent, skillScore, matchedSkills[], missingSkills[] }` sorted by a transparent score `(availability weight + skill weight)`.
  - Add serializers and `@extend_schema` accordingly.
  - Use Monday as canonical week key; translate from stored keys as needed. Add scoped throttle (`find_available`) and short-TTL cache + ETag/Last-Modified.
  - Validate inputs: clamp `limit` (<= 200). Return 413 for excessive requests.
  - Prevent cache stampedes: use a per-key cache lock (single-flight) around cache miss paths.
  - Security & scope: ensure default permissions (`IsAuthenticated` and `RoleBasedAccessPermission` if enabled) and enforce department scoping.
- Frontend
  - Add `peopleApi.findAvailable(...)` and integrate into relevant tools/pages (e.g., quick actions) to remove any remaining client-side data crunching.
  - Provide a graceful fallback path to legacy client computations if the endpoint is unavailable (HTTP 404/501) during rollout.
- Verify
  - Regenerate schema/types; build. Test with 100-200 people.

---

## Prompt 5 - Assignment Grid Snapshot Endpoint

Goal: Provide a compact, pre-aggregated structure for the grid in one request.

Instructions for the AI Agent
- Always apply Lean Programming Best Practices (top of doc)
- Backend
  - Add `assignments/grid_snapshot/` in `backend/assignments/views.py` as `@action(detail=False, methods=['get'])`.
  - Params: `weeks` (default 12), `department`, `include_children`.
  - Response shape:
    ```json
    {
      "weekKeys": ["YYYY-MM-DD", ...],
      "people": [{ "id": number, "name": string, "weeklyCapacity": number, "department": number|null }],
      "hoursByPerson": { "<personId>": { "YYYY-MM-DD": number, ... } }
    }
    ```
  - Optimize for large datasets: use `prefetch_related()` for assignments and implement a single sweep to build maps server-side. Use Monday as canonical API week keys and tolerate +/- 3 days when translating from stored keys. Note: weekly hours are stored as JSON; traditional composite indexes on `(person_id, week_start_date)` don’t apply. For very large datasets (500+ users, 12+ weeks), consider a normalized `AssignmentWeek` table or materialized view and/or an async variant.
  - Add a bulk hours update endpoint `assignments/bulk_update_hours/` (`@action(detail=False, methods=['patch'])`) that accepts an array of `{ assignmentId, weeklyHours }` and updates within a single transaction to replace multiple PATCH calls. Return per-item status and refreshed ETags; use all-or-nothing transaction semantics with clear 409/412 errors on conflicts.
  - Include ETag/Last-Modified/Cache-Control and scoped throttle (`grid_snapshot`). Validate inputs; clamp `weeks` (1-26). Prevent cache stampedes with per-key cache locks.
- Frontend
  - Add `assignmentsApi.getGridSnapshot({ weeks, department, include_children })` and update the grid to render from this snapshot.
  - Replace N PATCH updates with the bulk hours endpoint when saving ranges or multiple edits. Remove fan-out data pulls in the grid path. Keep fallbacks during rollout.
- Verify
  - Regenerate schema/types; build; validate performance on large slices.

---

## Prompt 6 - Database Performance Optimization

Goal: Add database indexes and connection pooling optimizations for high-concurrency workloads.

Instructions for the AI Agent
- Always apply Lean Programming Best Practices (top of doc)
- Backend Database Indexes
  - Create Django migration in `backend/people/migrations/` to add database indexes:
    - `PersonSkill`: composite index `(person, skill_tag)` and single index on `skill_tag`
    - `SkillTag`: case-insensitive index on `name` field (use `Lower()`)
    - `Person`: index on `is_active, department` (already present) — ensure coverage for dept filters
    - Note: `Assignment` weekly hours are stored as JSON — composite indexes on `(person, week_start_date)` do not apply. For key lookups over JSON keys, consider a GIN index; for advanced aggregation, consider a normalized `AssignmentWeek` table or materialized view.
- Connection & Readiness
  - Use Django’s `CONN_MAX_AGE` (already configured via `dj_database_url`). For deeper pooling, deploy pgbouncer or tune process concurrency (e.g., gunicorn workers/threads). Do not add non-standard `MAX_CONNS`/`MIN_CONNS` options to `DATABASES`.
  - You already expose `/health/` and `/readiness/` with DB/Redis checks; optionally include basic timing/metrics.
- Performance Testing
  - Create Django management command `test_aggregation_performance` to benchmark new endpoints with 100-500 user simulation
  - Add query analysis using `django.db.connection.queries` in development to verify index usage
- Verify
  - Run migrations in development and staging environments
  - Load test under expected concurrency; confirm database query plans use new indexes via `EXPLAIN ANALYZE`

---

## Prompt 7 - Background Job Processing Setup

Goal: Implement background processing for heavy aggregations that may timeout under high load.

Instructions for the AI Agent
- Always apply Lean Programming Best Practices (top of doc)
- Backend Celery Integration
  - Celery and Redis are already configured (compose + `backend/config/celery.py`). Create `backend/core/tasks.py` with Celery tasks for:
    - `generate_grid_snapshot_async(weeks, department, include_children)` — for very large grid requests
    - `bulk_skill_matching_async(skills, filters)` — for complex skill matching operations
  - Add task status tracking using Celery result backend
  - Implement task timeout and retry logic with exponential backoff
- API Integration
  - Add async endpoint variants: `/assignments/grid_snapshot_async/` that returns task ID
  - Reuse existing job status/download endpoints (`/api/jobs/{id}/`, `/api/jobs/{id}/download/`) for polling and file delivery
  - Implement client-side polling for async operations with progress indicators
- Docker Configuration
  - Workers are present in compose; configure proper resource limits and scaling
- Verify
  - Test async operations with large datasets (500+ users, 26+ weeks)
  - Confirm task cleanup and memory management
  - Validate graceful fallback when Redis is unavailable

---

## Prompt 8 - CI, Types, Build & Monitoring

Instructions for the AI Agent
- Always apply Lean Programming Best Practices (top of doc)
- Regenerate OpenAPI and types; ensure builds are green:
  - `docker compose exec backend python manage.py spectacular --file openapi.json --format openapi-json`
  - `docker compose exec frontend npx openapi-typescript http://backend:8000/api/schema/ -o src/api/schema.ts`
  - `docker compose exec frontend npm run build`
- Ensure `.github/workflows/openapi-ci.yml` passes and blocks drift.
- Enhanced Monitoring Configuration
  - Add/confirm throttling env vars in `.env`/CI and corresponding `DEFAULT_THROTTLE_RATES` entries: `DRF_THROTTLE_HEATMAP`, `DRF_THROTTLE_SKILL_MATCH`, `DRF_THROTTLE_PROJECT_AVAILABILITY`, `DRF_THROTTLE_FIND_AVAILABLE`, `DRF_THROTTLE_GRID_SNAPSHOT`.
  - Configure Django performance logging: slow query logging, endpoint response times, and database connection metrics
  - Add Sentry performance monitoring with custom metrics for aggregation endpoints
  - Implement health check endpoints that verify database performance and connection pool status
- Performance Validation
  - Validate via manual QA: one request per view for heatmap/projects, and no 429s
  - Load test each aggregation endpoint with 50+ concurrent requests
  - Confirm Sentry capture (breadcrumbs: endpoint path + status codes + query counts) for observability during rollout
  - Monitor database connection pool utilization and query performance metrics
  - Update `.env.example` with new throttle env vars and recommended defaults; document `SHORT_TTL_AGGREGATES` usage.
  - Align client cache with server: set React Query `staleTime` to roughly match server `Cache-Control` for aggregate endpoints (~30s) to reduce revalidation.
  - Add fallback telemetry: when a client fallback path is used (due to 404/501), emit a breadcrumb/console info to aid rollout validation.

---

## Prompt 9 - Cleanup & Flag Retirement

Instructions for the AI Agent
- Always apply Lean Programming Best Practices (top of doc)
- Remove any leftover client-side compute branches and deprecated per-person calls on screens that migrated to aggregate endpoints.
- Retire corresponding feature flags and env vars; keep interceptors (auth/ETag/If-Match) centralized.
- Ensure the codebase uses the typed client consistently; delete legacy wrappers if unused.
- Run a final schema/types regen and build.
- Prefer the typed client (`apiClient`) for new endpoints and migrate older fetch paths where feasible for consistency.

Examples of client paths to retire after migration
- Projects: replace availability calculation with server endpoint; remove heatmap-derived fallback once stable
- Assignment Form: replace skill scoring with server endpoint
- Assignments Grid: replace fan-out lists and multi-PATCH loops with grid snapshot + bulk update

---

## Prompt 10 - Cache Invalidation & Stampede Control (Cross-Cutting)

Goal: Ensure aggregated caches stay fresh and large cache rebuilds don’t overload the system.

Instructions for the AI Agent
- Always apply Lean Programming Best Practices (top of doc)
- Cache invalidation
  - Add Django signals on `Assignment`, `Person`, and `Department` to bump versioned cache keys, e.g.:
    - `analytics_cache_version` for heatmap/forecast/grid snapshot payloads
    - `dept_desc_ver` for department descendant id cache used in filtering
  - Use versioned cache keys in all aggregate endpoints and increment versions on relevant writes.
- Stampede control
  - Add a per-key cache lock (single-flight) around heavy cache miss paths for: capacity heatmap, project availability, find available, grid snapshot, and filter metadata endpoints.
- Consistency & scope
  - Verify all new endpoints enforce `IsAuthenticated` and `RoleBasedAccessPermission` (if enabled) and honor department scoping consistently.
- Optional capabilities endpoint
  - Add a lightweight `/api/capabilities/` endpoint advertising which aggregate features are enabled so clients can choose server vs. fallback deterministically during rollout.

---

## Prompt 11 - Migrate Assignment Sorting to Backend

Goal: Move assignment sorting from frontend to backend for improved performance at scale (200-500+ users).

Instructions for the AI Agent
- Always apply Lean Programming Best Practices (top of doc)
- Backend
  - In `backend/assignments/views.py`, modify the `AssignmentViewSet.list()` method to add database-level sorting by client name first, then project name.
  - Add `order_by('project__client', 'project__name')` to the queryset in the list method. Handle null/empty client names by using Django's `Coalesce` or `Case` to sort them last: `order_by(Coalesce('project__client', Value('zzz_no_client')), 'project__name')`.
  - Ensure the sorting respects existing filters (department, status, etc.) and maintains current pagination behavior.
  - Add database indexes to optimize the sort performance:
    - Create migration in `backend/projects/migrations/` to add composite index on `(client, name)` in the `Project` model
    - Consider case-insensitive sorting with `Lower('project__client'), Lower('project__name')` if needed
  - Verify that serializers return client information properly (ensure `project__client` is accessible via select_related or prefetch_related)
- Database Optimization
  - Use `select_related('project')` in the queryset to avoid N+1 queries when accessing project.client and project.name
  - Add the composite database index: `Index(fields=['client', 'name'], name='projects_client_name_idx')` in the Project model's Meta class
- Frontend
  - Remove the frontend sorting logic from `frontend/src/pages/Assignments/AssignmentGrid.tsx` in the `getVisibleAssignments` function
  - Simplify `getVisibleAssignments` to only handle filtering (status filters), removing the `.sort()` call and related sorting logic
  - Keep existing filtering behavior intact - only remove the sorting portion
  - Add a comment noting that sorting is now handled by the backend API
- Performance Impact
  - This change improves performance for large datasets (200-500+ people with multiple assignments each)
  - Reduces frontend sorting time from 50-300ms to ~2-5ms database sorting
  - Eliminates UI blocking on slower devices during assignment list rendering
- Verify
  - Test that assignments appear in alphabetical order by client name, then project name
  - Confirm existing filtering and pagination still work correctly
  - Verify no performance regression on smaller datasets
  - Check that empty/null client names sort to the end of the list
  - Regenerate schema/types if any API contract changes

---

Notes
- Use lean, maintainable code; avoid shortcuts to merely silence errors
- Keep error messages user-friendly; preserve existing toasts and optimistic UI behaviors where applicable
- Favor reusable serializers/components in OpenAPI; avoid giant inline schemas
- Prefer server-side pre-aggregation + cache over client workarounds
- Validate inputs (e.g., `weeks` 1-26, `limit` caps) and return 413 for oversized requests
- Performance-First Approach: Add appropriate indexes (where applicable) and monitor query performance and connection usage continuously
- Scalability Considerations: Design aggregation endpoints to handle 100-500+ concurrent users. Use background jobs for operations that may exceed 30-second timeouts
- Database Connection Management: Use `CONN_MAX_AGE` for persistent connections; consider pgbouncer and process concurrency for pooling; monitor and alert on connection pool exhaustion

