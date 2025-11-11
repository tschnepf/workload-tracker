# Project Assignments — Parity With Assignments (Visual + UX)

General rules for every step:
- Implement using lean, best‑practice code. Do not use hacks, quick fixes, or remove code to “make it compile.” Fix issues at their root. Keep calculations server‑authoritative.
- Mirror the Assignments page look‑and‑feel and behavior; only the grouping is inverted (project → people rows).
- Maintain accessibility and keyboard parity. Preserve URL state and performance characteristics.

---

## Step 1 — Toggle On Row Click + Chevron
Prompt:
- Update `frontend/src/pages/Assignments/ProjectAssignmentsGrid.tsx` so clicking the entire project summary row toggles expand/collapse (no separate Expand button).
- Add a chevron/triangle icon before the project name that rotates when expanded, matching the style used on the Assignments page.
- Ensure action icons inside the row (status, refresh, add person) call `e.stopPropagation()` so they don’t toggle expansion.
- Sync expanded IDs to the `expanded` query param (URL) exactly as done in the person grid. Lazy‑load assignment rows on first expand.
- Implement with lean, best‑practice code and no duplication.

## Step 2 — Icon‑Only Actions (Refresh + Add Person)
Prompt:
- Replace “Refresh totals” text button with an icon‑only circular refresh button matching the Assignments page sizing, hover states, and spinner when loading.
- Replace “Add person” text button with a plus icon (same size/hover as person grid’s add button) that opens the inline person combobox row.
- Confirm both buttons stop propagation, and have appropriate `title` tooltips.
- Keep concise, accessible labels and aria where relevant.

## Step 3 — Column Layout + Resizing Parity
Prompt:
- Mirror left‑frozen columns and default widths from the Assignments page:
  - Client column width identical to Assignments.
  - Project column width identical to Assignments.
  - Icon/action column set to same fixed width.
- Add the same column resize handles and event handlers (start drag, mouse move/up), reusing the logic from `frontend/src/pages/Assignments/AssignmentGrid.tsx`.
- Either refactor common helpers into a small shared module under `frontend/src/pages/Assignments/grid/` or inline carefully; avoid circular imports.
- Ensure gridTemplateColumns and total min‑width computations match.

## Step 4 — Header + Week Header Parity
Prompt:
- Make the header composition match Assignments: title, subtitle (“Manage team workload allocation across {weeks.length} weeks”), and snapshot/legacy chip.
- Measure `headerRef` and set sticky week header offset exactly as the person grid does.
- Align filter controls (department + project status chips) to mirror the person grid header layout.
- Keep the “Switch view” link styled and placed identically.

## Step 5 — Week Cells: Selection, Hover, Edit States
Prompt:
- Ensure week cell CSS classes for hover, border, selection highlight, and editing state exactly match the Assignments page.
- Editing: double‑click starts editing; Enter commits; Escape cancels. Show the same subtle saving spinner overlay on edited cells while requests are in flight.
- Preserve server‑authoritative totals: after commit, refresh totals via `getProjectTotals` or use server deltas if available. Do not recompute totals client‑side.
- Keep multi‑week row‑scoped selection behavior identical (Shift+click/drag, keyboard arrows) using the existing `useCellSelection` hook.

## Step 6 — Conflict Checking (Parity)
Prompt:
- Before committing hours, run `assignmentsApi.checkConflicts(personId, projectId, weekKey, proposedHours)` as the person grid does, and surface warnings in a toast/inline panel consistent with Assignments.
- Do not block the UI; show actionable guidance consistent with current patterns.

## Step 7 — Loading Skeletons + Empty State
Prompt:
- Match the loading skeleton layout: week header shimmer, assignment rows shimmer (names/avatars placeholder, week cell blocks) using the same sizes/colors/radii as Assignments.
- Empty state for expanded project with no assignments should render the same muted copy and spacing as the person grid.

## Step 8 — Footer Legend Parity
Prompt:
- Add the utilization legend bar at the bottom with the same ordering, labels, and colors: Available, Busy, Full, Overallocated.
- Match font sizes and spacing.

## Step 9 — Deliverables Shading + Tooltips (Visual)
Prompt:
- Keep server‑provided deliverables shading but ensure the tint and layering (background shade, selection overlay precedence) match the Assignments grid.
- Tooltips: use the same tooltip style; if Assignments shows detailed text, mirror that style (if the server exposes only counts, show count; otherwise show concise preview strings).

## Step 10 — Accessibility + Keyboard Parity
Prompt:
- Project summary row has `role="button"` and `aria-expanded` reflecting state.
- Week header cells and week cells include the same aria attributes used by the Assignments page (e.g., `aria-selected`).
- Keyboard map identical: ArrowLeft/ArrowRight move selection, Tab/Shift+Tab traverse inputs, Enter starts editing/confirm, Escape cancels/clears selection, Space toggles row expand.
- Maintain a polite live region for selection summary and bulk‑edit feedback.

## Step 11 — URL State + Persistence
Prompt:
- Persist column widths in `localStorage` with the same keying and restore behavior as Assignments.
- Sync weeks, status filters, and expanded project IDs via URL query using the shared `useGridUrlState` hook. Confirm back/forward navigations restore state and expansions.
- Keep behavior consistent across “Switch view” navigation (person ↔ project).

## Step 12 — Optional Backend Enhancements (Only If Needed)
Prompt:
- If detailed deliverable tooltips are desired, extend `/api/assignments/project_grid_snapshot/` to include short preview strings per week (bounded to a couple entries) and wire them into the tooltip.
- If initial project snapshot calls are still heavy, add `/api/assignments/project_grid_snapshot_async/` (Celery job + status polling) mirroring the people grid, and update the UI to poll `jobsApi` until done.
- Keep response shapes consistent and document changes in `backend/openapi.json`.

## Step 13 — QA + Visual Audit
Prompt:
- Compare the project page to the person grid side‑by‑side for:
  - Spacing/padding, typography, and icon sizes
  - Hover/selection states and editing spinners
  - Sticky header offset and scroll behaviors
  - Skeletons, empty states, and legend
- Validate keyboard and screen reader flows match.
- Fix any visual discrepancies surgically; do not introduce hacks or regressions.

---

References
- Person grid for parity: `frontend/src/pages/Assignments/AssignmentGrid.tsx:1`
- Project grid to update: `frontend/src/pages/Assignments/ProjectAssignmentsGrid.tsx:1`
- Shared utils (selection, week header): `frontend/src/pages/Assignments/grid/*`
- Backend snapshot endpoints: `backend/assignments/views.py:1`

Notes
- Preserve server‑authoritative data flow (no client totals/deliverables math).
- Maintain ETag usage and friendly error flows already implemented.
- Keep changes focused and consistent with existing code style.

