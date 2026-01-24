# Project UI Stale Data Remediation Plan (No Shared Cache)

Date: 2026-01-24  
Owner: Frontend  
Scope: Project list/details, project dashboard, deliverables, assignments, departments, and related pages

## Pages Affected (Index)
| Page/File | Section |
| --- | --- |
| `frontend/src/pages/Projects/ProjectsList.tsx` | [1) Projects List + Details](#1-projects-list--details-highest-impact-most-reported-issues) |
| `frontend/src/pages/Projects/list/components/ProjectsTable.tsx` | [1) Projects List + Details](#1-projects-list--details-highest-impact-most-reported-issues) |
| `frontend/src/pages/Projects/list/components/ProjectDetailsPanel.tsx` | [1) Projects List + Details](#1-projects-list--details-highest-impact-most-reported-issues) |
| `frontend/src/pages/Projects/list/hooks/useProjectDeliverablesBulk.ts` | [1) Projects List + Details](#1-projects-list--details-highest-impact-most-reported-issues) |
| `frontend/src/components/projects/ProjectNotesEditor.tsx` | [2) Project Notes + Scratch Pad](#2-project-notes--scratch-pad-stale-project-state) |
| `frontend/src/components/projects/ProjectScratchPad.tsx` | [2) Project Notes + Scratch Pad](#2-project-notes--scratch-pad-stale-project-state) |
| `frontend/src/pages/Projects/ProjectForm.tsx` | [3) Project Form](#3-project-form-edit-existing-project) |
| `frontend/src/pages/Projects/ProjectDashboard.tsx` | [4) Project Dashboard](#4-project-dashboard-cross-page-consistency) |
| `frontend/src/components/deliverables/DeliverablesSection.tsx` | [4) Project Dashboard](#4-project-dashboard-cross-page-consistency) |
| `frontend/src/pages/Assignments/AssignmentForm.tsx` | [5) Assignments Grid + Project Assignments](#5-assignments-grid--project-assignments) |
| `frontend/src/pages/Assignments/AssignmentGrid.tsx` | [5) Assignments Grid + Project Assignments](#5-assignments-grid--project-assignments) |
| `frontend/src/pages/Assignments/ProjectAssignmentsGrid.tsx` | [5) Assignments Grid + Project Assignments](#5-assignments-grid--project-assignments) |
| `frontend/src/pages/Assignments/grid/assignmentActions.ts` | [5) Assignments Grid + Project Assignments](#5-assignments-grid--project-assignments) |
| `frontend/src/pages/Departments/DepartmentsList.tsx` | [6) Departments + People Lists](#6-departments--people-lists) |
| `frontend/src/hooks/usePeople.ts` | [6) Departments + People Lists](#6-departments--people-lists) |
| `frontend/src/pages/Reports/*` | [7) Reports/Personal Dashboards](#7-reportspersonal-dashboards-read-only-but-can-be-stale) |
| `frontend/src/pages/Personal/*` | [7) Reports/Personal Dashboards](#7-reportspersonal-dashboards-read-only-but-can-be-stale) |

## Goals
- Make the server the only source of truth.
- Eliminate shared/global caches that can go stale across views.
- Ensure all mounted views re-fetch after related mutations.
- Avoid “wait until refresh” behavior and mismatched list/detail states.

## Guiding Principles (No Shared Cache)
- **Server is authoritative**: views only hold ephemeral state needed to render.
- **No shared cache**: avoid React Query cache as a cross-view data store.
- **Fetch per view**: each view loads what it needs and owns its local state.
- **Post-mutation refetch**: after any mutation, refetch the affected view.
- **Broadcast refresh signals**: use event buses to tell other mounted views to refetch (no data payload).
- **No optimistic shared updates**: local optimistic UI is allowed only within the active view and must be reconciled by refetch.
- **No local overrides that persist**: temporary UI overlays must be cleared on refetch or error.

---

## Priority Order (Largest Offenders First)

### 1) Projects List + Details (highest impact, most reported issues)
**Pages/Files**
- `frontend/src/pages/Projects/ProjectsList.tsx`
- `frontend/src/pages/Projects/list/components/ProjectsTable.tsx`
- `frontend/src/pages/Projects/list/components/ProjectDetailsPanel.tsx`
- `frontend/src/pages/Projects/list/hooks/useProjectDeliverablesBulk.ts`

**Issues**
- Local deliverable overrides can mask server updates.
- Deliverable bulk maps do not refresh when other views update deliverables.
- Details panel local patch can diverge from server state.

**Plan**
1. **Deliverables in list**
   - Clear `deliverableOverrides` / `notesOverrides` after save or on refetch.
   - Trigger a deliverables refresh signal after any create/update/delete.
2. **Bulk deliverables hook**
   - Remove cross-view caching. Make it a per-view loader that refetches on:
     - initial mount
     - list filter/sort/page changes
     - deliverables refresh signal
3. **Details panel**
   - Replace long-lived `localPatch` with short-lived UI state.
   - After mutation: `await refetchDetails()` and clear local patch state.
   - On error: revert local patch and refetch details.

**Validation**
- Edit deliverable in list: list + details update immediately.
- Edit deliverable in dashboard: list updates without manual refresh.
- Edit client/name/number in details: list updates immediately.

---

### 2) Project Notes + Scratch Pad (stale project state)
**Pages/Files**
- `frontend/src/components/projects/ProjectNotesEditor.tsx` (already updated)
- `frontend/src/components/projects/ProjectScratchPad.tsx`

**Issues**
- Scratch pad uses direct `projectsApi.update`, bypassing any shared refresh flow.

**Plan**
1. Wrap updates in a shared mutation function (no cache writes).
2. After success: `await refetchProject()` for the active view.
3. Publish a `projectsRefreshBus` event to notify other mounted views.

**Validation**
- Update notes in scratch pad; list/details show updated notes without refresh.

---

### 3) Project Form (edit existing project)
**Pages/Files**
- `frontend/src/pages/Projects/ProjectForm.tsx`

**Issues**
- Direct API update can leave list/detail stale until next manual refresh.

**Plan**
1. Use a shared update function (no cache writes).
2. After success: refetch the form view, then navigate.
3. On navigation to `/projects`, list view should fetch fresh data on mount.

**Validation**
- Edit project via form; list shows updated fields immediately on return.

---

### 4) Project Dashboard (cross-page consistency)
**Pages/Files**
- `frontend/src/pages/Projects/ProjectDashboard.tsx`
- `frontend/src/components/deliverables/DeliverablesSection.tsx`

**Issues**
- Deliverable updates refresh local list but do not inform list view.
- Department/assignment updates rely on stale data when not refetched.

**Plan**
1. After any deliverable mutation: publish `deliverablesRefreshBus`.
2. After any project field mutation: publish `projectsRefreshBus`.
3. Dashboard should refetch its own sections after mutations.

**Validation**
- Update deliverables in dashboard; list and details reflect change.

---

### 5) Assignments Grid + Project Assignments
**Pages/Files**
- `frontend/src/pages/Assignments/AssignmentForm.tsx`
- `frontend/src/pages/Assignments/AssignmentGrid.tsx`
- `frontend/src/pages/Assignments/ProjectAssignmentsGrid.tsx`
- `frontend/src/pages/Assignments/grid/assignmentActions.ts`

**Issues**
- Direct `assignmentsApi.update/create` calls do not notify other views.
- Grid uses local state; other views can remain stale.

**Plan**
1. Create shared assignment mutations (no cache writes).
2. After success: refetch the active grid and publish `assignmentsRefreshBus`.
3. Standardize fetch params (filter/sort/page) so refetches are deterministic.

**Validation**
- Update assignment in any grid; other assignment views update without refresh.

---

### 6) Departments + People Lists
**Pages/Files**
- `frontend/src/pages/Departments/DepartmentsList.tsx`
- `frontend/src/hooks/usePeople.ts`

**Issues**
- Departments list uses local state; other views can stay stale.

**Plan**
1. Move departments list to a per-view loader that refetches on:
   - mount
   - department mutations
   - `departmentsRefreshBus` signal
2. Publish `departmentsRefreshBus` on department create/update/delete.

**Validation**
- Edit department in list; dashboard and filters update immediately.

---

### 7) Reports/Personal Dashboards (read-only but can be stale)
**Pages/Files**
- `frontend/src/pages/Reports/*`
- `frontend/src/pages/Personal/*`

**Issues**
- Direct API calls with local state; no refresh path.

**Plan**
1. Convert key loads to per-view loaders (no shared cache).
2. Subscribe to refresh signals relevant to projects/assignments.

**Validation**
- Update project/assignment; reports update on next navigation or refresh signal.

---

## Cross-Cutting Improvements (No Shared Cache)
1. **Standardize fetch + refetch**
   - Each view exports a local `refetch()` that re-runs its data loader.
2. **Centralize mutation functions**
   - `updateProject`, `updateDeliverable`, `updateAssignment`, `updateDepartment`.
   - Mutations never write to shared caches; they only trigger refetch signals.
3. **Refresh buses (signals only)**
   - `projectsRefreshBus`, `deliverablesRefreshBus`, `assignmentsRefreshBus`, `departmentsRefreshBus`.
   - Signals carry no data; they only trigger refetch in mounted views.
   - Add debouncing and unsubscribe on unmount to avoid loops/memory leaks.
4. **UI patch rules**
   - Local optimistic UI is allowed in the active view only.
   - Always reconcile by refetch after success/failure.

---

## Rollout Strategy
1. Apply fixes per page in priority order (1 → 7).
2. Add targeted integration tests:
   - Update in list reflects in details (via refetch).
   - Update in dashboard reflects in list (via refresh bus).
   - Update in assignments grid reflects in project assignments.
3. Monitor in staging with logging around refresh signals and refetch timing.

---

## Definition of Done
- Any project edit (list, details, form, dashboard) reflects immediately in all mounted views.
- Deliverable updates reflect immediately in list columns and dashboard.
- Assignment updates reflect immediately in all assignment-related views.
- No shared/global cache is required for correctness.
