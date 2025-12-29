# Speeding Up Project Assignments Grid Interactions (Plan)

This document focuses on making **cell interactions** (click, drag, type, apply) on the Project Assignments page feel fast and responsive. Rendering itself is not the primary bottleneck; the main issue is how much work happens inside event handlers and during bulk apply.

---

## Code Editing Rules

- Editing rules: Use `apply_patch` for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set‑Content/echo/sed) to modify code. Do not insert literal `\r\n` sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches. After edits, run the frontend type check/build to validate. When appropriate, refactor large or repetitive code into separate helper files, modules, services, or Hooks to improve readability, maintainability, and reuse. Ensure all such extractions follow standard TypeScript modularization best practices and preserve existing functionality.
- Only use best practice programming, do not use any shortcuts.

---

## Completed Work (Baseline)

These pieces are already implemented in the Project Assignments grid and form the baseline for the plan below:

- Extracted `WeekCell` into its own component and wrapped it in `React.memo`.
- Localized the input value to each `WeekCell` (typing only re-renders the active cell).
- Switched selection to use `getSelectedCells()` so the full list of selected cells is computed lazily instead of on every drag.

The remaining phases focus on the heavier parts of interaction: the bulk apply path, lookup reuse, and further slimming of event and selection logic.

---

## Phase 1 – Make “Apply” (Enter) Fast and Defer Heavy Work

**Goal:** Pressing Enter to apply changes should feel instant; heavy work (saving, conflict checks, totals) should happen *after* the UI updates.

1. **Introduce a lightweight “apply” wrapper**
   - Add a function (e.g., `applyValueInstant(assignmentId, weekKey, value)`) that:
     - Updates the in‑memory data for the affected cells.
     - Marks those cells as “saving” (spinner/indicator).
     - Returns immediately, without:
       - Scanning all projects/assignments.
       - Calling any APIs.
       - Recomputing totals.

2. **Move heavy work into a deferred task**
   - Inside the wrapper, schedule a follow‑up task using `setTimeout(0)` or a microtask (e.g., `Promise.resolve().then(...)`), delegated to a separate function such as `runApplyBatch(updatesMap, touchedProjects)`:
     - Build the full updates map for all selected cells (using the lookup map from Phase 2).
     - Call the bulk update API (`bulk_update_hours` or `update` for single items).
     - Run conflict checks.
     - Refresh project totals.
   - On success:
     - Clear “saving” flags.
     - Update totals from the latest backend data.
     - Show any conflict warnings.
   - On failure:
     - Roll back local changes to their previous values.
     - Clear “saving” flags.
     - Show an error toast.

3. **Wire Enter to the instant wrapper**
   - When the user presses Enter in a cell:
     - Call `applyValueInstant` (fast) instead of directly running the heavy logic.
   - **Acceptance:** Values and “saving” spinners appear almost immediately; the grid no longer feels frozen while the backend work runs.

---

## Phase 2 – Precompute and Reuse Lookup Structures

**Goal:** When applying to N cells, do work proportional to those N cells, not to the entire grid.

4. **Build assignment lookup maps once per projects change**
   - Add a `useMemo` near the `projects` state that builds:
     - `assignmentById: Map<assignmentId, { projectId, assignmentRef, personId }>`.
   - Recompute this map only when `projects` change (e.g., after initial load, refresh all, or mutations that change assignments).
   - This step can be implemented before or alongside Phase 1 so the instant/deferred apply logic never needs to rescan the entire grid to find assignments.

5. **Use lookup maps in the deferred apply logic**
   - In the heavy part of apply (Phase 1 deferred task, e.g., inside `runApplyBatch`):
     - Replace any loops that walk through all projects and assignments to find IDs with direct lookups from `assignmentById`.
   - Optionally add a small “apply lock” flag (e.g., `isApplyingBatch`) to prevent overlapping apply batches; show a warning if the user tries to start another batch before the first one finishes.
   - **Acceptance:** Bulk applies over many cells are noticeably faster because we avoid scanning the whole grid each time.

---

## Phase 3 – Slim Down Per‑Event Handler Work

**Goal:** Clicking, dragging, and pressing keys should do minimal work in each handler so the browser can respond immediately.

6. **Audit cell event handlers**
   - For `mousedown`, `mousemove` (drag), `mouseup`, and `keydown` on cells:
     - Ensure they only:
       - Update selection state.
       - Enter or exit edit mode.
       - Call the **instant** apply wrapper (for Enter).
     - Remove any:
       - Loops over projects/assignments.
       - Totals recomputation.
       - API calls.

7. **Batch state updates**
   - Where handlers currently call multiple `setState` functions, combine them when possible:
     - Prefer a single `setState` that updates a small, focused piece of state.
   - **Acceptance:** DevTools “`mousedown` handler took X ms” and similar warnings are reduced; interactions feel more direct and less “sticky.”

---

## Phase 4 – Reduce Selection Overhead Further

**Goal:** Dragging a selection across many cells should not trigger heavy calculations; selection should be cheap to update and evaluate.

8. **Use index‑based selection in cells**
   - Continue using `useCellSelection(weeks, rowOrder)` as the single source of truth for selection.
   - Take advantage of `rowIndex` and `weekIndex` now passed into each cell:
     - Expose helper(s) from `useCellSelection`, such as:
       - A `selectionBounds` object (`rowLo`, `rowHi`, `weekLo`, `weekHi`), or
       - A predicate that works on indices only (e.g., `isIndexSelected(rowIndex, weekIndex)`).
     - In `WeekCell`, derive `isSelected` using these bounds/indices rather than repeatedly looking up string keys.
   - Ensure selection updates (dragging) only adjust selection bounds, not large arrays or derived lists.

9. **Keep `getSelectedCells` truly lazy**
   - Ensure `getSelectedCells()` is only called when necessary, for example:
     - During apply (Enter or explicit “Apply” action).
     - During other explicit bulk actions that need the list.
   - Dragging / clicking should only update `selectionStart` and `selectedCell`, not eagerly materialize all selected cells.
   - **Acceptance:** Drag‑selecting across many cells no longer causes long `'mousemove'` or `'mouseup'` handlers; the highlight keeps up with the mouse.

---

## Phase 5 – Profiling and Checkpoints

**Goal:** Confirm that each phase actually reduces interaction cost and avoid over‑optimizing the wrong areas.

12. **Profile after Phase 1 and Phase 2**
    - Use Chrome Performance + React Profiler to compare before/after for:
      - Time spent in the Enter handler (should drop sharply once apply is split and lookup maps are used).
      - Number of renders triggered per apply and per keypress in an edited cell.

13. **Re‑evaluate before deeper structural changes**
    - If, after Phases 1–2, typical interactions are still consistently > ~100ms for normal selections:
      - Revisit the instant/deferred apply logic for additional batching or chunking of updates.
      - Confirm `getSelectedCells()` is not being called from render paths.

---

## Phase 6 – Fine‑Tune UX Feedback Around Heavy Operations

**Goal:** Even when backend operations take time, the user should feel the system is responsive and transparent about what it’s doing.

10. **Improve status feedback**
    - When a large apply is in progress:
      - Show a small “Applying changes…” indicator in the header or footer of the grid.
      - Ensure affected cells show a clear “saving” state.
    - This does not change actual speed, but makes waiting feel intentional rather than like the app is frozen.

11. **Optionally guard against extreme selections**
    - For very large selections (e.g., thousands of cells):
      - Prompt the user: “Apply to 2,000 cells? This may take a moment.”
      - Optionally process updates in smaller batches (e.g., 200–500 cells at a time) if needed for stability.

---

## Recommended Implementation Order

1. **Phase 1 & Phase 2 together:** Introduce instant apply + deferred heavy work and precompute assignment lookup maps (biggest win for perceived speed and CPU usage).  
2. **Phase 3:** Slim down event handlers so interactions do almost no heavy work.  
3. **Phase 4:** Refine selection logic to be strictly index‑based and only materialize cell lists on demand.  
4. **Phase 5:** Profile and validate that interactions are now within acceptable latency, adjusting batching if needed.  
5. **Phase 6:** Add UX polish (status indicators, large‑selection guardrails) once core performance is solid.
