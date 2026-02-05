# Verticals Plan

## Summary
Add a first-class Vertical entity. Verticals are managed in Settings, and each Department and Project is assigned to exactly one Vertical. People inherit their Vertical from their Department (or have no Vertical if no Department). Introduce a global Vertical filter that scopes all pages (people, projects, departments, assignments, reports, dashboard) to a single Vertical, independent of the existing Department filter. All filtering should be server-side and paginated where applicable (no client-side filtering).

## Requirements (Confirmed)
- Projects are assigned to a Vertical directly (not inferred from assignments).
- New project creation includes a Vertical dropdown.
- Verticals are predefined and managed in the Settings menu.
- Departments are assigned to a Vertical.
- People inherit Vertical from their Department (no separate vertical field).

## Data Model
- New `Vertical` model with fields: `name`, `short_name`, `description`, `is_active`, `created_at`, `updated_at`.
- Add `vertical` FK to:
  - `Department` (`backend/departments/models.py`)
  - `Project` (`backend/projects/models.py`)
- Department hierarchy rules:
  - Children departments inherit the vertical of their parent.
  - Enforce `Department.parent_department.vertical == Department.vertical`.
- Person vertical is derived (no separate FK):
  - If `Person.department` is set, `Person.vertical` is `Person.department.vertical`.
  - If `Person.department` is null, `Person.vertical` is null.

## Backend API Changes
- Add `VerticalViewSet` (CRUD) and expose at `/api/verticals/`.
- Update serializers to include `vertical` fields and related display names where needed.
  - `DepartmentSerializer` add `vertical` and `verticalName`.
  - `Person` serializers add derived `vertical` and `verticalName` (read-only). Ignore/reject `vertical` in write payloads.
  - `ProjectSerializer` add `vertical` and `verticalName`.
- Extend list endpoints to accept `vertical=<id>` and apply filtering.
  - `people` endpoints filter `department__vertical_id` and exclude people with no department when vertical is selected.
  - `projects` endpoints filter `project.vertical_id`.
  - `departments` endpoints filter `department.vertical_id`.
  - `assignments` endpoints should be filtered by project.vertical (see scope rules below).
- Add `vertical` to snapshot endpoints, analytics, dashboard data, and any server-side cache keys or ETags.
- Project import/export: add vertical mapping and validation.
- Department import/export must include vertical; Person import uses department mapping (vertical derived).
- Rename GET people typeahead endpoint to `/people/typeahead/` (or similar) to keep POST `/people/search/` for full server-side filtering.
- People search/list endpoints must support `vertical` + `department_filters` (AND/OR/NOT) if the UI continues to expose multi-select/global department filters.
- Add People filter metadata endpoint for distinct locations and departments within a vertical (used to build filter UIs without client-side scanning).

## Scope Rules (Backend)
- Global Vertical filter limits:
  - People: `person.department.vertical_id == selected_vertical`.
  - Departments: `department.vertical_id == selected_vertical`.
  - Projects: `project.vertical_id == selected_vertical`.
  - Assignments: include rows where the project vertical matches the selected vertical.
- Department filter remains as-is but operates only within the selected Vertical:
  - `effective_dept_ids = dept_filter_ids ∩ vertical_dept_ids`.

## Frontend UI Changes
- Add global Vertical filter store with URL + localStorage persistence (similar to `departmentFilter`).
- Add `GlobalVerticalFilter` component and mount in top bar next to department filter.
- Department picker options are scoped to the selected Vertical.
- New dropdowns:
  - Project create/edit form: vertical selector (required).
  - Department edit form: vertical selector (required).
- Person edit form: no vertical selector; show derived vertical if useful.
- Settings menu: new Vertical management section (list/add/edit/deactivate).

## Frontend Data Flow
- Add `vertical` param support across API clients and hooks.
- Ensure query keys include `vertical` to avoid cache bleed (departments list, people list, assignments grid/list, projects list, dashboard metrics, analytics).
- Avoid client-side filtering for vertical/department scoping; use server-side filters and paginated responses.
- Migrate People list and Assignments list/grid to server-side filtering:
  - People: use POST `/people/search` with `vertical`, `department_filters`, `location`, `ordering`, and `search_tokens`.
  - Assignments: use POST `/assignments/search` with `vertical` (project vertical) and existing filters.
- Pages to update for scoping:
  - People list
  - Projects list
  - Assignments grid/list
  - Dashboard
  - Reports/analytics

## Data Migration and Backfill
- Migration 1: create `Vertical` model and add nullable FK columns.
- One-time backfill strategy:
  - Create verticals (manual or fixture).
  - Assign each department to a vertical.
  - Backfill projects vertical based on a mapping table or manual assignment.
  - Backfill assignments missing `project_id` (or explicitly exclude them when vertical is selected).
- Migration 2: enforce NOT NULL for `Department.vertical` and `Project.vertical` once data is clean (or explicitly allow legacy nulls if desired).
- Add admin or management command to do the backfill safely in prod.

## Tests and QA
- Backend tests for:
  - Vertical filtering on people/projects/departments.
  - Vertical + department filter intersection.
  - Validation for person vertical vs department vertical.
- Frontend QA checklist:
  - Top bar vertical filter scopes all pages.
  - Department dropdowns only show departments in the selected vertical.
  - Project creation requires vertical selection.
  - Settings menu vertical CRUD works end-to-end.

## Additional Backend Notes
- Enforce `Department.parent_department.vertical == Department.vertical` on create/update. If parent is set, child vertical is forced to parent vertical.
- When a vertical is selected, records with null vertical (or people without department) are excluded.
- Assignments list/snapshots should `select_related('project')` and ensure indexes support `project__vertical_id` filtering.

## Open Decisions
- Whether vertical is required on historical records (or allow null for legacy).
