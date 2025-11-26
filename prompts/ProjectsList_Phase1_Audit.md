# Projects List – Phase 1 Audit

**Route / Component:** `frontend/src/pages/Projects/ProjectsList.tsx` (desktop split view with table at left, detail panel at right)

This page is a dense controller composed of multiple hooks; before attempting a mobile layout we documented how each major hook depends on backend services and shared context. Preserving these contracts is critical because most “UI state” is really derived from React Query caches or department filters that flow through every hook.

---

## 1. Data Sources & Global Context
- `useProjects()` (React Query) hydrates the entire project dataset used by both the table and the detail pane. It’s the canonical source for selection, sorting, and deep-linking.
- `useProjectFilterMetadata()` fetches the server-side counts (`assignmentCount`, `hasFutureDeliverables`, etc.) that power status toggles, “no assignments” badges, and deliverable-aware filters. Any mobile reflow must continue providing this metadata to `useProjectFilters`.
- `useDepartmentFilter()` scopes downstream calls (availability, candidate filtering, person search) so all hooks respect the same department/children selections.
- `useCapabilities()` gates availability of inline edit actions, status controls, etc. Touch UIs have to keep the same `caps` logic to avoid exposing unauthorized actions.

---

## 2. Left Pane – `ProjectsTable` + `FiltersBar`

### `useProjectFilters(projects, filterMetadata, options)`
- **Dependencies:** Uses `filterMetadata.projectFilters` to answer “no assignments” or “has deliverables” queries, localStorage to persist status chips, and `statusOptions` for formatting. Custom sort getters (next/previous deliverables) rely on `useProjectDeliverablesBulk`.
- **Outputs consumed by the table:** `sortedProjects`, `selectedStatusFilters`, `sortBy`, `sortDirection`, `searchTerm`, and handlers (`toggleStatusFilter`, `setSearchTerm`, `onSort`, `forceShowAll`).
- **Why it matters for mobile:** Any stacked/accordion list must still call `onSort`/`toggleStatusFilter`, and must feed `sortedProjects` into `useProjectSelection` so the detail pane stays in sync. Losing the metadata link would break the “Active - With Dates/No Dates” filters because those depend on backend-delivered flags, not just local fields.

### `useProjectSelection(sortedProjects)`
- **Dependencies:** The hook keeps `selectedProject`, `selectedIndex`, and exposes `handleProjectClick` that coordinates between the table (row click) and the side panel (deep-link selection). It assumes the array order matches the visual order.
- **Why it matters:** When converting to a mobile list/drawer, we still need a single selection controller; otherwise, inline edits, status dropdown, and deliverables sections would desync. Selection also feeds `useProjectAssignments` (right pane) and deep-link handling (`/projects?projectId=`). A mobile drawer must call the same `handleProjectClick` API.

---

## 3. Right Pane – `ProjectDetailsPanel`

### `useProjectAssignments({ projectId, people })`
- **Backend dependencies:** Paginates through `assignmentsApi.list({ project, page, page_size })`, then hydrates department role catalogs via `listProjectRoles(deptId)` to sort assignments using `sortAssignmentsByProjectRole`. The hook also derives `availableRoles` by scanning both assignments and the global `people` list.
- **Consumers:** The detail panel uses `assignments`, `availableRoles`, and the `reload` function. Inline edit hooks (`useAssignmentInlineEdit`) depend on the same `assignments` array.
- **Why it matters:** A mobile drawer still needs to show assignments, add/edit rows, and keep assignments re-sorted with the same backend role catalogs. If we split or virtualize on mobile, we must preserve the `reload` contract (called after inline edits, deliverables changes, or deletes).

### `useProjectAvailability({ projectId, departmentId, includeChildren, candidatesOnly })`
- **Backend dependencies:** Calls `projectsApi.getAvailability(projectId, mondayIso, query)` where `query` mirrors the department filter toggles and the “candidates only” flag. Results populate `availabilityMap`, which the person search and add-assignment drawer consume to show utilization bars.
- **Why it matters:** Any mobile add-assignment flow must continue supplying the same params so availability badges stay accurate. Losing `departmentId/includeChildren` would surface incorrect candidate pools.

### Other supporting hooks/endpoints (still relevant for mobile)
- `useProjectAssignmentAdd` (internally uses `assignmentsApi`, `checkAssignmentConflicts`, and invalidates filter metadata after saves).
- `useAssignmentInlineEdit` (shares the `assignments` array, persists hour updates via `assignmentsApi.update`, and recycles cached role suggestions).
- Deliverables slot (`useProjectDeliverablesBulk` + `DeliverablesSection`) refreshes after edits via `refreshDeliverablesFor`.

---

## 4. Observations / Constraints for Mobile Reflow
1. **Single Source of Truth for Selection:** Both panes read `selectedProject` from `useProjectSelection`. A drawer/sheet experience must continue dispatching through that hook so assignments, availability, and status dropdowns reference the same project.
2. **Filter Metadata Required for Status Chips:** `FiltersBar` isn’t just cosmetic—it relies on `filterMetadata` and `buildFutureDeliverableLookupFromMetadata` to distinguish “Active With Dates” vs “No Dates”. Mobile filters must keep calling `useProjectFilters` to avoid duplicating logic.
3. **Assignments Depend on Role Catalogs:** The right pane’s list is sorted using backend role order from `listProjectRoles`. Even if assignments collapse into accordions on mobile, we cannot replace this with client-side heuristics.
4. **Department Filter Flows Through Availability + Person Search:** `useProjectAvailability`, `usePersonSearch`, and add-assignment warnings all take the global department scope. A mobile implementation that moves filters into a sheet still has to pipe `deptState` through every hook to keep backend queries aligned.

This audit gives us the dependency matrix we need so a future mobile layout (stacked cards with a detail drawer) can reuse every hook without duplicating API contracts or breaking selection/filters.
