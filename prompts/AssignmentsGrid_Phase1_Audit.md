## Assignments Grid – Phase 1 Audit

This document maps the current spreadsheet implementation so later mobile refactors respect the desktop contract and backend expectations.

---

### Prompt 1a – Component + Data Dependencies

**PeopleSection (`frontend/src/pages/Assignments/grid/components/PeopleSection.tsx`)**
- Renders each person by piping props straight into `PersonSection`, but it **assumes the parent grid calculates and memoizes a `gridTemplate` string** that sets pixel-based widths for every column (client, project, +/- button, every week). Any responsive rewrite must centralize column definitions so headers, rows, and totals still share the same CSS grid template.
- Relies on **`loadingAssignments` being a `Set` keyed by person id** to show skeleton rows when a person expands. If we lazy-load assignments on mobile we must keep this sentinel set in sync or the component will believe assignments never load.
- Delegates selection/edit handlers (`onCellMouseDown`, `onCellMouseEnter`, `onCellSelect`) that are calculated from `useCellSelection`. These handlers expect **mouse events fired from table cells**; without them drag selection will never start. A touch-friendly layer has to translate tap/long-press gestures back into these callbacks.
- Uses `renderWeekTotals` and `renderAddRow` render props. Any alternate layout still has to invoke those render props so backend rollups (`hoursByPerson` from `useAssignmentsSnapshot`) keep their alignment.

**AssignmentRowComp (`frontend/src/pages/Assignments/grid/components/AssignmentRow.tsx`)**
- Grid row layout is fixed via the same `gridTemplate` string, so **week columns will not shrink fluidly**; each has the fixed width computed by `useGridColumnWidths`. Attempting to compress columns for mobile without updating that hook will break horizontal alignment between header and body.
- Selection/edit state comes from `useCellSelection` + `useEditingCell`. The row re-renders when `selectedCells` or `selectedCell` change. Because those structures store `rowKey = personId:assignmentId`, **any mobile presenter must keep identical row keys** or selection math will highlight the wrong cells.
- Week data expects `mondays` to match `weeks` from `useAssignmentsSnapshot`. If we request a subset of weeks on mobile we still need to **preserve ISO week keys** so updates continue to serialize into the backend’s `weeklyHours` object.
- Each cell dispatches `onSelect`, `onMouseDown`, `onMouseEnter` which are all mouse-specific; without synthesizing pointer/touch events, multi-cell copy and keyboard navigation (which piggy-back on selected cell state) will break.

**WeekHeaderComp (`frontend/src/pages/Assignments/grid/components/WeekHeader.tsx`)**
- Implements the horizontal scroll container that keeps week headers aligned to body columns. It demands a **shared `minWidth`** and the same grid template. The header also uses `ref` + `onScroll` from `useScrollSync`; the body must keep exposing `scrollRef` hooks for mobile, otherwise `useScrollSync` will throw null refs and headers will drift.
- Column resizing relies on `onStartResize` capturing mouse events on a 1px drag target – totally unusable on touch. Any responsive change that hides/changes these handles needs to remove or gate the handler so users don’t accidentally trigger `preventDefault` on taps.
- Week clicking uses `onWeeksClick` to trigger sort/reload operations (`WeekHeader` doesn’t know the action). Mobile gestures must still provide a discrete tap target or the backend filter toggles will become inaccessible.

**StatusBar (`frontend/src/pages/Assignments/grid/components/StatusBar.tsx`)**
- Simply renders the utilization legend + `selectionSummary`. Width is unrestricted, but it expects `selectionSummary` strings such as `"2 rows × 4 weeks = 8 cells"` coming from `useCellSelection`. If mobile introduces per-person accordions we need to supply equivalent summaries or hide the legend entirely; otherwise the bar will display stale keyboard-only information.

**`useAssignmentsSnapshot` (`frontend/src/pages/Assignments/grid/useAssignmentsSnapshot.ts`)**
- Treats the backend snapshot as the **source of truth for `weekKeys`, `people`, and `hoursByPerson`.** After loading, it resets local people/assignments before progressively filling them. Mobile presenters must keep using this hook (or share its state) because it controls:
  - Async job fallback for large week windows (switches between synchronous `getGridSnapshot` and the async job/polling path).
  - Department + include-children filters that the backend expects (passed through `assignmentsApi` and `peopleApi` calls).
  - Deliverables + projects hydration which downstream hooks (`useDeliverablesIndex`, status dropdowns) depend on.
- Because it **mutates shared React state via setters from `AssignmentGrid`**, a second presenter can’t just call it independently—the data contract would race. We either reuse the same hook instance or provide a derived store when swapping to mobile layouts.

**Scroll + Layout Utilities**
- `useScrollSync` (header/body refs) assumes both containers exist and are scrollable horizontally. If we swap to stacked accordions, we must either stub those refs or guard the hook usage to avoid null derefs.
- `useGridKeyboardNavigation` attaches a `keydown` listener on `window` while a cell is selected. Any new input model must explicitly toggle selection state, otherwise the hook will keep intercepting keys even if the component isn’t visible.

---

### Prompt 1b – Touch Interaction Gaps

| Existing Interaction | Implementation Details | Mobile/Tap Issues | Proposed Touch-Friendly Replacement |
| --- | --- | --- | --- |
| **Drag-select across cells** | `useCellSelection` listens to `onMouseDown`, `onMouseEnter`, global `mouseup` to form rectangular selections. | Touch devices don’t fire `mouseenter`/`mouseup` the way the hook expects; Safari iOS suppresses `preventDefault` on passive listeners, so drag-select silently fails. | Introduce a pointer-events layer: on touchstart, record anchor and listen to `pointermove` to update `selectedCell`. Alternatively, long-press to enter “selection mode” and expose +/- buttons for expanding week ranges. |
| **Keyboard navigation / inline typing** | `useGridKeyboardNavigation` binds `window.keydown` to move focus with arrows/tab/enter and to start editing when users type digits. | On mobile there’s rarely a hardware keyboard. The hook never fires, so users have no way to open the inline editor without double-tapping precision cells. | Provide explicit on-cell tap actions: single tap selects, double tap opens hour input, swipe left/right to jump weeks. Tie these gestures back into `setEditingCell`/`setEditingValue` so backend payloads remain identical. |
| **Scroll-sync header/body** | Horizontal scroll events propagate via `useScrollSync`. | On mobile, horizontal scroll is the primary navigation gesture, but the body container often captures vertical scroll causing jitter. Without adjustments, the sticky header may lag because `onScroll` fires with momentum. | Replace the two distinct scroll containers with a single overflow wrapper below 1024px, or throttle `onBodyScroll` for pointer types = touch. Provide snap points so the user can swipe one week at a time. |
| **Status interactions (Project status dropdown, remove button)** | Buttons are small (24px) with hover cues; resizing/resizing columns uses 1px drag handles from `WeekHeader`. | Finger-sized tap areas are insufficient; resizing handles interfere with attempts to open project cards; small remove buttons are easy to mis-tap. | Hide column resizers on touch pointers, surface menu buttons inside each assignment row, and move destructive actions into bottom sheets with clear confirmation. |
| **Legend/Selection summary** | `StatusBar` only reflects `selectionSummary` from mouse/keyboard selection logic. | When selection never changes (because drag-select doesn’t work), the summary stays empty, misleading users. | Either hide the summary until touch-friendly selection ships or supplement with badges that show aggregated hours independently of selection. |

**Additional gestures to define**
1. **Multi-week editing:** Provide a contextual “Edit selected weeks” sheet triggered by long-press on a week pill; apply updates via existing `sanitizeHours` + `updateAssignmentRoleAction`.
2. **Scroll to person/assignment:** Add jump controls or segmented sections because the existing two-pane layout presumes large landscape viewports.
3. **Touch keyboard focus:** Inline inputs should open a numeric keypad; hook into `startEditing` to focus a hidden `<input type="number" inputmode="decimal">`.

By documenting these dependencies now, any Phase 2 responsive work can respect the backend snapshot contract, keep selection/scroll state in sync, and design new gestures that still drive the same hooks (`useCellSelection`, `useGridKeyboardNavigation`, `useAssignmentsSnapshot`) instead of duplicating data flows.
