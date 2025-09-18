# Project Assignments (By Project) — Step‑By‑Step Prompts

These prompts guide an AI agent to implement a new “Project Assignments” page that mirrors the existing Assignments grid but flips grouping to project → people. The result must preserve current grid functionality: week headers, drag‑to‑select range editing, bulk updates, deliverables shading, project status editing, department filters, and overall UX patterns.

General rules for every step:
- Follow lean, best‑practice implementation. No hacks or band‑aids.
- Reuse existing patterns, hooks, and components. Do not remove code to “make it compile”. Fix types correctly.
- Keep behavior parity with `frontend/src/pages/Assignments/AssignmentGrid.tsx` unless explicitly stated.
- Add code with strong typing, clear naming, and minimal surface area. Avoid duplication by extracting shared logic where appropriate.

---

## Step 0 — Pre‑Checks & Decisions (Stability + Scale)
Prompt:
- Implement using lean, best‑practice code only. Do not use hacks, quick fixes, or remove functionality to achieve a clean build. Fix problems at the root cause. All calculations remain server‑authoritative.
- Adopt canonical week keys from the server. Use `assignmentsApi.getGridSnapshot(...)` weekKeys to render week headers in all grids. Do not compute local Mondays. If the snapshot fails, show a retry/error state rather than computing client-side.
- Decide to introduce a backend project‑centric snapshot now (see Step 3) to keep totals fast and memory‑safe at scale.
- Add a fetch concurrency plan:
  - Use `AbortController` per in‑flight request (expand/refresh, filters) and discard stale responses by comparing a `requestId` captured at call time.
- Plan ETag handling:
  - After `bulkUpdateHours`, capture `{ assignmentId, etag }` and store in a per‑assignment ETag map (align with any existing `etagStore` usage). Use ETags on subsequent PATCH to avoid 412 conflicts.
  - Audit current ETag patterns in `frontend/src/services/api.ts` and the shared `etagStore`. Centralize ETag read/write in `assignmentsApi.update` and `assignmentsApi.bulkUpdateHours` (set `If-Match` when available). Avoid adding a broad new hook unless duplication emerges.
- Deliverables shading completeness:
  - Use server-provided deliverables aggregates (see Step 3). Do not compute “in-week” shading on the client.
- Capabilities:
  - Gate edit/status actions with `useCapabilities()`. Disable UI where not permitted.
- URL state:
  - Reflect department filters and week horizon in query params. Read on mount; push on change.
- Selection refactor safety:
  - First enable the new selection hook in the new Project view behind a small feature flag/toggle. Migrate the existing grid only after parity is verified.

## Step 1 — Analyze the Current Grid and Confirm Scope
Prompt:
- Implement using lean, best‑practice analysis. Do not modify files in this step. No hacks or shortcuts.
- Read `frontend/src/pages/Assignments/AssignmentGrid.tsx` and list the key features you will preserve (sticky header, week headers, drag‑select editing, optimistic updates with rollback, deliverables shading, project status edit flow, department + status filters, lazy expand).
- Summarize data dependencies from `assignmentsApi`, `peopleApi`, `projectsApi`, `deliverablesApi`, `jobsApi`, and hooks `useDepartmentFilter`, `useDropdownManager`, `useProjectStatus`, `useProjectStatusSubscription`.
- Identify reusable utilities vs. person‑specific logic. Reply with a short summary only; do not modify files in this step.

## Step 2 — Scaffold Project Assignments Grid and Route
Prompt:
- Implement using lean, best‑practice code only. No hacks, quick fixes, or code removal to bypass errors. Maintain full type‑safety.
- Create `frontend/src/pages/Assignments/ProjectAssignmentsGrid.tsx` with a minimal, compiling component: import `Layout` and `GlobalDepartmentFilter`, render a sticky header titled “Project Assignments.” For the week header, render a skeleton/placeholder only; do not compute weeks locally. We will wire server weekKeys in Step 4 after Step 3 backend is ready.
- Export the component from `frontend/src/pages/Assignments/index.tsx` as `ProjectAssignmentsGrid`.
- Add a new lazy route in `frontend/src/main.tsx`: path `'/project-assignments'` renders `<RequireAuth><ProjectAssignmentsGrid /></RequireAuth>` following the existing import pattern.
- Add a Sidebar link in `frontend/src/components/layout/Sidebar.tsx` labeled “Project Assignments” pointing to `'/project-assignments'` using the existing `assignments` icon. Do not disrupt other items.
- Ensure the app builds with zero TypeScript errors.

## Step 3 — Backend Project Snapshot (Fast Project‑Centric Aggregation)
Prompt:
- Implement using lean, best‑practice backend code. No shortcuts. Keep calculations server‑authoritative and typed. Add tests if present.
- Implement a new `@action(detail=False, methods=['get'], url_path='project_grid_snapshot')` in `backend/assignments/views.py` that mirrors `grid_snapshot` but aggregates by project:
  - Accept `weeks`, `department`, `include_children`, `status_in` (CSV), and `has_future_deliverables` (boolean).
  - Return shape (all server-calculated — no client math):
    ```json
    {
      "weekKeys": ["YYYY-MM-DD", ...],
      "projects": [ { "id": 1, "name": "...", "client": "...", "status": "active" } ],
      "hoursByProject": { "<projectId>": { "<weekKey>": number } },
      "deliverablesByProjectWeek": { "<projectId>": { "<weekKey>": number } },
      "hasFutureDeliverablesByProject": { "<projectId>": true },
      "metrics": { "projectsCount": number, "peopleAssignedCount": number, "totalHours": number }
    }
    ```
  - Use efficient querysets and prefetch; throttle and short‑TTL cache like `grid_snapshot`.
- Optionally add `@action(detail=False, methods=['get'], url_path='by_project')` for listing assignments filtered by `project` id (if not already covered by `list` with `?project=`).
  - Do not return assignment rows from the snapshot; keep it aggregate-only. Assignment details are fetched on-demand via `by_project` when the user expands a project.
  - Optional: allow `project_ids` to scope the snapshot to the currently visible project set (for very large portfolios), but do not tie the snapshot to expansion state.
- Add a lightweight totals endpoint or extend the bulk update response to support authoritative totals refresh without client math:
  - `@action(detail=False, methods=['get'], url_path='project_totals')` accepting `project_ids` and `weeks` → `{ hoursByProject: { ... } }`, or
  - Extend `bulk_update_hours` response with `updatedTotalsByProjectWeek` mirroring the shape in the snapshot.
- Wire URL routing in `backend/config/urls.py` (include already handled by viewset router).
- Update OpenAPI documentation (`drf-spectacular` decorators) and regenerate `backend/openapi.json`.
- In the frontend, add `assignmentsApi.getProjectGridSnapshot(opts)` mirroring `getGridSnapshot` with the same param semantics. Use the typed client if present.

## Step 4 — Extract Week Header Utilities (Server Week Keys Only)
Prompt:
- Implement using lean, best‑practice code. Do not reintroduce client‑side calculations. Maintain clear types and documentation.
- Create `frontend/src/pages/Assignments/grid/utils.ts` with:
  - `toWeekHeader(weekKeys: string[]): { date: string; display: string; fullDisplay: string }[]`.
- Remove any local week computation utilities. Refactor both grids (`AssignmentGrid.tsx` and `ProjectAssignmentsGrid.tsx`) to use server `weekKeys` (from `getGridSnapshot` / `getProjectGridSnapshot`) and transform via `toWeekHeader`. If the snapshot fetch fails, show an error/retry state.
- Keep names/types explicit and documented. No behavior change expected beyond using server keys.

## Step 5 — Extract Cell Selection Core (Reused in Both Grids)
Prompt:
- Implement using lean, best‑practice React hooks. No hacks or temporary suppressions. Preserve existing behavior without regressions.
- Implement `frontend/src/pages/Assignments/grid/useCellSelection.ts` as a hook that manages selection state and drag range across week cells. Scope it to a row identity `(rowKey: string)` plus `weekKey: string` to keep it generic. Provide APIs: `selectedCells`, `selectedCell`, `selectionStart`, `onCellMouseDown(rowKey, week)`, `onCellMouseEnter(rowKey, week)`, `onCellSelect(rowKey, week, isShiftClick?)`, `clearSelection()`.
- Integrate the hook into `ProjectAssignmentsGrid.tsx`. Preserve keyboard/drag/shift‑select parity.
- After validating parity in the new grid, refactor `AssignmentGrid.tsx` to use the hook without changing external behavior.

## Step 6 — Data Model for Project‑Centric View
Prompt:
- Implement using lean, best‑practice code. Maintain strict typing and avoid client‑side math for totals.
- Define `ProjectWithAssignments` type in `ProjectAssignmentsGrid.tsx` (or `types.ts` next to it): `{ ...Project; assignments: Assignment[]; isExpanded: boolean }` with optional derived fields as needed.
- Load initial data for the project view:
  - Use `useDepartmentFilter()`.
  - Fetch project snapshot via `assignmentsApi.getProjectGridSnapshot({ weeks, department, include_children })` to initialize `weekKeys`, `projects`, and `hoursByProject`.
  - Fetch `projectsApi.list(...)` (for details like status metadata) and normalize into `projectsData` and `projectsById: Map<number, Project>`.
  - Initialize `deliverables` first page; full strategy in Step 8.
- Ensure loading/error states mirror the current grid.

## Step 7 — Aggregated Hours by Project per Week (Server‑Authoritative)
Prompt:
- Implement using lean, best‑practice code. Do not compute totals client‑side. Use only server‑provided aggregates/deltas.
- Use `hoursByProject` from the snapshot to render totals by default.
- Do not compute totals on the client. When a project expands or refreshes, request authoritative totals from the server:
  - Prefer the totals included in `project_grid_snapshot` if sufficient, or
  - Call the small `project_totals` endpoint for just the expanded project and active horizon.
- After edits, refresh totals using the server‑provided deltas (if included in the bulk response) or by calling `project_totals` for the affected projects/weeks.
 - Provide a visible “Refresh totals” action at the project level. For snapshot or totals request failures, show inline retry with exponential backoff and clear error messaging.

## Step 8 — Deliverables Data Strategy (Server‑Provided Shading + Filters)
Prompt:
- Implement using lean, best‑practice code. Do not compute deliverable‑in‑week logic on the client.
- Use the data returned from `project_grid_snapshot`:
  - Use `deliverablesByProjectWeek` for week‑cell shading (presence counts or boolean > 0).
  - Use `hasFutureDeliverablesByProject` to power the “Active – No Deliverables” filter.
- Do not implement client date math to determine in‑week deliverables.

## Step 9 — Lazy Load Assignments by Project (Expand/Collapse)
Prompt:
- Implement using lean, best‑practice code. No hacks or race‑condition prone shortcuts. Ensure proper cancellation and state guards.
- Add expand/collapse UI per project row. On expand, call `assignmentsApi.byProject(projectId, { department, include_children })` (or `assignmentsApi.list({ project })`) to fetch assignment rows.
- Manage `loadingAssignments: Set<number>` to avoid duplicate loads and render skeletons.
- Add a “Refresh assignments” action that refetches and updates `hoursByProject`.
- Guard each fetch with `AbortController` and ignore stale results using a `requestId` captured at call.
 - Render assignment-row skeletons while loading (names/avatars left, week cells shimmering). Consider an optional `useAbortController` utility to centralize cancellation and (if needed) simple request deduplication by signature.

## Step 10 — Grid Layout, Week Horizon, and Header Parity
Prompt:
- Implement using lean, best‑practice UI code. Do not remove features to avoid errors. Keep calculations server‑side.
- Implement the CSS grid similar to `AssignmentGrid.tsx` with left frozen columns for `Client`, `Project`, a small actions column, followed by week columns. Duplicate the resizable column pattern.
- Add a compact week horizon control (e.g., 8/12/16/20). On change, refetch the project snapshot with the new `weeks` param, update headers and totals from the server, and push the new value into the URL query.
- Persist column widths to `localStorage` and restore on mount.
- Render quick header metrics using the snapshot `metrics` block from the server (do not compute client‑side): visible projects count, total assigned people, total hours across the horizon.
 - Visual hierarchy: project rows use bold text, slightly darker background, and a caret icon; assignment rows are indented with lighter text and can show a small person avatar for recognition.
 - While week horizon changes are in-flight, render a shimmer/skeleton over week columns to indicate loading.
 - Selection feedback: show a compact summary such as “3 rows × 4 weeks = 12 cells selected”, and visually outline the selection bounds.

## Step 11 — Assignment Rows (People Under Each Project)
Prompt:
- Implement using lean, best‑practice code. Preserve parity with person grid without duplicating logic unnecessarily.
- Under each expanded project, render assignment rows (each row is a person’s assignment to that project): person column, actions cell (remove), week cells.
- Reuse the same cell component behavior from `AssignmentGrid.tsx` for editing, hover, and shading. Apply deliverable shading via `getDeliverablesForProjectWeek(projectId, weekStart)` adapted from the person grid.
- Keep row keys stable (`assignment.id`).

## Step 12 — Multi‑Week Editing and Bulk Updates (Server Totals + ETags)
Prompt:
- Implement using lean, best‑practice code. Do not recompute totals client‑side, and do not suppress errors. Use ETags properly.
- Implement multi‑week editing using the selection hook. On commit:
  - Batch per‑assignment `weeklyHours` diffs and call `assignmentsApi.bulkUpdateHours` when >1 assignment changes; else fallback to `assignmentsApi.update`.
  - Use optimistic UI only for the edited cells’ inputs (and a subtle spinner on those cells). Do not recompute totals on the client.
  - After a successful update, refresh totals using one of:
    - Server‑returned `updatedTotalsByProjectWeek` from the bulk response, or
    - A call to `project_totals` for affected projectIds/weekKeys.
  - Capture returned ETags and store in a per‑assignment ETag map for subsequent PATCH requests. Ensure `If-Match` is set on PATCH/DELETE for concurrency safety.
  - On failures, revert only affected assignments and show a toast.
- Invalidate analytics queries mirrored from the current grid.

## Step 13 — Project Status Editing (Badge + Dropdown + Capabilities)
Prompt:
- Implement using lean, best‑practice code. Respect capabilities and avoid bypasses.
- Reuse `StatusBadge`, `StatusDropdown`, `useDropdownManager`, and `useProjectStatus` for per‑project status editing. Integrate `useProjectStatusSubscription` to broadcast changes across both grids.
- Respect `useCapabilities()` to disable editing when not permitted. Indicate disabled state in UI.

## Step 14 — Filters Parity (Department + Status)
Prompt:
- Implement using lean, best‑practice code. Push all filtering to the server; avoid client‑side filter hacks.
- Add `GlobalDepartmentFilter` in the header. Carry over the multi‑select status filters from the person grid: `[active, active_ca, on_hold, completed, cancelled, active_no_deliverables, Show All]`.
- Push filters to the server by passing `status_in` and `has_future_deliverables` params to `project_grid_snapshot`. Do not filter client‑side beyond simple UI hiding.
- Ensure header metrics reflect server‑filtered results directly from the snapshot response.
 - Persist department/status filter selections in `localStorage` and initialize from URL query params so both person and project views remain in sync.

## Step 15 — Add/Remove Assignments from Project View
Prompt:
- Implement using lean, best‑practice code. Refresh totals via server; do not adjust totals locally.
- Implement an inline “Add person to project” control on expanded project rows:
  - Person combobox (fetch via `peopleApi.list` with search; reuse existing pattern).
  - On select, call `assignmentsApi.create({ person: personId, project: projectId, weeklyHours: {} })`, optimistically append the assignment row, then refresh totals via `project_totals` or a server totals delta returned from create.
- Implement remove with `assignmentsApi.delete(assignmentId)`, updating local state and refreshing totals via `project_totals`. Show toasts on success/failure.

## Step 16 — API Service Ergonomics (Typed + Friendly)
Prompt:
- Implement using lean, best‑practice code. Keep error handling consistent; no broad try/catch that masks errors.
- Add `assignmentsApi.byProject(projectId: number, filters?: { department?: number; include_children?: 0 | 1 })` as a convenience wrapper around the existing list call.
- Add `assignmentsApi.getProjectGridSnapshot(opts)` mirroring `getGridSnapshot` semantics, with support for `status_in` and `has_future_deliverables`.
- Add `assignmentsApi.getProjectTotals(projectIds: number[], opts: { weeks: number; department?: number; include_children?: 0 | 1 })` to call `project_totals` when needed.
- Do not remove or rename existing APIs; only extend safely. Keep error handling consistent with `friendlyErrorMessage`.

## Step 17 — Refactor Minor Duplication Thoughtfully
Prompt:
- Implement using lean, best‑practice refactors. Avoid over‑abstraction and regressions; keep changes surgical.
- Identify helpers duplicated between grids (deliverable‑in‑week check, resize handlers). Extract into `frontend/src/pages/Assignments/grid/` where reasonable.
- Keep refactors surgical; avoid destabilizing the person grid.

## Step 18 — Navigation, URL State, and Polishing
Prompt:
- Implement using lean, best‑practice code. Do not introduce flaky state handling; ensure URL and localStorage sync are robust.
- Add a “Switch to People View / Project View” link in both grid headers for discoverability.
- Implement a `useGridUrlState` hook that syncs department filters, status filters, and week horizon with the URL query string (read on mount, update on change): `/project-assignments?dept=5&weeks=12&expanded=1,3,7&view=project`.
- Ensure column width persistence and quick header metrics are present.
- Consider optional client grouping (collapsible by client) if the list is long.
- Guard all in‑flight fetches with `AbortController`; cancel on unmount/param change.
 - Maintain filter state parity across person/project views by reading/writing shared keys in URL/localStorage.
 - Optional future improvement: responsive/mobile card view for narrow screens (defer if scope is tight).

## Step 19 — QA Pass, Accessibility, and Type Safety
Prompt:
- Implement using lean, best‑practice validation. Do not disable linting or relax types to pass checks. Prefer proper fixes.
- Run type checks and the frontend dev server. Resolve any TypeScript issues at the root cause.
- Validate:
  - Expand/collapse, drag‑to‑select, single/multi‑week edits, optimistic rollback.
  - Status edits and filter interactions.
  - Deliverables shading and tooltips across the chosen horizon.
  - Department scoping, week horizon changes, and snapshot async states.
  - Keyboard navigation with explicit keymap: arrows to move, Tab/Shift+Tab between editable cells, Enter to start editing/confirm, Escape to cancel/clear selection, Space to toggle project expand/collapse.
  - Accessibility: `aria-expanded` on project rows, `aria-selected` on selected cells, ARIA labels on grid cells/headers, and a polite live region for bulk edit feedback.
- Performance: if rendering is heavy, add row virtualization for projects and/or assignment rows.
 - Testing: add integration tests (where supported) for multi-week selection and editing, optimistic updates with rollback, and ETag/412 conflict handling.

## Step 20 — Light Documentation
Prompt:
- Implement using lean, best‑practice docs. Keep content succinct and accurate; do not remove existing docs.
- Add a short section to `README.md` describing “Project Assignments” and the route `/project-assignments`, including that both grids share selection logic, use server week keys, support bulk edits with ETags, and reflect department/horizon in the URL.
- Do not remove existing docs.

---

Notes:
- We intentionally moved the project‑centric backend snapshot earlier (Step 3) and made it authoritative for all totals and deliverables shading to avoid client aggregation.
- Maintain consistent UI and error handling. All new code must be typed and follow the repo’s conventions.
