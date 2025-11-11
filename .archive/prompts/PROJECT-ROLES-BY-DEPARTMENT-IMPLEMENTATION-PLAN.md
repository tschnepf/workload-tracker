# Project Roles by Department - Implementation Plan (Aligned)

Goal

- Introduce department-scoped Project Roles managed by admins and used across Assignments and Project Assignments. Users select from a strict dropdown of roles available for the person’s department; no free-text entry. Eliminate legacy string usage for assignment role.

Preflight Decisions

- DB uniqueness: use a `normalized_name` column (trim, collapse whitespace, lowercase) with a unique index `(department_id, normalized_name)`. Avoids requiring the Postgres `citext` extension.
- DB enforcement: add denormalized `Assignment.department_id` (FK to `departments.Department`) and enforce department match with a composite FK `(role_on_project_id, department_id) -> project_role(id, department_id)` by making `(id, department_id)` unique on `ProjectRole`. If composite FK is not viable, use a DB trigger. Application code must also validate and return 422 with code `role_department_mismatch`.
- Deletion policy: `Assignment.role_on_project` uses `on_delete=PROTECT`. Use `ProjectRole.is_active=false` to soft-hide roles from UI while preserving history.
- Selector defaults: active-only by default; allow `include_inactive=true` for Settings screens. Sort `is_active DESC, sort_order ASC, name ASC`.
- API error codes: 409 for uniqueness violations; 422 for validation (e.g., department mismatch or invalid name).
- Legacy fields: remove legacy string fields from API responses and UI; assignments use `roleOnProjectId` and `roleName` only.

Scope Overview

- Backend (Django REST):
  - Add `projects.ProjectRole` with `name`, `normalized_name`, `department(FK)`, `is_active`, `sort_order`, timestamps; unique `(department_id, normalized_name)` and unique `(id, department_id)` to support composite FK from Assignment.
  - Add selectors/serializers/validators for list/create/update and normalization; thin views for CRUD endpoints; department-scoped listing; soft-delete semantics.
  - Add `role_on_project` FK on `assignments.Assignment` (nullable) and denormalized `department` on Assignment if not present.
  - Enforce department match at DB level (composite FK) and in application validation.
  - Management command importer for idempotent seeding and backfill.
  - OpenAPI updates and tests.
- Frontend (React/TS):
  - Add roles API wrappers and hooks with department-scoped query keys `['projectRoles', departmentId]`.
  - Settings UI to manage roles per department.
  - Update Assignments and Project Assignments grids to use strict dropdowns; optimistic updates with rollback.
- Testing: backend unit/API tests; frontend unit/integration; optional e2e smoke.

Principles

- Small, composable changes; single source of truth; no duplication; avoid N+1; defensive error handling; accessible keyboard navigation; tests-first on risky changes.

Editing Rules

- Use `apply_patch` for all file changes.
- Preserve formatting and existing line endings.
- Do not use shell writes to modify code.
- Avoid bulk regex replacements; submit minimal, contextual patches.
- After edits, run frontend type check/build to validate.
- Do not introduce shortcuts or band-aid fixes to satisfy tests.

Execution Discipline

- Work one phase at a time; do not start the next until the current is complete and validated.
- Before moving on each phase:
  - `docker compose build backend frontend`
  - `docker compose up -d backend frontend` or `docker compose restart backend frontend`
  - Backend tests: `docker compose exec backend pytest -q` (or `python manage.py test`)
  - Frontend: `cd frontend && npm ci && npm run build` and `npm run test`

Phases and Prescriptive Steps

## Phase 0 - Repo Inventory and Design

1. Inventory role selection logic in grids
   - Read `frontend/src/pages/Assignments/AssignmentGrid.tsx` and the project-centric grid to locate current project-role UI and display.

2. Confirm Assignment model and legacy fields
   - Read `backend/assignments/models.py` and confirm `role_on_project` exists as legacy string and that `Assignment` lacks a `department` FK. Confirm `Person.department` exists (`backend/people/models.py`).

3. Design note
   - Add a short design note in the new backend views describing endpoints, validation, sorting, and department enforcement.

4. Feature flag and capability (confirm existing)
   - `FEATURES.PROJECT_ROLES_BY_DEPARTMENT` exists in `backend/config/settings.py`. Advertise `projectRolesByDepartment` in `/api/capabilities/` and gate new UIs if desired.

## Phase 1 - Backend Data Model

5. Add `projects.ProjectRole`
   - Fields: `name`, `normalized_name`, `department(FK)`, `is_active` (default True), `sort_order` (default 0), timestamps.
   - Constraints: unique index on `(department_id, normalized_name)`; unique constraint on `(id, department_id)` to support composite FK from Assignment.
   - Indexes: `(department_id, is_active, sort_order)` and FK indexes.
   - Admin: register model with department filter and search on `name`.

6. Add denormalized department + role FK on Assignment
   - Add `department(FK)` on `assignments.Assignment` if not present; backfill from `person.department_id` in a data migration.
   - Add nullable FK `role_on_project` to `projects.ProjectRole` with `on_delete=PROTECT`.
   - DB enforcement: add composite FK `(role_on_project_id, department_id)` referencing `ProjectRole (id, department_id)`.

## Phase 2 - Backend Endpoints

7. Departmental role endpoints
   - `GET /api/project-roles/?department=<id>` (required): list active roles with default sort `is_active DESC, sort_order ASC, name ASC`; `include_inactive=true` returns all.
   - `POST /api/project-roles/`: create with normalization and uniqueness enforcement.
   - `PATCH /api/project-roles/{id}`: update `name`, `is_active`, `sort_order` (normalizing as needed).
   - `DELETE /api/project-roles/{id}`: forbid if referenced (PROTECT); otherwise soft-delete via `is_active=false` is preferred to preserve history.
   - Permissions: GET authenticated; POST/PATCH/DELETE admin-only.
   - OpenAPI: document 409 for uniqueness violations; 422 for validation errors.

8. Assignment update validation
   - Update service to accept only `roleOnProjectId` and reject cross-department role IDs with `422 role_department_mismatch`.

## Phase 3 - Frontend Foundation

9. Client scaffolding
   - `frontend/src/roles/api.ts`: typed wrappers for `/api/project-roles` endpoints.
   - `frontend/src/roles/constants.ts`: query keys; `['projectRoles', departmentId]`.
   - `frontend/src/roles/utils/roleDisplay.ts`: compute `roleName` from assignment data.

10. Hooks & components
   - `frontend/src/roles/hooks/useProjectRoles.ts`: fetch per-department roles; default active-only; option to include inactive for Settings.
   - `frontend/src/roles/components/RoleDropdown.tsx` and `RoleLine.tsx`: ARIA listbox; keyboard navigation; no data hooks inside.
   - `frontend/src/pages/Assignments/grid/useAssignmentRoleUpdate.ts`: optimistic mutation with rollback; invalidate Assignments and Project Assignments caches.

## Phase 4 - Settings UI

11. Department-specific role manager
   - Filter by selected department; CRUD; toggle `is_active`; adjust `sort_order`; reflect updates immediately.

## Phase 5 - Grids Integration

12. Assignment role display and edit
   - Render role under project name; dropdown shows only roles for `person.departmentId` via `useProjectRoles`.
   - Include “Clear role” to set `roleOnProjectId = null` if allowed.
   - Optimistic update with safe rollback; invalidate relevant caches.

## Phase 6 - API Schema & Client Sync

13. OpenAPI regeneration
   - Include `roleOnProjectId?: number | null` and `roleName?: string | null`. No legacy role string fields.
   - Update `frontend/src/api/schema.ts` via script.

14. Services and type updates
   - Ensure typed clients align with sorting/filtering behavior and error codes.

## Phase 7 - Migration & Backfill Execution

15. Importer and backfill
   - Management command `projects/management/commands/import_project_roles.py` reads `prompts/roles-import.csv` and seeds roles idempotently (upsert by `(department_id, normalized_name)`), with `--dry-run` support.
   - Data migration to backfill `Assignment.role_on_project_id` by joining normalized legacy strings to departmental roles; leave null when unmatched.
   - Write `prompts/roles-migration-report.txt` with created roles, mapped assignments, and unmatched.

16. Controlled creation
   - Do not auto-create roles from assignment updates; only importer may create.

## Phase 8 - Tests, Docs, Rollout

17. Backend tests
   - Normalization/uniqueness; cross-department enforcement (composite FK/trigger and service-level 422); delete restriction and inactive filtering; selector sorting; OpenAPI schema contains only new fields.

18. Frontend tests
   - Role dropdown ARIA/keyboard; optimistic rollback; cache invalidation; department switching; Settings CRUD behaviors.

19. Docs and rollout
   - Add `prompts/ROLE-USAGE-NOTES.md` documenting contract and examples.
   - Feature flag may gate UI exposure; ON to use FK-only role flows.

Acceptance

- Assignments and Project Assignments show dropdown-only project roles constrained by the person’s department. No free-text entry; no legacy string exposure. Admins manage per-department roles in Settings. Tests cover API and UI flows without regressions.

