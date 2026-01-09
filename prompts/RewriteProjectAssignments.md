# Project Assignments – Full Page Rewrite (Mini‑Project Plan)

This document outlines a focused rewrite of the **Project Assignments** page to make it *fast*, *clear*, and *pleasant to use*, while preserving the existing high‑level capabilities (bulk editing, conflict checks, totals, status controls, etc.).

The rest of the app largely works well; this is a targeted mini‑project to replace only the Project Assignments view with a better implementation.

---

## Goals & Non‑Goals

- **Goals**
  - Make cell interactions (click, drag, type, apply) feel *instant* on realistic data sets.
  - Preserve existing key workflows: viewing project loads, bulk editing hours across weeks and assignments, conflict warnings, totals, status updates, and role management.
  - Improve clarity: easier to understand what is selected, what is being edited, and what is saving.
  - Simplify the implementation so future changes are safer and cheaper.
- **Non‑Goals**
  - No major changes to backend APIs or data model unless clearly necessary.
  - No redesign of other pages (People view, dashboards, etc.).
  - No change to authorization / capabilities logic.

---

## Code Editing Rules

- Editing rules: Use `apply_patch` for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set‑Content/echo/sed) to modify code. Do not insert literal `\r\n` sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches. After edits, run the frontend type check/build to validate. When appropriate, refactor large or repetitive code into separate helper files, modules, services, or hooks to improve readability, maintainability, and reuse. Ensure all such extractions follow standard TypeScript modularization best practices and preserve existing functionality.
- Only use best‑practice programming; do not use shortcuts.

---

## Phase 0 – Discovery & UX Sketch

**Objective:** Capture how the page is used today and what “better” looks like before any code changes.

- Inventory current behaviors:
  - How bulk selection works (drag, shift‑click, keyboard).
  - How hours editing and Apply works (single cell vs multi‑cell).
  - How conflict checks, totals, roles, and project status integrate.
- Identify pain points:
  - Specific interaction steps that are slow or confusing.
  - Any accidental behaviors we *don’t* want to preserve.
- Draft UX notes / wireframes:
  - Preferred layout for desktop and minimal layout for mobile.
  - Clear selection visuals and saving states.
  - Where “Apply to N cells” feedback should show.
- Output: short UX/behavior notes section added to this file or a companion doc.

---

## Phase 1 – New Grid Architecture (Skeleton Only)

**Objective:** Introduce a clean, performance‑oriented grid structure in parallel with the existing page, without implementing all behavior yet.

- Create a new component (e.g., `ProjectAssignmentsGridV2.tsx`) that:
  - Uses a simpler, well‑encapsulated layout for rows and cells:
    - `ProjectRow` (project header, expand/collapse).
    - `AssignmentRow` (person + role + row of cells).
    - `WeekCell` (single cell; re‑use or refine existing `WeekCell` where it makes sense).
  - Keeps render state local:
    - Each row/cell is wrapped with `React.memo`.
    - Avoids a massive monolithic component doing everything.
  - Uses the same data sources and APIs as today (project snapshot endpoint) to ensure we can compare V1 and V2 side by side.
- Wire the new grid behind a feature flag or URL parameter:
  - Example: `?grid=v2` or a config flag so we can switch between old and new for testing.
- Output: a working but minimal grid that can render projects/assignments/weeks and scroll smoothly, with no editing or bulk behavior yet.

---

## Phase 2 – Interaction Model & State Design

**Objective:** Design a state model that keeps heavy logic away from event handlers and minimizes shared React state.

- Define **interaction state** for V2:
  - Selection: a lightweight model (anchor cell + current cell, or index bounds) managed by a dedicated hook (successor to `useCellSelection` but designed specifically for V2).
  - Editing: at most one active cell edit at a time, with the input’s value stored locally in the cell component.
  - Saving: a map or set of “cells currently saving” and a simple “apply batch in flight” flag.
- Define **data state**:
  - An immutable `projects` array (with nested assignments) used only for display.
  - Optional derived maps (assignment lookup by ID, totals by project) built via `useMemo`.
- Explicitly separate:
  - **Render state** (selection, editing, hover, open dropdowns).
  - **Server state** (data loaded from APIs).
  - **Derived state** (totals, conflict summaries).
- Document the state model in this plan so future changes have a clear reference.

---

## Phase 3 – Fast Editing & Bulk Apply

**Objective:** Implement editing and bulk apply with “instant feel” while reusing the existing backend bulk APIs and conflict checks.

- Implement cell editing:
  - Clicking or typing into a `WeekCell` enters edit mode with local value state.
  - Pressing Enter:
    - Validates and normalizes the value.
    - Applies the value **optimistically** to:
      - The in‑memory `projects` structure (only affected cells).
      - The local “saving cells” map.
    - Triggers a deferred batch save (see below) without blocking the key handler.
- Implement bulk selection:
  - Reuse the index‑based selection pattern (anchor + current cell → selection bounds).
  - Only compute the full list of selected cells when actually needed (apply, totals).
- Implement deferred batch saves:
  - A dedicated function (e.g., `runApplyBatchV2`) that:
    - Uses a precomputed assignment lookup map (ID → projectId + assignment ref).
    - Builds payloads for `bulk_update_hours` and conflict checks.
    - Updates totals after a successful save.
    - Rolls back optimistic changes on failure and clears saving flags.
  - Ensure it never runs inside input/mouse handlers directly; always via a microtask or `setTimeout(0)` from a small “apply” wrapper.
- UX and guardrails:
  - Show “applying…” indicators for large batches.
  - Prevent overlapping batches with a simple “batch in flight” flag and user‑friendly message.

---

## Phase 4 – Performance Hardening & Profiling

**Objective:** Confirm that the new grid truly fixes the interaction slowness and identify any remaining hotspots.

- Add basic performance probes:
  - Measure typical durations for `'mousedown'`, `'mouseup'`, and `'keydown'` handlers in DevTools.
  - Use the React Profiler to inspect render counts per interaction.
- Target thresholds:
  - Single‑cell click/selection: handlers consistently < ~50 ms.
  - Typing + Enter on a typical selection: perceived instant, with heavy work happening after the UI updates.
- Investigate and fix any new hotspots:
  - Prefer data‑structure changes or memoization over additional flags.
  - Keep all fixes local to V2; avoid touching other pages unless absolutely necessary.

---

## Phase 5 – UX Polish & Migration

**Objective:** Refine details, then promote the new grid to be the default Project Assignments experience.

- UX polish:
  - Clear selection styling and focus outlines.
  - Obvious “saving” and “conflict warning” indicators.
  - Helpful empty states and error messaging for failed loads or saves.
  - Keyboard accessibility: arrow/tab navigation and Escape to cancel editing.
- Migration steps:
  - Dogfood internally by enabling the V2 flag for a small group.
  - Fix bugs discovered during real‑world usage.
  - Once stable, flip the feature flag so V2 becomes the default, keeping V1 code path available for a short fallback window.
  - Eventually remove the old Project Assignments grid implementation to reduce maintenance cost.

### High‑Level Functionality Parity Checklist

Use this checklist before promoting V2 to ensure it preserves all important behaviors from the current Project Assignments page.

- **Filters & Context**
  - Department filter, including “include children” behavior.
  - Status filter chips (e.g., active / on hold / archived / Show All).
  - Weeks horizon selector (e.g., 4/8/12/20+ weeks).
  - “People view” link that mirrors current URL/filters.
- **Project Metadata & Actions**
  - Project name + client display (with truncation and tooltips where helpful).
  - Project Quick View popover (hover/focus + prefetch behavior).
  - Project status badge and editable dropdown, including status persistence and subscriptions.
  - Expand/collapse per project row.
  - “Expand all”, “Collapse all”, and “Refresh all” header actions.
- **Assignments & Roles**
  - Display of all assignments under a project when expanded.
  - Ability to add and remove assignments (with the same confirmation rules).
  - Role display and role dropdown per assignment (including sorting by role and department‑aware role lists).
- **Grid Interaction & Editing**
  - Single‑cell editing (click, double‑click, keyboard entry).
  - Multi‑cell selection via click, drag, and shift‑click.
  - Rectangular selection across rows × weeks.
  - Bulk apply of hours across selected cells.
  - Keyboard support: typing to start editing, Enter to apply, Escape to cancel, and arrow/tab navigation between cells.
- **Business Logic & Validation**
  - Conflict checks on hour changes (overallocation warnings).
  - Project totals recalculation per project (hoursByProject or equivalent).
  - Same treatment of invalid values (non‑numeric, negative) and warning toasts.
  - Handling of large selections with appropriate safeguards or feedback.
- **Visual Feedback**
  - Cell selection styling and focus outline.
  - “Saving” indicator per cell while hours are being persisted.
  - Display of warnings/errors via toast messages (success, error, warning).
  - Deliverable markers: vertical markers in cells and any “next deliverable” sorting behavior.
- **Mobile Experience**
  - Mobile layout equivalent: project cards with compact header.
  - Weekly hours spark bars and deliverable indicators.
  - Ability to expand/collapse projects on mobile.
  - Mobile‑friendly filters and status interactions.

---

## Success Criteria

- Interacting with the Project Assignments grid (click, drag, type, apply) feels smooth and responsive on realistic workloads, with no more long DevTools handler warnings for normal usage.
- Users can perform all the same tasks as before (and ideally with clearer feedback).
- The new implementation is significantly easier to reason about:
  - Smaller, well‑named components and hooks.
  - Clear separation between UI concerns, interaction state, and server/API logic.
