# Project Roles by Department — Usage Notes

This document summarizes the contract for department‑scoped Project Roles across the API and UI.

## Data Model

- Single source of truth: `projects.ProjectRole`
  - Fields: `id`, `name`, `normalized_name`, `department(FK)`, `is_active`, `sort_order`, timestamps
  - Uniqueness: per‑department on `(department_id, normalized_name)`
  - Composite uniqueness: `(id, department_id)` to enable composite FK checks from Assignments
  - Soft hide: set `is_active=false` to remove from selectors while preserving history

- Assignment linkage
  - `assignments.Assignment.role_on_project_ref` (FK → `projects.ProjectRole`, `on_delete=PROTECT`)
  - Denormalized `assignments.Assignment.department` is populated from `person.department`
  - App‑level validation rejects cross‑department role updates with `role_department_mismatch`
  - DB‑level enforcement via Postgres trigger guards `(role_on_project_ref.department_id == assignment.department_id)`

## API Contract

- Assignment payload/response (no legacy string exposure)
  - `roleOnProjectId?: number | null`
  - `roleName?: string | null` (read‑only from FK)

- Project Roles endpoints
  - `GET /api/projects/project-roles/?department=<id>[&include_inactive=true]` → array of roles
    - Default sort: `is_active DESC, sort_order ASC, name ASC`
    - `include_inactive=true` returns both active and inactive
  - `POST /api/projects/project-roles/` (admin)
    - Body: `{ department: number, name: string, sortOrder?: number }`
    - Normalization applied; conflicts return `409`
  - `PATCH /api/projects/project-roles/{id}/` (admin)
    - Fields: `name?`, `isActive?`, `sortOrder?` (normalized uniqueness enforced)
  - `DELETE /api/projects/project-roles/{id}/` (admin)
    - Soft‑delete behavior: sets `is_active=false` to preserve history

- Assignment updates
  - Only `roleOnProjectId` is accepted; cross‑department values return `422` with `{ roleOnProjectId: 'role_department_mismatch' }`

## Frontend Usage

- Selectors
  - Query key pattern: `['projectRoles', departmentId]`
  - Use strict dropdowns; no free‑text entry
  - Default shows active roles; Settings may request `includeInactive=true`

- Settings UI
  - Admin‑only CRUD for roles per department
  - Optimistic mutations with React Query invalidations for `projectRoles`

## Import & Backfill

- Import roles (idempotent)
  - CSV: `prompts/roles-import.csv` with `department_id,role_name,sort_order`
  - `python manage.py import_project_roles prompts/roles-import.csv --dry-run`
  - `python manage.py import_project_roles prompts/roles-import.csv`

- Backfill Assignment FK from legacy strings
  - `python manage.py backfill_assignment_roles`
  - Joins normalized legacy strings to departmental roles

- Fix common typos before backfill (optional)
  - `python manage.py fix_legacy_role_typos --dry-run`
  - `python manage.py fix_legacy_role_typos`

- Migration report
  - `python manage.py generate_roles_migration_report`
  - Output: `prompts/roles-migration-report.txt` (counts, per‑department stats, unmatched strings)

## Error Codes & Behavior

- `409 conflict`: creating/updating a role to a name that conflicts (post‑normalization) within the same department
- `422 role_department_mismatch`: assignment update with a role from a different department

## Deletion Policy

- `on_delete=PROTECT` prevents deleting a role referenced by assignments
- UI/API use soft‑delete (`is_active=false`) to remove from menus while preserving history

## Notes

- Roles are not auto‑created by assignments. Use the importer or Settings to create new roles.
- Keep names short and consistent; normalization collapses whitespace and lowercases for uniqueness.

