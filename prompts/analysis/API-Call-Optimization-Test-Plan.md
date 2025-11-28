API Call Optimization Test Plan
===============================

Purpose: automate detection of API calls that are triggered repeatedly during a single user interaction, so we can identify candidates for bulk/aggregated endpoints and reduce chatty traffic.

This plan is derived from `API-Call-Analysis.md` and adds per-call indicators plus concrete scenarios to measure call counts.

Legend
------

- `[ONE_SHOT]` – Typically ≤1 call per page load or explicit action.
- `[REPEAT_PRONE]` – Same endpoint is or can be called many times during one high-level interaction (loop, “refresh all”, multi-cell edit, hover prefetch, etc.).
- `[TYPEAHEAD]` – Repeated while typing (autocomplete / search); expected but should be debounced and bounded.
- `[POLLING]` – Repeated on an interval (job status / health checks).
- `[BATCHED]` – Call already uses a bulk / aggregated endpoint.

Instrumentation Strategy
------------------------

- Wrap `fetch` in tests (Vitest or Playwright) with a recorder that logs:
  - `method`, normalized `path` (strip query), timestamp, and test “interaction id”.
  - Example key: `GET /api/assignments/` or `PATCH /api/assignments/{id}/`.
- For frontend unit/integration tests (Vitest + RTL):
  - Replace `global.fetch` with a spy that records calls and returns stubbed responses.
  - Wrap each scenario in a helper like `runInteraction('AssignmentGrid: bulk edit', async () => { /* render + user events */ })` and then assert per-endpoint call counts.
- For E2E (Playwright):
  - Use `page.route('**/api/**', route => { record(route.request()); route.continue(); })`.
  - After each scenario, inspect the recorded map of `endpointKey -> count`.
- Thresholds:
  - Flag as “repeated in quick succession” when `count > 1` for the same endpoint key within a single interaction (e.g., within 2–3 seconds or within a single `runInteraction` block).

Assignments
-----------

### `Assignments/AssignmentForm.tsx`
- `assignmentsApi` – create/update assignment on submit. `[ONE_SHOT]`
- `departmentsApi` – list departments for dropdown. `[ONE_SHOT]`
- `peopleApi` – list people + skill matching (`peopleApi.skillMatch`). `[REPEAT_PRONE]`
  - Risk: skillMatch is invoked in multiple effects; tests should confirm exactly one call per change to required skills/department.
- `projectsApi` – list projects for selection. `[ONE_SHOT]`

Scenarios to measure:
- AF-1: *Initial load* – render form with default department; assert:
  - `GET /people/` once, `GET /departments/` once, `GET /projects/` once.
- AF-2: *Adjust required skills text* – type a few characters and wait for debounce:
  - Assert `POST /people/skill_match/` (or equivalent) is called **once per change set**, not twice (catching the duplicated effect).

### `Assignments/AssignmentGrid.tsx`
- `assignmentsApi` – snapshot, per-person loads, create/update/delete, bulk updates. `[REPEAT_PRONE]`
- `deliverablesApi` – calendar/listAll/list for visible window. `[ONE_SHOT]`
- `peopleApi` – list/count head page for sizing and snapshot heuristics. `[ONE_SHOT]`
- `projectsApi` – list projects for grid snapshot. `[ONE_SHOT]`

High‑value scenarios:
- AG-1: *Grid initial load (people view)*:
  - Expect 1 call to `/assignments/grid_snapshot` (or async + 1–2 `/jobs/{id}/status` polls if async path is chosen).
  - Flag if `getGridSnapshot` fires more than once per load (e.g., duplicate effect).
- AG-2: *Expand one person*:
  - When clicking a collapsed person row, expect **one** `GET /assignments/by_person/` for that person.
  - Verify no duplicate `by_person` calls when repeatedly toggling the same row.
- AG-3: *Refresh all assignments*:
  - Trigger “Refresh All” and measure `GET /assignments/by_person/`:
    - Count should equal the number of people in the grid.
    - Flag as `[REPEAT_PRONE]` if N separate calls are made and consider a bulk endpoint candidate: `GET /assignments/by_people/?ids=…`.
- AG-4: *Single cell edit*:
  - Edit one week cell and save; expect:
    - 1 `PATCH /assignments/{id}/` with updated `weeklyHours`.
  - Flag if multiple `PATCH` calls are sent for the same assignment/timebox.
- AG-5: *Multi-cell edit (drag or multi-select)*:
  - When editing >1 cell at once, expect:
    - 1 `PATCH /assignments/bulk_update_hours/` `[BATCHED]`, **or**
    - if bulk endpoint fails, 1 `PATCH` per assignment as fallback.
  - Tests should assert that bulk path is used when `updatesArray.length > 1`, and warn if we see many sequential `PATCH /assignments/{id}/` for a single interaction.

### `Assignments/AssignmentList.tsx`
- `assignmentsApi` – list and delete assignments. `[ONE_SHOT]`
- `departmentsApi` – list departments. `[ONE_SHOT]`
- `peopleApi` – list people for mapping/filtering. `[ONE_SHOT]`

Key scenario:
- AL-1: *Delete one assignment* – confirm `DELETE /assignments/{id}/` then a **single** `GET /assignments/` refresh, not multiple reloads.

### `Assignments/ProjectAssignmentsGrid.tsx`
- `assignmentsApi` – list by project, create, update, bulk update, delete, conflict checks. `[REPEAT_PRONE]`
- `deliverablesApi` – calendar/bulkList/listAll for visible project range. `[ONE_SHOT]`
- `peopleApi` – autocomplete for people selection. `[TYPEAHEAD]`
- `projectAssignmentsApi` – project snapshot (`getProjectGridSnapshot`) and totals (`getProjectTotals`). `[BATCHED]`
- `projectsApi` – listAll for status filters and hover prefetch (`GET /projects/{id}/`). `[REPEAT_PRONE]` (hover prefetch across many rows).

Scenarios:
- PAG-1: *Initial load with filters*:
  - Assert 1 call to `GET /project_grid_snapshot/…` (from `getProjectGridSnapshot`).
  - For status filters, ensure `projectsApi.listAll` is not re-fired repeatedly while toggling filters quickly (at most once per logical filter change).
- PAG-2: *Expand one project*:
  - On first expand, expect 1 `GET /assignments/?project={id}…`.
  - Re-expanding without refresh should **not** re-call the endpoint unless assignments were invalidated.
- PAG-3: *Restore expanded projects from URL*:
  - When `expanded=1,2,3` in URL, loading should perform one `GET /assignments/?project={id}` per id.
  - Flag if the same project is fetched multiple times during initial hydration.
- PAG-4: *Refresh all projects*:
  - “Refresh All” currently calls `refreshProjectAssignments` for each project → 1 `GET /assignments/?project=…` per project. Marked `[REPEAT_PRONE]`.
  - Automated test should count these and highlight potential for a new bulk endpoint `GET /assignments/by_projects/?ids=…`.
- PAG-5: *Multi-cell hours edit*:
  - As in person grid, expect 1 `PATCH /assignments/bulk_update_hours/` for multi-cell updates.
  - If tests see many individual `PATCH /assignments/{id}/` calls for a single selection, mark as regression.
- PAG-6: *Role changes (project view)*:
  - Role dropdown changes call `PATCH /assignments/{id}/` once per changed row; ensure no double-submits on mobile vs desktop handlers.
- PAG-7: *Conflict checks*:
  - `assignmentsApi.checkConflicts` is already grouped per person/week in `applyValueToSelection`.
  - Tests should confirm **one** conflict call per `(personId, weekKey)` combination, not per cell.

### `Assignments/grid/components/ProjectCell.tsx`
- `projectsApi` – `GET /projects/{id}/` prefetch via React Query. `[REPEAT_PRONE]`

Scenario:
- PC-1: *Hover over multiple project cells*:
  - Ensure single cached fetch per project id (query key) even when hovering/focusing the same project repeatedly.

Auth
----

### `Auth/ResetPassword.tsx`
- `authApi` – request password reset. `[ONE_SHOT]`

### `Auth/SetPassword.tsx`
- `authApi` – confirm reset/set password. `[ONE_SHOT]`

Scenario:
- AU-1: *Spam submit* – simulate rapid double-click on submit; assert only 1 POST per form submission (guard against accidental double sends).

Dashboard
---------

### `Dashboard.tsx`
- `dashboardApi` – `getDashboard(weeks, department)` for summary tiles. `[ONE_SHOT]`
- `departmentsApi` – list departments for filter. `[ONE_SHOT]`
- `peopleApi` – `listAll` for metadata; used in availability view. `[ONE_SHOT]`
- `projectsApi` – `listAll` for project summary. `[ONE_SHOT]`

Scenarios:
- DB-1: *Change weeksPeriod quickly (1→12→4)*:
  - Instrument `GET /dashboard/` and assert one active request per final state; older in-flight requests should not trigger additional dashboard loads or flicker.
- DB-2: *Change department filter*:
  - Check that `departmentsApi.list` is loaded once and reused; no repeated department list calls on filter changes.

Deliverables
------------

### `Deliverables/Calendar.tsx`
- `assignmentsApi` – `byPerson(personId)` to filter projects. `[ONE_SHOT]`
- `peopleApi` – `autocomplete(q, limit)` for person search. `[TYPEAHEAD]`

Scenarios:
- DC-1: *Select a person*:
  - Selecting one person should trigger at most 1 `GET /deliverable_assignments/by_person/` and 1 `GET /assignments/by_person/` (parallel).
- DC-2: *Type in person filter*:
  - For a given keystroke sequence (e.g., “ann”), assert autocomplete is debounced (e.g., ≤2–3 calls instead of 1 per character).

Departments
-----------

### `Departments/DepartmentsList.tsx`
- `departmentsApi` – list/create/update/delete departments. `[ONE_SHOT]`
- `peopleApi` – list people for manager/parent display. `[ONE_SHOT]`

Scenario:
- DD-1: *Create & delete department* – confirm each create/update/delete triggers exactly one write call and at most one list refresh.

### `Departments/HierarchyView.tsx`
- `departmentsApi` – list departments. `[ONE_SHOT]`
- `peopleApi` – list people. `[ONE_SHOT]`

### `Departments/ManagerDashboard.tsx`
- `dashboardApi` – `getDashboard(weeks, department)` for selected department. `[ONE_SHOT]`
- `departmentsApi` – list departments. `[ONE_SHOT]`
- `peopleApi` – list people then filter client-side. `[ONE_SHOT]`

Scenario:
- MD-1: *Switch departments repeatedly* – verify `dashboardApi.getDashboard` is called once per selection/period, and that `peopleApi.list` is not refetched unnecessarily for the same department.

### `Departments/ReportsView.tsx`
- `dashboardApi` – `getDashboard(weeks, dept)` for **each** department. `[REPEAT_PRONE]`
- `departmentsApi` – list departments. `[ONE_SHOT]`
- `peopleApi` – list people. `[ONE_SHOT]`

Scenarios:
- DR-1: *Generate reports (N departments)*:
  - For a single timeframe change (e.g., 4→8 weeks), the plan currently calls `getDashboard` once per department. Record N and treat this as a baseline for potential bulk report endpoint.
- DR-2: *Stress test with many departments*:
  - Seed test data with high department count; detect if total `GET /dashboard/` calls per interaction become excessive (e.g., >20), suggesting need for a multi-department aggregation endpoint.

People
------

### `People/PeopleList.tsx`
- `departmentsApi` – list departments for filters. `[ONE_SHOT]`

Note: People data is loaded via hooks (`usePeople`) that already batch pagination; instrumentation should still track `/people/` endpoints at the app level.

### `People/PersonForm.tsx`
- `departmentsApi` – list departments for dropdown. `[ONE_SHOT]`
- `peopleApi` – get person (edit) and create/update. `[ONE_SHOT]`

Scenario:
- PF-1: *Switch between add and edit flows* – confirm `GET /people/{id}/` fires once per edit open, with no duplicate loads when toggling between routes quickly.

Profile
-------

### `Profile/Profile.tsx`
- `authApi` – change password. `[ONE_SHOT]`
- `peopleApi` – load person profile. `[ONE_SHOT]`

Scenario:
- PR-1: *Change password spam click* – guard against multiple `POST /auth/change_password/` from repeated button clicks.

Projects
--------

### `Projects/ProjectForm.tsx`
- `projectsApi` – fetch clients, load existing project, create/update. `[ONE_SHOT]`

Scenario:
- PJF-1: *Switch between projects in edit mode* – ensure 1 `GET /projects/{id}/` per selected project and that client list is cached rather than refetched repeatedly.

### `Projects/ProjectsList.tsx`
- `assignmentsApi` – conflict checks, per-assignment updates, deletes. `[REPEAT_PRONE]`

Scenarios:
- PJL-1: *Add candidate with conflict check*:
  - For one “add assignment” flow, expect 1 `POST /assignments/check_conflicts/…` per week or per overall candidate, not per keystroke/change in the hours input.
- PJL-2: *Batch update row assignments*:
  - When editing multiple weeks for one assignment via inline edit, tests should detect how many `PATCH /assignments/{id}/` calls occur; if we see more than one per save, consider migrating to `bulkUpdateHours`.

### `Projects/list/components/ProjectDetailsPanel.tsx`
- `projectsApi` – fetch project metadata/clients for a side panel. `[ONE_SHOT]`

Scenario:
- PDP-1: *Open/close the details panel repeatedly* – ensure project details are cached, not re-fetched every time the panel opens for the same project.

Reports
-------

### `Reports/TeamForecast.tsx`
- `peopleApi` – workload forecast data. `[ONE_SHOT]`
- `projectsApi` – list projects. `[ONE_SHOT]`
- `departmentsApi` – list departments. `[ONE_SHOT]`
- `assignmentsApi` – list project/department assignments when a project is selected. `[ONE_SHOT]`
- `deliverablesApi` – list deliverables for selected project. `[ONE_SHOT]`

Scenarios:
- TF-1: *Change weeks or department* – expect 1 `GET /people/workload_forecast/` per change; flag duplicate calls.
- TF-2: *Switch selected project for timeline* – each new project selection should trigger at most 1 assignments list call and 1 deliverables list call.

Settings
--------

### `Settings/sections/AdminUsersSection.tsx`
- `authApi` – list/create/invite/update/delete users; set roles; link person. `[ONE_SHOT]`
- `peopleApi` – autocomplete people for linking. `[ONE_SHOT]` (initial, non-typeahead call).

Scenarios:
- AU-ADMIN-1: *Change role for many users* – confirm one `POST /auth/users/{id}/role/` per change and no redundant `listUsers` reload unless requested.

### `Settings/sections/AuditLogSection.tsx`
- `authApi` – list admin audit log. `[ONE_SHOT]`

Scenario:
- AU-AUDIT-1: *Repeated refresh clicks* – ensure multiple clicks do not overlap many concurrent `GET /auth/admin_audit/` calls.

### `Settings/sections/IntegrationsSection.tsx`
- `integrationsApi` (via `integrationsApi.ts`) – providers, credentials, connections, rules, mappings, jobs, health. `[POLLING]` (jobs, health) and `[ONE_SHOT]` (setup/mutations).

Scenarios:
- INT-1: *Idle polling* – with the section open, record counts for:
  - `GET /integrations/jobs/…` and `GET /integrations/health/…` over a fixed window (e.g., 2–3 intervals) to confirm poll cadence (30s / 60s) and no duplicate overlapping polls.
- INT-2: *Trigger sync job* – when running a sync, track how often `listJobs` and related endpoints are invoked; ensure background polling is not intensified beyond the configured intervals.

Skills
------

### `Skills/SkillsDashboard.tsx`
- `departmentsApi` – list departments. `[ONE_SHOT]`
- `peopleApi` – list people. `[ONE_SHOT]`

Scenario:
- SK-1: *Retry load after error* – confirm each retry fires exactly one request per endpoint (`/people/`, `/departments/`, `/skill_tags/`, `/person_skills/`), not multiple stacked calls.

Next Steps
----------

- Implement a shared “API call recorder” test helper as described in the instrumentation strategy.
- Start by adding tests for the highest-value `[REPEAT_PRONE]` areas:
  - Assignment grids (`Assignments/AssignmentGrid.tsx`, `Assignments/ProjectAssignmentsGrid.tsx`).
  - Department reports (`Departments/ReportsView.tsx`).
  - Assignment form skill matching (`Assignments/AssignmentForm.tsx`).
- Use recorded call metrics to propose concrete backend bulk endpoints (e.g., assignments by person list, assignments by project list, bulk dashboard reports) where test data shows many calls per interaction.

