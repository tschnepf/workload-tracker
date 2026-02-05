# Agent-Ready Implementation Plan: Verticals

**Goal**
Introduce a first-class Vertical entity. Departments and Projects belong to a Vertical. People inherit Vertical from their Department (or have none if no Department). Add a global Vertical filter that scopes all pages. All filtering is server-side and paginated where applicable.

**Non-Goals**
No client-side filtering for vertical or department scoping in People/Assignments/Projects pages. No inference of Project vertical from assignments.

**Key Rules**
Vertical is required for Department and Project after backfill. Person has no stored vertical. Person vertical is derived from Department. Child department must share the parent’s vertical.

## API Contracts (New/Changed)
**Verticals**
`GET /api/verticals/?all=true`
Response item:
```
{
  "id": number,
  "name": string,
  "shortName": string,
  "description": string,
  "isActive": boolean,
  "createdAt": string,
  "updatedAt": string
}
```
`POST /api/verticals/` accepts `name`, `shortName`, `description`, `isActive`.

**Departments**
`GET /api/departments/?vertical=<id>` returns only departments in that vertical.
Department payload adds `vertical` and `verticalName`.

**People**
`GET /api/people/?vertical=<id>` filters by `department__vertical_id` and excludes people without department when vertical is provided.
`POST /api/people/search/` accepts:
```
{
  "page": number,
  "page_size": number,
  "vertical": number,
  "department_filters": [{"departmentId": number, "op": "and|or|not"}],
  "location": [string],
  "ordering": string,
  "search_tokens": [{"term": string, "op": "and|or|not"}]
}
```
`GET /api/people/typeahead/?q=<term>&limit=<n>&vertical=<id>` returns id, name, department, roleName.
`GET /api/people/filters_metadata/?vertical=<id>` returns:
```
{
  "locations": [string],
  "departments": [{"id": number, "name": string}]
}
```
Person responses add derived `vertical` and `verticalName` (read-only). Person writes ignore `vertical` if provided.

**Projects**
Project payload adds `vertical` and `verticalName`. Project create/update requires `vertical` after backfill.

**Assignments**
All assignment list/search/snapshot endpoints accept `vertical=<id>` and filter by `project__vertical_id`. Legacy assignments without `project_id` are excluded when vertical is provided.

## Execution Order

### 1) Data Model and Migrations
1. Add `Vertical` model and app. Files: `backend/verticals/models.py`, `backend/verticals/apps.py`, `backend/verticals/migrations/0001_initial.py`.
2. Add `vertical` FK to `Department` and `Project`. Files: `backend/departments/models.py`, `backend/projects/models.py` plus migrations.
3. Register `verticals` app in `INSTALLED_APPS`.
3. Add validation to `Department.clean()` and serializer to enforce `parent_department.vertical == department.vertical`. If parent is set and vertical is missing, set it to parent’s vertical.
4. Add indexes on `department.vertical_id` and `project.vertical_id` where appropriate.
5. Update field registries used by validation/type generation: `backend/core/fields.py` for `DEPARTMENT_FIELDS` and `PROJECT_FIELDS` (add `vertical`). Run/adjust any type generation scripts if required.

### 2) Backend APIs
1. Add `VerticalSerializer` and `VerticalViewSet`. Files: `backend/verticals/serializers.py`, `backend/verticals/views.py`.
2. Register routes in API router. File: `backend/urls.py` or router module used for viewsets.
3. Update `DepartmentSerializer` and `DepartmentViewSet` to include `vertical`, `verticalName`, and filter by `vertical` query param.
4. Update `ProjectSerializer` and `ProjectViewSet` to include `vertical`, `verticalName`, validate required after backfill, and filter by `vertical` query param.
4.1 Update `projects/forms.py` import logic (and any import/export utilities) to include/validate `vertical`.
5. Update `PersonSerializer` to add read-only `vertical` and `verticalName` derived from `department`. Files: `backend/people/serializers.py`.
6. Update `PersonViewSet.list` and `PersonViewSet.search` to accept `vertical` and filter by `department__vertical_id`. Exclude people with no department when vertical is provided.
7. Rename GET people typeahead endpoint to `/people/typeahead/` and keep POST `/people/search/` for full filtering. Files: `backend/people/views.py`.
8. Add `department_filters` support to People list/search if UI keeps multi-select/global department filters. Reuse existing parsing logic from projects where possible.
9. Add `people/filters_metadata` endpoint for locations and departments within a vertical. File: `backend/people/views.py`.
10. Add `vertical` filtering to assignments list/search/snapshots, analytics, dashboard, and background tasks. Files include `backend/assignments/views.py`, `backend/assignments/analytics.py`, `backend/core/tasks.py`, `backend/dashboard/views.py`.
11. Update OpenAPI docs (and regenerate `backend/openapi.json` if that is source-controlled) to include new params/fields.

### 3) Frontend Types and API Clients
1. Add `Vertical` type and add `vertical`, `verticalName` to `Department` and `Project` types. File: `frontend/src/types/models.ts`.
2. Add `verticalsApi` to `frontend/src/services/api.ts` with list/create/update/delete.
3. Add `vertical` param support to API calls for people, departments, projects, assignments, analytics, snapshots. File: `frontend/src/services/api.ts` and `frontend/src/services/*`.
4. Update query keys for people, departments, projects, assignments to include `vertical` and department filters. Files: `frontend/src/hooks/usePeople.ts`, `frontend/src/hooks/useDepartments.ts`, `frontend/src/hooks/useProjects.ts`, `frontend/src/pages/Assignments/*`.
5. Ensure bulk list APIs (`listAll`) accept `vertical` where applicable (people, projects, departments, assignments) and update all call sites.

### 4) Global Vertical Filter (Frontend)
1. Add vertical filter store with URL/localStorage. Files: `frontend/src/store/verticalFilter.ts`, `frontend/src/utils/verticalQuery.ts`, `frontend/src/hooks/useVerticalFilter.ts`.
2. Add `GlobalVerticalFilter` component. File: `frontend/src/components/filters/GlobalVerticalFilter.tsx`.
3. Mount the component in top bar. File: `frontend/src/components/layout/Layout.tsx`.
4. When vertical changes, clear any department filters that are out of scope.
5. Define URL param name and precedence explicitly: `vertical=<id>` in URL; when `vertical` changes, clear `dept`/`deptFilters` if they contain out-of-scope departments.

### 5) Settings UI for Verticals
1. Add a new Settings section for Verticals. Files: `frontend/src/pages/Settings/sections/VerticalsSection.tsx`, `frontend/src/pages/Settings/sections/index.tsx`.
2. Use `verticalsApi` to list/create/update/deactivate.
3. Ensure Settings views use unfiltered departments/people when needed (no global vertical param).
4. Add `include_inactive=1` support for listing verticals/departments in Settings if inactive items should be visible.

### 6) Project, Department, People Forms
1. Project create/edit form adds vertical dropdown. Files: `frontend/src/pages/Projects/ProjectForm.tsx` and any project edit drawers.
2. Department create/edit form adds vertical dropdown. Files: `frontend/src/components/settings/Department*` and `frontend/src/pages/Settings` sections.
3. Person forms do not add vertical input; show derived vertical if useful. Files: `frontend/src/pages/People/*`.
4. Ensure project-related drawers/details (e.g., `ProjectDetailsDrawer`) display vertical and respect vertical scoping for person searches.

### 7) People Page: Server-Side Filtering
1. Replace client filtering in People list with POST `/people/search/`.
2. Add `usePeopleSearch` hook or extend `usePeople` to use search payload with pagination and ordering.
3. Replace location and department filter options with `people/filters_metadata` response.
4. Files: `frontend/src/pages/People/PeopleList.tsx`, `frontend/src/pages/People/list/components/FiltersPanel.tsx`, `frontend/src/hooks/usePeople.ts` or new hook.

### 8) Assignments Pages: Server-Side Filtering
1. Assignment list should use `/assignments/search/` with `vertical` and department filters, and remove local filtering.
2. Assignment grid should pass `vertical` to list/search/snapshots and avoid client-side department/vertical filtering.
3. Files: `frontend/src/pages/Assignments/AssignmentList.tsx`, `frontend/src/pages/Assignments/AssignmentGrid.tsx`, `frontend/src/pages/Assignments/ProjectAssignmentsGrid.tsx`.

### 9) Departments and People Lists
1. All department lists for filtering in main app should use `vertical` param when a vertical is selected.
2. All people list queries should include `vertical` to avoid cache bleed.

## Data Migration and Backfill
1. Create verticals via a one-time script or admin UI.
2. Assign each department to a vertical.
3. Backfill project verticals based on mapping or manual assignment.
4. Backfill assignments missing `project_id` or explicitly exclude them when vertical is selected.
5. Enforce NOT NULL for `Department.vertical` and `Project.vertical` after backfill (or explicitly allow legacy nulls if needed).

## Tests
1. Backend tests for vertical filtering on people, projects, departments, assignments. Files: `backend/people/tests`, `backend/projects/tests`, `backend/departments/tests`, `backend/assignments/tests`.
2. Backend tests for department parent/child vertical validation.
3. Backend tests for people search endpoint routing and typeahead endpoint.
4. Frontend smoke tests: People list, Assignment list, Projects list all respect vertical filter and use server-side pagination.

## QA Checklist
1. Create verticals in Settings and verify list/edit/deactivate.
2. Create department with parent and confirm vertical inheritance.
3. Create project and confirm vertical is required.
4. People list shows only people in selected vertical and uses server pagination.
5. Assignment list/grid shows only projects in selected vertical.
6. Switching vertical clears out-of-scope department filters and updates URL.
