# Project Roles By Department - End-to-End Implementation Plan (Revised)

This plan departmentalizes Project Roles and integrates them across Settings, Assignments (people-centric), and Project Assignments (project-centric). Steps are prescriptive prompts that can be re-fed to the AI agent. The plan removes legacy string roles completely. Assignments reference a department-scoped `ProjectRole` by FK only - no legacy string fields are exposed at any stage.

Lean principles for every step:
- Keep code small, cohesive, and testable; avoid speculative abstractions.
- Prefer explicit types and clear prop contracts; no hidden globals or ad-hoc eventing.
- Do not "just get it to work"; fix at the correct layer.
- Maintain stable query keys and public APIs unless explicitly changed by the plan.

---

## Code Organization & File Layout (Helpers First)

Guideline: prefer small, reusable helpers in focused files. No component or hook should exceed ~200 LOC. Keep cross-cutting helpers in feature folders.

- Backend
  - `projects/models.py` - ProjectRole model (single class only).
  - `projects/serializers/roles.py` - DRF serializers for roles.
  - `projects/selectors/roles.py` - read-only query helpers (by-department list, resolve-by-name).
  - `projects/services/roles.py` - non-DB pure helpers (normalization, validation) and orchestration for bulk operations.
  - `projects/views/roles.py` - viewset or APIViews for role CRUD (thin; call selectors/services).
  - `projects/validators/roles.py` - department/uniqueness validation helpers.
  - `projects/management/commands/import_project_roles.py` - pre-seed importer reading `prompts/roles-import.csv`.
  - `assignments/serializers/assignment_role.py` - serializer mixins for `roleOnProjectId`/`roleName` shaping.
  - `assignments/services/assignment_role.py` - validate FK belongs to person.department; resolve label.

- Frontend
  - `frontend/src/roles/api.ts` - typed wrappers for `/api/project-roles` endpoints (list by department, CRUD).
  - `frontend/src/roles/constants.ts` - query keys and friendly labels (e.g., `ROLE_QUERY_KEY = 'projectRoles'`).
  - `frontend/src/roles/utils/roleDisplay.ts` - `resolveRoleDisplay(assignment): string | ''` using `roleName` only.
  - `frontend/src/roles/components/RoleLine.tsx` - presentational role line/button under the project name.
  - `frontend/src/roles/components/RoleDropdown.tsx` - presentational dropdown list; keyboard + aria; no data hooks.
  - `frontend/src/roles/hooks/useProjectRoles.ts` - department-scoped fetcher (wrap or replace current hook).
  - `frontend/src/pages/Assignments/grid/useAssignmentRoleUpdate.ts` - mutation hook to update a role FK for an assignment (optimistic update + rollback).

These helpers should be introduced in the steps below rather than growing existing large files. Reuse the same RoleLine/RoleDropdown on both Assignments and Project Assignments pages.

---

## Phase 0 - Analysis & Baseline

1) Prompt: Analyze current roles usage and seams (read-only)
- Inspect files referencing project roles, assignment roles, Settings, and API services.
- Identify current role fields on Assignment and where role is rendered (Assignments, Projects pages).
- Output: notes in `prompts/roles-baseline.txt` listing files, query keys, and gaps.

2) Prompt: Capture state and API baseline (read-only)
- Confirm any existing role endpoints and whether they accept department filters.
- Document current shapes in `frontend/src/api/schema.ts` for role-related fields.
- Enumerate legacy role strings per department and write `prompts/roles-import.csv` (department_id, role_name).

---

## Phase 1 - Backend Modeling (Departmentalized Project Roles)

1) Prompt: Add ProjectRole model scoped by Department
- Create `projects/models.py` class `ProjectRole(id, name, department(FK), is_active, sort_order, created_at, updated_at)`.
- Case-insensitive uniqueness: prefer Postgres `CITEXT` for `name` or add a `normalized_name` column (trim, collapse whitespace, lowercase) with a unique index `(department_id, normalized_name)`.
- Ensure indexes on `(department_id, is_active, sort_order)` and FK indexes.
- Generate migrations (atomic), admin registration, and list filters by department.

2) Prompt: Selectors + Serializers + Permissions (separate files)
- Add selectors to list roles by department and resolve roles by normalized name within a department.
- Add serializers for list/create/update with trimming and normalization; enforce uniqueness via DB errors mapped to validation errors.
- Ensure write endpoints are permission-guarded (admin/capability).
 - File layout:
   - `projects/selectors/roles.py`, `projects/serializers/roles.py`, `projects/validators/roles.py`.

3) Prompt: API Endpoints for departmental roles (thin views)
- `GET /api/project-roles/?department=<id>` (required) to list roles for a department; small lists do not need pagination. Default sort: `is_active DESC, sort_order ASC, name ASC`. By default, return only active roles; allow `include_inactive=true` for admin/Settings screens.
- `POST /api/project-roles/`, `PATCH /api/project-roles/{id}`, `DELETE /api/project-roles/{id}`.
- Validate that all writes include an explicit `department` and respect uniqueness/normalization.
- For deletion, forbid hard delete if referenced; prefer soft-delete via `is_active=false`.
- Update OpenAPI docs with clear error responses (e.g., 409 uniqueness, 422 validation).
 - File layout: `projects/views/roles.py` (call selectors/services; no business logic inside views).

4) Prompt: Assignment-Role linkage (two-stage migration to remove legacy string)
- M1: Add nullable FK `roleOnProjectId` to Assignment (no legacy string fields exposed anywhere). If `Assignment` does not already store the owning department, add denormalized `department(FK)` to `Assignment` for DB-level enforcement.
- DB enforcement of department match:
  - Preferred: add composite FK `(role_on_project_id, department_id) REFERENCES project_role(id, department_id)` by making `(id, department_id)` UNIQUE on `ProjectRole`. This guarantees `assignment.department_id == project_role.department_id`.
  - Alternative: add a DB trigger to enforce the same rule if composite FK is not viable.
- Add `on_delete=PROTECT` for `Assignment.role_on_project` to prevent deleting referenced roles. Use `is_active=false` to hide deprecated roles from UI while preserving history.
- M2: After backfill and FE rollout, drop any legacy string column from the DB.

---

## Phase 2 - Frontend Foundation

1) Prompt: Client scaffolding
- Add `frontend/src/roles/api.ts` with typed wrappers for role endpoints and consistent error handling.
- Add `frontend/src/roles/constants.ts` with query keys; use `['projectRoles', departmentId]` as the key shape.
- Add `frontend/src/roles/utils/roleDisplay.ts` to resolve `roleName` for rendering.

2) Prompt: Hooks & components
- Add `frontend/src/roles/hooks/useProjectRoles.ts` to fetch per-department roles, defaulting to active only; support `includeInactive` for Settings.
- Add presentational components `RoleLine.tsx` and `RoleDropdown.tsx` (ARIA listbox, keyboard navigation; no data hooks inside).
- Add `useAssignmentRoleUpdate.ts` for optimistic mutation with rollback and cache invalidation (Assignments + Project Assignments).

---

## Phase 3 - Settings UI

1) Prompt: Department-specific role manager
- Filter by currently selected department (reuse GlobalDepartmentFilter).
- Show list and CRUD actions. Default to active roles; allow toggle to include inactive.
- Allow toggling `is_active` and ordering via `sort_order`.

---

## Phase 4 - Assignments & Project Assignments UI

1) Prompt: Assignment role display and edit
- Render the role under the project name (light gray, concise). Use `roleName` from the API.
- Clicking opens a dropdown of roles from `useProjectRoles(person.departmentId)`.
- Selecting a role calls assignment update with `roleOnProjectId`.
- Provide a "Clear role" option to set `roleOnProjectId = null` if allowed.
- Use optimistic UI with safe rollback; invalidate both Assignments and Project Assignments caches on settle.

---

## Phase 5 - API Schema & Client Sync

1) Prompt: OpenAPI regeneration (M1 then M2)
- M1: Regenerate `openapi.json` to include `roleOnProjectId?: number | null` and `roleName?: string | null`. No legacy string fields exposed.
- Update `frontend/src/api/schema.ts` via the existing script before FE code changes that use new fields.
- M2: After dropping the string column, regenerate again to confirm no string fields remain.

2) Prompt: Services and type updates
- Update FE services to support department-scoped role endpoints and assignment updates with FK, and to sort/filter as per API defaults.
- Keep call sites typed and minimal.

---

## Phase 6 - Migration & Backfill Execution

1) Prompt: Data migration plan (FK-only end-state)
- Execute M1 migration (add FK) and run pre-seed importer to create department roles from discovered strings.
- Importer must be idempotent and support `--dry-run`: normalize inputs (trim, collapse whitespace, lowercase), upsert by `(department_id, normalized_name)`, and no-op on repeats.
- Backfill `roleOnProjectId` efficiently (SQL `UPDATE ... FROM` join on normalized names), batching by department to limit locks.
- Produce `prompts/roles-migration-report.txt` with created roles, mapped assignments, and unmatched.
- Execute M2 migration to drop the legacy string column once FE/BE M1 are deployed.
 - Ensure importer lives at `projects/management/commands/import_project_roles.py` and pure normalization lives in `projects/services/roles.py`.

2) Prompt: Controlled creation (pre-seed only)
- Do not auto-create roles via assignment update endpoints. Only the pre-seed importer may create roles from the discovered map.
- Reject cross-department FK updates with a clear 422 error and code (e.g., `role_department_mismatch`).

---

## Phase 7 - End-to-End Testing & Verification

1) Prompt: Backend tests (run)
- Unit/API tests for:
  - Case-insensitive uniqueness and normalization.
  - Cross-department assignment rejection (composite FK or trigger enforcement).
  - Delete restriction when referenced (`PROTECT`) and soft-delete behavior in selectors (inactive filtered by default).
  - Selector default sorting and `include_inactive` behavior.
- Verify OpenAPI contains new fields only.

2) Prompt: Frontend tests (run)
- Build FE and run unit/UI tests for Settings, Assignments, and Project Assignments.
- Add tests for:
  - Dropdown ARIA and keyboard navigation.
  - Optimistic update with rollback on error; cache invalidation for both Assignments and Project Assignments.
  - Department switch invalidates and reloads the correct role list.
- Manual smoke:
  - Switch departments in Settings; create/edit/remove roles; verify list updates.
  - On Assignments, open role dropdown; only department roles show; select role; verify persisted.
  - On Project Assignments, same behavior.
  - Confirm no path reads or writes legacy string roles.

3) Prompt: Docker/dev integration
- Rebuild containers; ensure ESLint v9 + import-x; no peer-deps workarounds.
- For Postgres, enable `citext` extension when using CITEXT, or fallback to `normalized_name` strategy for dev/SQLite.

---

## Phase 8 - Rollout & Cleanup

1) Prompt: Feature toggle (optional)
- If needed, gate role editing until all departments are populated with roles.

2) Prompt: Remove legacy string completely (final)
- After M2, confirm DB column removed; OpenAPI reflects FK-only; FE uses `roleOnProjectId` and `roleName` only.

3) Prompt: Documentation
- Add `prompts/ROLE-USAGE-NOTES.md` describing the backend/FE contract and examples.

4) Prompt: Observability & Metrics
- Add basic metrics and logs: number of assignments without FK post-backfill, number of role updates per department, cross-department rejects (4xx), and any 5xx on role endpoints.
- Define gating criteria (e.g., <0.5% assignments without FK after backfill) before proceeding from M1 to M2.

---

## Appendices - Concrete Step Prompts

Copy/paste any step below into the AI agent to execute it in isolation.

### A1) Backend: Add ProjectRole model + migration
Implement `ProjectRole` with fields: `name (str)`, `department (FK)`, `is_active (bool, default True)`, `sort_order (int, default 0)`, timestamps. Use either `CITEXT` for `name` or a `normalized_name` column and add a unique index `(department_id, normalized_name)`. Generate a migration and admin registration. Add indexes for `(department_id, is_active, sort_order)`.

### A2) Backend: Departmental role endpoints
Add endpoints: `GET /api/project-roles/?department=<id>` (required) for list; `POST`/`PATCH`/`DELETE` with validation. Default list shows `is_active=true`, sorted by `is_active DESC, sort_order ASC, name ASC`. Allow `include_inactive=true` for Settings. Write selectors and serializers. Update OpenAPI with 409 uniqueness and 422 validation responses.

### A3) Backend: Assignment role FK and backfill (no legacy string)
Add `roleOnProjectId` (FK ProjectRole, nullable) to Assignment. If needed, add denormalized `department(FK)` to Assignment. Enforce department match via composite FK `(role_on_project_id, department_id) REFERENCES project_role(id, department_id)` or a DB trigger. Pre-seed roles per department from discovered strings (idempotent importer with `--dry-run`). Data migration: set FK where matches exist; leave null otherwise. API responses include `roleOnProjectId` and `roleName`; no legacy string fields are exposed. Update assignment update service to accept FK; reject cross-department role IDs with 422.

### A4) Frontend: Hook `useProjectRoles(departmentId)`
Create or update a hook to fetch department roles: key `['projectRoles', departmentId]`, returns list plus create/remove/update helpers. No global caching across departments; keep it scoped. Support `includeInactive` option for Settings.

### A5) Settings UI: Department-specific role manager
Update the Settings roles section to filter by currently selected department (reuse GlobalDepartmentFilter). Show list and CRUD actions. Wire to `useProjectRoles`. Keep UI lean and accessible. Allow toggling `is_active` and reordering via `sort_order`.

### A6) Assignments UI: Render role under project + dropdown
In `ProjectCell`, render the role under the project name (light gray). Clicking it opens a dropdown of roles from `useProjectRoles(person.departmentId)`. Selecting a role calls assignment update with `roleOnProjectId`. Provide a "Clear role" option to set `roleOnProjectId = null` if allowed. Use optimistic UI with safe rollback and cache invalidation for both Assignments and Project Assignments.

### A7) Project Assignments UI: Same dropdown behavior
Mirror A6 on the project-centric page. Ensure the person's department dictates the role list.

### A8) Client types + API services
Regenerate API types; update services to support new role endpoints and assignment updates with FK, including sorting/filtering. Keep call sites minimal and typed.

### A9) Testing (backend + frontend)
Add unit tests for backend normalization/uniqueness, cross-department enforcement, delete restriction and inactive filtering, selectors sorting, and importer idempotency. Add frontend unit/UI tests for role display, dropdown selection, ARIA/keyboard, optimistic rollback, and cache invalidation. Run full build and docker rebuild without peer-deps flags.

