# Assignment Page Status Updates – Implementation Plan

## Overview
This plan enables project status updates directly from the Assignments page and restores two regressions: single‑cell hours editing and multi‑cell bulk entry. It reuses existing hooks/components and keeps UI changes minimal.

## Problem Statement
The status dropdown opens but selecting an option does not update the project status. Users should change project status from Assignments or Projects with full sync. Additionally:
- Single‑cell hours edits do not persist or affect totals.
- Multi‑cell selection entry no longer applies across weeks.

## Core Requirements
- Enable project status updates from Assignments page
- Maintain bi‑directional sync with Projects page
- Reuse existing hooks (lean approach)
- Optimistic updates with rollback on error
- Keep project status consistent across all assignment rows
- Restore single‑cell hours editing (persist + totals)
- Restore multi‑cell bulk entry for contiguous selections

## Pitfalls & Recommendations
- Status dropdown: Verify `onSelect` wiring. Close the dropdown in one place only (ideally via the optimistic callback) and emit a single status‑change event to prevent flicker.
- Cache sync: If `AssignmentGrid` owns local `projectsData`, keep it in sync with React Query cache (optimistic, success, rollback) or prefer a single source of truth.
- Concurrency: Prevent duplicate in‑flight mutations; ensure last‑write‑wins for rapid toggles.
- Errors: Use toasts instead of `alert()`; ensure rollbacks restore UI state and derived maps.
- Hours editing: Wire `saveEdit()` to call single/bulk updaters. Update BOTH `people` and `assignmentsData` to keep derived filters current.
- Numeric validation: Empty → 0, allow decimals, clamp < 0 to 0; consider an upper bound (e.g., 168) to catch typos.
- Bulk entry: Enforce a contiguous range within a single assignment row; group updates per assignment to minimize API calls; rollback per assignment on failures with one summary toast.
- Performance: Stabilize handlers with `useCallback` where needed; keep row components memoized.
- Accessibility: Announce status changes and saves (aria‑live/toasts); return focus to the trigger after dropdown closes.

---

## Root Cause Analysis (Hours Editing + Bulk Entry)
Observed in `frontend/src/pages/Assignments/AssignmentGrid.tsx`:
- `saveEdit()` is a placeholder and never calls persistence helpers.
- `updateAssignmentHours(...)` updates backend + `people`, but is never called from the edit flow.
- Derived Active/Hours set depends on `assignmentsData`, but edits only mutate `people`. This leaves `computeAllowedProjects` stale.
- Selection scaffolding exists, but bulk apply isn’t wired to the save path.
- Keyboard direct‑type starts edit but doesn’t branch to apply across a selection.

Fix summary:
- Wire `saveEdit()` to call `updateAssignmentHours(...)` (single‑cell) or `updateMultipleCells(...)` (multi‑cell).
- Update `assignmentsData` alongside `people` so derived sets and totals stay correct.
- Preserve the new UI; only re‑attach the missing behaviors.

---

## Prompt 1: Investigate Current Integration Chain
**Objective**: Identify broken connection points from dropdown click to API update.

**Tasks**
1. Examine `AssignmentGrid.tsx` – locate `StatusDropdown` usage and verify:
   - How `onSelect` is connected
   - Whether a status change handler exists and is implemented
   - How the dropdown integrates with existing hooks
2. Trace the data flow: `StatusDropdown.onSelect` -> `AssignmentGrid` handler -> `useProjectStatus` -> API.
3. Document findings in code comments (missing handlers, incomplete connections, reusable infrastructure).

**Success Criteria**
- Clear understanding of broken integration points
- Identification of reusable hooks
- Documented current vs required data flow

---

## Prompt 2: Implement Status Change Handler
**Objective**: Connect the dropdown to update logic via the existing hook.

**Tasks**
1. Add `handleStatusChange(projectId, newStatus)` in `AssignmentGrid`:
   ```ts
   const handleStatusChange = async (projectId: number, newStatus: Project['status']) => {
     try {
       await projectStatus.updateStatus(projectId, newStatus);
     } catch (err) {
       console.error('Status update failed:', err);
     }
   };
   ```
2. Connect handler to `StatusDropdown`:
   - Ensure `onSelect` calls `handleStatusChange`
   - Pass correct `projectId`
   - Avoid duplicate `onClose`; close centrally via optimistic callback
   - Disable while `projectStatus.isUpdating(projectId)`
3. Verify `useProjectStatus`/subscription hooks are initialized and `useUpdateProject` is available.

**Success Criteria**
- `StatusDropdown.onSelect` triggers `handleStatusChange`
- No TypeScript errors
- Handler reuses existing infrastructure

---

## Prompt 3: API Integration + Optimistic Updates
**Objective**: Ensure the status update calls the API and provides immediate UI feedback.

**Tasks**
1. Verify `useUpdateProject` hook is used by `useProjectStatus`.
2. Test optimistic UI updates: badge changes immediately; spinner during call; rollback on error.
3. Validate flow: API call -> backend update -> success response -> persistent UI update; error -> rollback + toast.
4. Update local project data: refresh `projectsData` (if locally owned) and ensure `getProjectStatus(projectId)` returns updated values; react‑query cache invalidates.
   - Keep local `projectsData` and cache consistent; prefer one source of truth when possible.
   - Emit exactly one pub‑sub event per update to avoid duplicate row updates.

**Success Criteria**
- Immediate optimistic feedback
- Backend updates persist after refresh
- Error states roll back optimistically applied changes
- No duplicate close/emit and no local/cache divergence

---

## Prompt 4: Cross‑Row Synchronization
**Objective**: When a project status changes, update all assignment rows for that project.

**Tasks**
1. Verify pub‑sub integration: `useProjectStatusSubscription` is initialized; `emitStatusChange` updates other rows; cleanup listeners.
2. Test multi‑row scenarios across the grid; confirm minimal re‑renders (memoization effective).
3. Validate memory/performance at scale.

**Success Criteria**
- Rows with the same project sync status changes
- Good performance and no memory leaks

---

## Prompt 5: End‑to‑End Testing
**Objective**: Validate the complete status update flow.

**Tasks**
1. Manual scenarios
   - Single assignment status change -> API call + UI update
   - Multiple assignments, same project -> all rows sync
   - Network error -> rollback + toast
   - Switch between Assignments and Projects -> bi‑directional sync holds
   - Toggle “Active or with hours” after hours edits -> derived filtering stays correct
2. Performance
   - Large grid (50+) updates smoothly
   - Rapid status changes -> no race conditions
   - Profiling confirms memoized rows + stable handlers prevent excessive re‑renders
3. Accessibility
   - Screen reader announces status changes
   - Keyboard navigation intact
   - Loading states announced; focus returns to trigger after close
4. Documentation: capture test scenarios, edge cases, and QA updates.

**Success Criteria**
- All manual tests pass
- No performance regressions
- Accessibility maintained
- Documentation updated

---

## Prompt 6: Polish + Documentation
**Objective**: Final cleanup and docs.

**Tasks**
1. Code cleanup: remove debug logs; ensure types; tidy imports.
2. UX: appropriate loading states; clear visual feedback; consider undo/redo if applicable.
3. Documentation: update `CLAUDE.md`; add user guide; document prop/API changes.
4. Build: compile without warnings; clean console in production; network requests well‑formed.

**Success Criteria**
- Clean, production‑ready code and docs
- Successful build and deployment
- Clear, consistent UX

---

## Prompt 7: Restore Single‑Cell Hours Editing (Persist + Totals)
**Objective**: Make inline hours edits stick, update totals, and preserve UI.

**Requirements**
- Persist on blur/Enter; empty -> 0; decimals allowed; clamp < 0 to 0.
- Update both `people` and `assignmentsData` to keep derived filters in sync.
- Use optimistic UI with rollback + toast; keep the current layout.

**Implementation Steps**
1. Replace `saveEdit()` placeholder with real persistence:
   - Parse to number (default 0, guard NaN).
   - If `selectedCells.length <= 1`, call `updateAssignmentHours(personId, assignmentId, week, value)`.
   - After success, also update `assignmentsData` for that `assignmentId`/`week` so `computeAllowedProjects` stays in sync.
   - On error, revert local change and show a toast.
   - Replace remaining `alert()` calls with `showToast`.
   - Optionally clamp to an upper bound (e.g., 168h/week).
2. Display hours from `assignment.weeklyHours[week]` for immediate optimistic rendering.
3. Enter saves and moves to next week; Escape cancels.
4. Input validation: numbers only, min 0.
5. Guard against filter‑induced disappearing edits by moving focus predictably (e.g., next visible cell).

**Acceptance Criteria**
- Single‑cell edit persists, updates totals, and derived Active/Hours remains accurate.
- No styling changes; state stays consistent.

---

## Prompt 8: Restore Multi‑Cell Bulk Entry (Shift‑Select Fill)
**Objective**: Apply hours across a contiguous selection of weeks in one action.

**Requirements**
- Shift‑select multiple week cells within the same assignment row; apply value to entire selection.
- Use existing `updateMultipleCells(...)` to minimize API calls.
- Optimistic UI with per‑assignment rollback on error; preserve grid look.

**Implementation Steps**
1. In `saveEdit()`, if `selectedCells.length > 1` and all belong to the same `personId`/`assignmentId`, call `updateMultipleCells(selectedCells, value)`.
   - After success, update both `people` and `assignmentsData` for affected weeks.
2. Keyboard: when multiple cells selected and user types, start editing and apply value to full selection on save (Enter/blur). Optionally support Ctrl+Enter as explicit “apply to selection”.
3. Navigation: preserve arrow/tab/enter; after bulk apply, collapse selection to last edited cell or move to next week.
4. Errors: toast and revert only affected weeks for the failed assignment.
5. Enforce contiguity and scope: range must be contiguous within one assignment row; otherwise constrain selection or show an error toast. Group updates by assignment (one PATCH per assignment).

**Acceptance Criteria**
- Contiguous selection fills correctly; backend updates with minimal API calls.
- Totals and Active/Hours filtering reflect changes immediately.
- No visual regressions; partial failures rollback appropriately with a single summary toast.

---

## Implementation Notes
### Lean Programming Principles
1. Reuse existing infrastructure: `useProjectStatus`, `useProjectStatusSubscription`, `useUpdateProject`.
2. Minimal viable change: focus on core functionality first.
3. Progressive enhancement: build on working foundation, not rewrite.
4. Single responsibility per component.
5. Fail fast: reuse established error‑handling patterns.
6. Prefer one source of truth for project state; when not feasible, keep local state and React Query cache synchronized in all success/rollback paths.
7. Replace blocking alerts with non‑blocking toasts for consistent UX.

### Key Technical Decisions
- No new API endpoints (use existing project update API)
- No new state management (leverage React Query cache)
- No new components (enhance existing StatusDropdown integration)
- No complex routing (maintain current page structure)

### Expected Outcome
Users can update project status on either page with:
- Immediate optimistic feedback and reliable error recovery
- Consistent cross‑page synchronization
- Maintained performance and accessibility
- No duplicate event emissions or dropdown close actions
- Clean, consistent UX with toasts instead of alerts

