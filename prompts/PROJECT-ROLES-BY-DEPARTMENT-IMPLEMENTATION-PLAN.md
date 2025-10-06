# Project Roles by Department — Implementation Plan
    - Failure handling: add a single retry with jitter and fall back to cached data when available; emit concise, actionable toasts on failures (including when capability is missing/disabled).
 
Goal

- Add admin-managed project role catalogs per department and use them in Assignments and Project Assignments. On click of the project role field, show a strict dropdown of available roles for the assignment person’s department. No free-text entry. Lean implementation with clean seams between backend and frontend; no shortcuts or band-aids.

Scope Overview

- Backend (Django REST): new mapping model Department↔ProjectRole, endpoints to list/add/remove and a batched map endpoint. Update existing `/core/project_roles/` to support `?department=<id>` for fallback. Unit tests and OpenAPI stability.
- Frontend (React/TS): settings UI to manage roles per department; grids fetch department→roles map and swap to controlled dropdowns per person. Strict coordination across types, services, and views.
- Testing: backend unit tests; frontend unit/integration; light e2e flows for dropdown behavior.

Principles

- Lean programming best practices: small, composable changes; single source of truth; no duplication; avoid N+1; defensive error handling; accessibility and keyboard nav maintained; tests-first thinking for risky changes. No quick fixes or surface patches.

Editing Rules

- Use `apply_patch` for all file changes.
- Preserve formatting and existing line endings.
- Do not use shell writes (`Set-Content`/`echo`/`sed`) to modify code.
- Do not insert literal `\r\n` sequences; let the patch handle newlines.
- Avoid bulk regex replacements; submit minimal, contextual patches.
- After edits, run the frontend type check/build to validate.
 - Only use best-practice programming; do not introduce shortcuts or band-aid fixes just to satisfy tests.
 - Never remove code or functionality solely to make tests pass.

Execution Discipline

- Work strictly one phase at a time. Begin with Phase 0 and proceed sequentially; do not start a new phase until the current one is fully complete and validated.
- For each phase, perform this checklist before moving on:
  - Rebuild/restart containers as needed and capture commands used, for example:
    - `docker compose build backend frontend`
    - `docker compose up -d backend frontend` or `docker compose restart backend frontend`
  - Run backend tests inside the container and confirm green, for example:
    - `docker compose exec backend pytest -q` (or `python manage.py test` if pytest is not configured)
  - Run frontend type check/build (and unit tests when applicable):
    - `cd frontend && npm ci && npm run build`
    - `cd frontend && npm run test` (unit tests), optional `npm run e2e` when enabled
  - If any tests fail, fix within the scope of the current phase without shortcuts; re-run until passing before proceeding.

Phases and Prescriptive Steps

## Phase 0 — Repo Inventory and Design

1. Prompt: Inventory role selection logic in grids
   - Read `frontend/src/pages/Assignments/AssignmentGrid.tsx` and `frontend/src/pages/Assignments/ProjectAssignmentsGrid.tsx` to locate current project-role editing controls and `roleOptions` derivation from in-use roles. Confirm UI entry points that switch to editing. Identify where person department is available or needs enrichment.

2. Prompt: Inventory current ProjectRole API
   - Read `backend/core/models.py` for `ProjectRole` and `backend/core/views.py:ProjectRoleView`. Note current GET union behavior and POST catalog add. Confirm `backend/core/urls.py` routes.

3. Prompt: Confirm Department/Person structure
   - Read `backend/departments/models.py` and `frontend/src/types/models.ts:Department, Person`. Confirm `Person.department` presence and where frontend fetches person meta in `ProjectAssignmentsGrid` (currently `peopleApi.get`). Plan to include department id in meta cache.

Deliverable: A short design note in code comments atop new backend view describing chosen endpoints and constraints.

4. Feature flag and capability advertisement
   - Add `FEATURES.PROJECT_ROLES_BY_DEPARTMENT` to `backend/config/settings.py` (default: `False`).
   - Advertise a boolean capability `projectRolesByDepartment` from `/api/capabilities/` so the frontend can gate Settings and grid behavior cleanly.

## Phase 1 — Backend Data Model

4. Prompt: Add Department↔ProjectRole mapping model
   - In `backend/core/models.py`, add `DepartmentProjectRole` with fields: `department=FK('departments.Department', on_delete=CASCADE)`, `project_role=FK('core.ProjectRole', on_delete=CASCADE)`, timestamps, and optional `is_active=Boolean(default=True)`. Add unique constraint on `(department, project_role)` and DB indexes on `department` and the `(department, project_role)` pair. Keep sorting minimal; rely on queries to order by role name when needed.
   - Keep naming and style consistent with existing models. Validate foreign keys exist. Do not add unrelated changes.

5. Prompt: Create and apply migration
   - Generate a migration for the new model. Ensure it is reversible and contains no data-mutations outside model DDL.
   - Declare migration dependency on the `departments` app to ensure FK targets exist before applying this model.
   - Migration QA checklist: apply migration locally; verify admin can view the model (if registered); smoke test core endpoints after wiring (200/403/404 paths) without altering existing `/core/project_roles/` behavior when `?department` is not provided.

6. Prompt: (Optional) Admin registration (read-only)
   - Register `DepartmentProjectRole` in Django admin with list_display and basic filters to aid manual inspection. Keep it minimal.

Acceptance:
- Model enforces uniqueness and integrity. Migration applies cleanly on dev DB. No changes to existing models beyond this addition.

## Phase 2 — Backend API Endpoints

7. Prompt: Extend core URLs
   - Update `backend/core/urls.py` to add new routes:
     - `GET /core/department_project_roles/map/` → batched map endpoint
     - `GET /core/department_project_roles/` → list by `?department=<id>`
     - `POST /core/department_project_roles/` → add mapping `{ department: number, name: string }`
     - `DELETE /core/department_project_roles/{department}/{role_id}/` → remove mapping

8. Prompt: Implement DepartmentProjectRole views
   - In `backend/core/views.py`, add APIView(s) using `IsAuthenticated` for GET and `IsAdminUser` for mutations. Behavior and response shapes:
     - Map endpoint: accepts `department_ids=1,2,3` and returns `{ [deptId: string]: Array<{ id: number; name: string }> }`, sorted case-insensitively in the database. Use `select_related('project_role')` and `__in` lookups to avoid N+1.
     - List: `GET /core/department_project_roles/?department=<id>` returns `Array<{ id: number; name: string }>` for that department. If missing/invalid id, `400`.
     - Create: body `{ department: number; name: string }`. Normalize `name` (trim/lower for key). `get_or_create` `ProjectRole` by normalized key, then `get_or_create` mapping. Idempotent: return `200` when mapping already exists. Admin-only.
     - Delete: `DELETE /core/department_project_roles/{department}/{role_id}/` removes the mapping; return `404` if not found. Admin-only.
   - Include light input validation and friendly error messages. Avoid N+1 DB patterns (use `select_related`, `in` lookups). Sort case-insensitively in DB to avoid UI resort jitter.
   - Permissions: enforce `IsAuthenticated` for GET and `[IsAuthenticated, IsAdminUser]` for POST/DELETE to avoid Manager writes via the default permission class.
    - Sorting: ensure DB-side case-insensitive ordering using `Lower('project_role__name')`.
    - Idempotency and race-safety: wrap POST in a short transaction; catch `IntegrityError` on unique constraint and return 200 with the existing mapping.
    - Caching: add ETag/Last-Modified headers to map/list responses and support `If-None-Match` for 304.
    - Throttling: add DRF `ScopedRateThrottle` entries (e.g., `department_roles_map`, `department_roles_mutate`) in settings and apply them on the views.
    - Input validation: cap `department_ids` length (e.g., ≤ 100), validate positive ints; unknown IDs in map return empty arrays; list with invalid single `?department` returns 400.
    - Audit: on add/remove, write an `AdminAuditLog` entry including actor and details (before/after where applicable).

9. Prompt: Add `?department=<id>` to existing `/core/project_roles/` GET
   - If `department` is provided and valid, return only that department’s configured roles as `string[]` (names, sorted). Otherwise preserve current union behavior and response shape. Do NOT change this endpoint’s shape. When the feature flag is OFF (see Phase 8), ignore the `department` filter and return the current union.

10. Prompt: Tests for core endpoints
    - Add tests under `backend/core/tests/test_department_project_roles.py` to cover:
      - Model uniqueness and CASCADE behavior
      - GET map with multiple departments (object shape `{ id, name }` and sorted)
      - GET list by department (object shape)
      - POST add mapping idempotency (returns 200 if already exists) and case normalization
      - DELETE mapping happy path and 404 for missing
      - Permissions: only admins can mutate
      - `/core/project_roles/?department=` returns a dept-only subset as `string[]`, and unchanged behavior without the filter; verify flag OFF ignores the filter

Acceptance:
- All new endpoints pass tests. Existing `/core/project_roles/` behavior unchanged when no `department` is specified.

Optional backend optimization (reduce frontend N+1):
- In `backend/assignments/serializers.py`, add `personDepartment = serializers.IntegerField(source='person.department_id', read_only=True)` and include it in `fields`. This allows grids to construct `deptIds` without per-person GETs.

## Phase 3 — Frontend API Layer and Hooks

11. Prompt: Add frontend service for department project roles
    - In `frontend/src/services/api.ts`, add `deptProjectRolesApi`:
      - `map(departmentIds: number[]): Promise<Record<number, Array<{ id: number; name: string }>>>`
      - `list(departmentId: number): Promise<Array<{ id: number; name: string }>>`
      - `add(departmentId: number, name: string): Promise<void>` (admin only)
      - `remove(departmentId: number, roleId: number): Promise<void>` (admin only)
    - Wire to new backend endpoints with proper auth headers. Add defensive parsing and `ApiError` usage. Keep existing `projectRolesApi.list()` contract unchanged (`string[]`).

12. Prompt: Add React hooks with react-query
    - Create `frontend/src/hooks/useDeptProjectRoles.ts` with:
      - `useDeptProjectRolesMap(deptIds: number[])` returning `{ data: Record<number, Array<{ id: number; name: string }>>, isLoading, error, refetch }`
      - `useDeptProjectRoles(deptId: number)` for single fetch when needed
    - Cache by stable keys and a sensible `staleTime` (e.g., 60s); merge results across calls; do not trigger N calls per person—prefer the map endpoint. Invalidate map and single-dept queries on Settings mutations.

Acceptance:
- Type-safe APIs; hooks return empty maps/arrays gracefully; no network storm under typical grid loads.
 - Until OpenAPI schema for new endpoints is regenerated, call them via `apiClient` string paths.

## Phase 4 — Settings UI (Admin)

13. Prompt: Implement Department Project Roles section
    - Add `frontend/src/components/settings/DepartmentProjectRolesSection.tsx`:
      - Department selector (from `departmentsApi.listAll`) with search.
      - Show current roles as removable chips (require role IDs); input to add role name; “Add” button; `Enter` inserts.
      - Uses `deptProjectRolesApi` and hooks; shows loading/error states; a refresh button.
      - Read-only when not admin (disable inputs; show info).
    - Keep styles/accessibility consistent with `ProjectRolesSection`.
    - When capability is OFF, show a small banner explaining how to enable the feature flag; keep section hidden for non-admins.
    - Optional admin tools: CSV import/export for mappings and a bulk action to copy roles from one department to another.

14. Prompt: Surface section on Settings page
    - In `frontend/src/pages/Settings/Settings.tsx`, below existing “Project Roles” catalog, add `DepartmentProjectRolesSection`. Add internal anchor in quick navigation.

15. Prompt: Frontend tests for settings section
    - Add `frontend/src/pages/Settings/__tests__/departmentProjectRoles.test.tsx` covering:
      - Load departments and roles
      - Add/remove role mapping flows
      - Disabled behavior for non-admin
      - Error state rendering

Acceptance:
- Admins can manage roles per department from Settings. Non-admins view-only. UX parity with existing sections.

## Phase 5 — Assignments Grid Integration

16. Prompt: Extend person meta to include department id (Project Assignments)
    - In `frontend/src/pages/Assignments/ProjectAssignmentsGrid.tsx`:
      - When populating `personMetaById`, also store `departmentId` (from `peopleApi.get`). Update typing accordingly and avoid extra lookups.
      - Build `deptIds` set from visible assignments’ persons.
      - Use `useDeptProjectRolesMap(deptIds)` to fetch department→roles mapping.

17. Prompt: Replace free-text role editor with strict dropdown (Project Assignments)
    - Gate behavior by `projectRolesByDepartment` capability: when OFF, preserve legacy free-text/autocomplete; when ON, enforce dropdown-only and remove blur-saves.
    - In `ProjectAssignmentsGrid.tsx`, replace the editable `<input>` for role with a button→dropdown pattern:
      - On click, render a dropdown listing roles from `map[personDeptId]`. Use a portal or adequate z-index to avoid clipping inside scroll containers.
      - Keyboard support: Up/Down to navigate, Enter to select, Esc to close. Focus management preserved. Use ARIA button+menu roles.
      - If no roles configured: show a disabled menu item “No roles configured for this department”. If user is admin, include a “Manage roles…” link to Settings.
      - On selection, call existing `assignmentsApi.update(assignmentId, { roleOnProject })`, update local state, and close.
      - Provide an in-dropdown search filter; limit visible items and use virtualization for long lists.
      - Include a contextual "Refresh roles" control near the editor to refetch mappings on demand.
    - Remove free-entry behavior entirely; do not save on blur; only save on explicit selection or Enter.
    - Null-department or fetch-failure policy: when `person.department` is null or mapping fetch fails, show a disabled dropdown with helper text and tooltip. When the feature flag is OFF, fall back to legacy union autocomplete behavior (see Phase 8) for continuity.

18. Prompt: Assignments Grid parity
    - Apply the same dropdown-only interaction in `frontend/src/pages/Assignments/AssignmentGrid.tsx`:
      - Build `deptIds` from `people` array; use the same hook to fetch the map once.
      - For each assignment row, compute options from `map[person.department]`. Render dropdown per row with the same behavior as above, including no free-text and no blur-saves.
      - Ensure virtualization or long lists are handled (limit visible items, scrollable menu).

19. Prompt: Accessibility and UX polish
    - Ensure ARIA roles and focus outlines are correct; dropdown closes on outside click and on blur with small delay to allow click.
    - Maintain consistent text sizes and colors with existing components.

Acceptance:
- Clicking a project role field shows only department-appropriate options in a dropdown. Selections persist via API. No free text entry.
- For null-department persons, UI shows a clear disabled state and guidance (with admin link), or legacy behavior when the feature flag is OFF.

## Phase 6 — Frontend Tests for Grids

20. Prompt: Unit/integration tests (React Testing Library)
    - `frontend/src/pages/Assignments/__tests__/roleDropdown.assignmentGrid.test.tsx`
      - Mocks: map endpoint returns different roles for two departments.
      - Assert: clicking role field opens dropdown with correct dept options; selecting updates UI and triggers API call.
      - Edge: person without department → dropdown shows “No roles configured”.
    - `frontend/src/pages/Assignments/__tests__/roleDropdown.projectAssignmentsGrid.test.tsx` with analogous coverage.
    - Legacy non-mapped role display: ensure existing arbitrary strings still render as text until changed, but are not offered as options until admins add mappings.
    - Concurrency/idempotency (backend): two concurrent POSTs for the same mapping result in one create; the other returns 200. DELETE non-existent mapping returns 404; delete then re-POST succeeds.
    - Caching (backend): verify ETag/Last-Modified and 304 flows on map/list endpoints.
    - Hook behavior (frontend): map hook respects `staleTime`, performs at most one retry with jitter, and invalidates after mutations without refetch storms.
    - Edge cases: unknown `department_ids` in map return empty arrays; list with invalid `?department` returns 400; person department change shows old value until edited, then offers new department options.

21. Prompt: Playwright e2e happy path (optional but recommended)
    - Scenario: open Assignments, pick person A (Dept X), open role dropdown, select role, assert updated chip/text. Repeat for person B (Dept Y) shows different set.

Acceptance:
- Tests verify department-conditional dropdown behavior and persistence.
 - TypeScript type check and frontend build pass after edits (validate in CI or locally as part of completion).

## Phase 7 — Data Migration and Seeding (Optional, Non-Blocking)

22. Prompt: Seed initial mappings to reduce empty states
    - Management command: derive per-department role candidates from recent assignments (e.g., last N weeks) and/or from `ProjectRole` names; optionally seed all roles to all departments as a default baseline.
    - Mark as manual-run. Document in `PRODUCTION.md` how to seed.
    - Optional admin tools: bulk copy roles from one department to another; CSV import/export of department-role mappings.
    - Data hygiene: provide a one-time cleanup script/checklist to unify existing free-text role strings (trim/collapse spaces, normalize casing) before seeding mappings.

Acceptance:
- Operators can bootstrap mappings to avoid empty dropdowns post-deploy.

## Phase 8 — Docs and Rollout

23. Prompt: Update documentation
    - Add short admin guide to Settings usage in `docs/` and a note in `prompts/KNOWN-ISSUES.md` about fallback behavior when a person’s department lacks mappings.

    - Include a behavior matrix covering flag ON/OFF, null-department handling, and legacy free-text vs dropdown options.
    - Add rollback steps: how to safely disable the feature flag and what UI changes occur; confirm no data loss.
24. Prompt: Feature flag and rollout
    - Introduce `FEATURES.PROJECT_ROLES_BY_DEPARTMENT` in backend settings and advertise via `/api/capabilities/`. Define explicit behavior:
      - OFF: No behavior change. `/core/project_roles/` ignores `?department=` and returns union `string[]`. Frontend grids use legacy union-derived autocomplete and free-text if currently present. Settings section hidden.
      - ON: Backend honors `?department=` and serves mapping endpoints. Frontend grids switch to dropdown-only department-scoped options and remove free text/blur saves. Settings section visible to admins.
 
25. Prompt: Observability (optional)
    - Add lightweight counters/logs for map/list calls and mutation events; log warnings when `department_ids` includes unknown IDs.
 
Acceptance:
- Clear operator path to enable/disable and communicate behavior.

Implementation Prompts (Copy-Paste Friendly)

// Phase 1 — Backend model
- Implement a `DepartmentProjectRole` model in `backend/core/models.py` with `department`, `project_role`, `is_active`, timestamps, and unique constraint on the pair. Generate a migration. Keep changes minimal and self-contained. Do not modify unrelated models.

// Phase 2 — Backend endpoints (response shapes)
- Add routes in `backend/core/urls.py` and implement APIViews in `backend/core/views.py` for:
  - `GET /core/department_project_roles/map/?department_ids=1,2,3` → `{ [deptId]: Array<{ id: number; name: string }> }` sorted case-insensitively (in DB).
  - `GET /core/department_project_roles/?department=<id>` → `Array<{ id: number; name: string }>`.
  - `POST /core/department_project_roles/` with body `{ department: number, name: string }` → create mapping; admin-only.
  - `DELETE /core/department_project_roles/{department}/{role_id}/` → remove mapping; admin-only.
  - Extend `/core/project_roles/` GET to support `?department=<id>` returning that department’s names as `string[]`; union behavior otherwise; do not change shape. Include tests for permission and error paths. No N+1.
  - Normalize names on POST (trim, collapse repeated spaces, lower key); disallow control characters; enforce max length; ensure idempotency (200 when mapping exists). Use `select_related` to avoid N+1 and case-insensitive sort at DB.
  - Feature-gated `/core/project_roles/` behavior: Flag OFF ignores `?department` and returns union `roles: string[]`; Flag ON returns dept-scoped names under `roles` when param is present, union otherwise.
  - Permissions: `IsAuthenticated` for GET; `[IsAuthenticated, IsAdminUser]` for POST/DELETE.
  - Optional: enforce department-scope access policy for non-admins, if required by organizational rules.
  - Optional: expose `personDepartment` from assignments serializer to reduce frontend N+1.
  - Transactions/idempotency: wrap POST in a DB transaction; on unique constraint `IntegrityError`, treat as idempotent and return 200 with existing mapping.
  - Caching: include ETag/Last-Modified; honor `If-None-Match` for 304 on map/list.
  - Throttling: apply DRF `ScopedRateThrottle` (e.g., `department_roles_map`, `department_roles_mutate`) and add rates in settings.
  - Input limits: cap `department_ids` count (e.g., 100), validate positive ints; unknown IDs in map → empty arrays; invalid single `?department` in list → 400.
  - Audit logging: on add/remove, create `AdminAuditLog` with actor and details.

// Phase 3 — Frontend service and hooks
- In `frontend/src/services/api.ts`, add `deptProjectRolesApi` (map/list/add/remove) returning `{ id, name }` objects. Create `frontend/src/hooks/useDeptProjectRoles.ts` with map and single-department hooks using react-query, batching department ids to avoid N+1. Validate empty/failure cases gracefully. Invalidate map queries after Settings changes.

// Phase 4 — Settings UI
- Add `frontend/src/components/settings/DepartmentProjectRolesSection.tsx` with department selector, role chips, add/remove controls, admin gating, refresh, and friendly empty states. Mount in `frontend/src/pages/Settings/Settings.tsx` below Project Roles catalog, update quick-links. Gate by `projectRolesByDepartment` capability.

// Phase 5 — Grids integration
- In `ProjectAssignmentsGrid.tsx`, extend person meta to include `departmentId`. Fetch department→roles map via the new hook. Replace the role editor input with a dropdown listing only that department’s roles. Preserve keyboard navigation and accessibility. Use a portal or z-index to avoid clipping. Mirror changes to `AssignmentGrid.tsx`. No free-text entry; remove blur-based auto-save.

// Phase 6 — Tests
- Add backend tests for all new endpoints and department-param behavior on `/core/project_roles/`. Add frontend tests for settings and for both grids verifying department-conditional dropdowns. Optionally add Playwright e2e for happy path.

Risks and Mitigations

 - Empty mappings produce no menu options: mitigate by clear messaging and quick Settings link for admins; optional seeding tool.
 - N+1 on grids: avoided by batched `map` endpoint and caching; optionally expose `personDepartment` from assignments API to eliminate per-person lookups.
 - Permissions drift: mutations gated to admins; GET for authenticated users; explicitly override default permission on mutation views.
 - Rollout/rollback: feature flag and capability preserve legacy behavior when OFF; UI gated to avoid partial activation.
 - OpenAPI/types drift: annotate endpoints and regenerate schema after backend stabilizes; in the interim, call endpoints via `apiClient` string paths.
  - Concurrency: idempotent POST with unique constraint and transaction guards prevents duplicate mappings under race.
  - Load shedding: ETag/304 and ScopedRateThrottle on map/mutate endpoints limit server load during grid usage.

Success Criteria

- Assignments and Project Assignments show dropdown-only project roles constrained by person.department.
- Admins manage per-department roles in Settings smoothly.
- Tests cover API behavior and critical UI flows.
- No regressions in unrelated functionality.
