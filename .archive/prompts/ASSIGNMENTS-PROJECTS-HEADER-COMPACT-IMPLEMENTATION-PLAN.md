# Compact Headers for Assignments and Project Assignments — Implementation Plan

Goal: Rework the Assignments and Project Assignments page headers to be compact, move the blue‑boxed controls into the global top bar, and snap the week header directly under the top bar. Deliver using lean, maintainable code. No shortcuts or band‑aid fixes.

Scope
- Pages: `Assignments` (people view grid) and `Project Assignments` (projects view grid).
- Move into the global top bar: title, subtitle, weeks selector (8/12/16/20), view switch link, expand/collapse/refresh, and status filter chips.
- Make the sticky week header sit immediately beneath the top bar across both pages.
- No backend API changes. Keep URL/state persistence behavior intact.

Design Overview
- Introduce a Top Bar Slots API in `Layout` so pages can render contextual controls (left/right slots) and clean them up on unmount.
- Factor compact, shared UI parts (WeeksSelector, StatusFilterChips, HeaderActions) into reusable components used by both pages.
- Do NOT compute top bar height for sticky positioning; week headers will be `position: sticky; top: 0` within the page scroll container.
- Ship behind a feature flag for safe rollout.

Assumptions
- Global top bar is rendered in `frontend/src/components/layout/Layout.tsx`.
- Status filters and URL/localStorage persistence already exist; we reuse the same handlers and state.
- Week header components accept a `top` style prop; in compact mode we set that to `0`.

---

## Phase 0 — Feature Flag, IDs, and Density Controls

Prompt 0.1 — Add feature flag (compile‑safe)
- File: `frontend/src/lib/flags.ts`
  - Add `'COMPACT_ASSIGNMENT_HEADERS'` to the `FlagName` union and map it to `VITE_COMPACT_ASSIGNMENT_HEADERS` in `ENV_KEYS`.
  - Default to `false` initially (use `getFlag('COMPACT_ASSIGNMENT_HEADERS', false)`). We will flip to `true` after validation.

Prompt 0.2 — Tag the top bar and add compact padding control
- File: `frontend/src/components/layout/Layout.tsx`
  - Add `id="app-topbar"` to the top bar container (no behavior change; useful for debugging and tests).
  - Add a lightweight density API: `useLayoutDensity()` (context) exposing `setMainPadding('default'|'compact')`. Implement by toggling the `py-*` classes on the `<main>` element.
  - Safety: Provide a no-op default implementation so pages/tests that render without the provider do not throw when calling `setMainPadding`.

Validation
- `npm run build` passes.
- No visual changes yet with the feature flag off.

---

## Phase 1 — Top Bar Slots Infrastructure

Prompt 1.1 — Add Top Bar Slots provider
- File: `frontend/src/components/layout/TopBarSlots.tsx`
  - Provide React context with two slots: `left`, `right`.
  - Export `useTopBarSlots()` with `setLeft(node: ReactNode)`, `setRight(node: ReactNode)`, and convenience `clearLeft()`, `clearRight()`.
  - Require usage pattern: set inside `useEffect` and clear in the cleanup to avoid leaks and flicker on navigation.
  - Ensure cleanup on unmount (restore previous/clear). Avoid module‑level singletons; keep everything in React state.

Prompt 1.2 — Render slots in Layout
- File: `frontend/src/components/layout/Layout.tsx`
  - Wrap the header bar with `TopBarSlotsProvider` and render slot content.
  - Left area: `[GlobalDepartmentFilter] [Page‑injected left content]`
  - Right area: `[Page‑injected right content] [Log out button]`
  - Preserve keyboard accessibility and existing focus behaviors.
  - Timing: pages should set slot content as early as possible (top-level component body with `useEffect`) to prevent brief legacy header flashes.

Validation
- Temporary demo component mounts slot content, which appears and clears upon navigation.

---

## Phase 2 — Shared Compact Components

Prompt 2.1 — Compact WeeksSelector
- File: `frontend/src/components/compact/WeeksSelector.tsx`
- Props: `value: number`, `onChange: (n: number) => void`, `options?: number[]` (default `[8,12,16,20]`).
- Render small buttons with accessible labels; no additional logic.

Prompt 2.2 — Compact StatusFilterChips
- File: `frontend/src/components/compact/StatusFilterChips.tsx`
- Props: `options: readonly string[]`, `selected: Set<string>`, `format: (s:string)=>string`, `onToggle:(s:string)=>void`.
- Horizontally scrollable chip row (`overflow-x-auto`, `min-w-0`, `whitespace-nowrap`, `scrollbar-gutter: stable`), keyboard focusable.
- Accessibility: each chip uses `aria-pressed` and an `aria-label` with the formatted status name.

Prompt 2.3 — HeaderActions group
- File: `frontend/src/components/compact/HeaderActions.tsx`
- Props: `onExpandAll`, `onCollapseAll`, `onRefreshAll`, `disabled?: boolean` (also sets `aria-busy`).

Prompt 2.4 — Cross-link builder util
- File: `frontend/src/pages/Assignments/grid/linkUtils.ts`
- Export `buildAssignmentsLink({ weeks, statuses })` and `buildProjectAssignmentsLink({ weeks, statuses })` that preserve current query params (e.g., `weeks`, status filters, department scope when applicable). Use these helpers in both pages to avoid drift.

Prompt 2.5 — GlobalDepartmentFilter export compatibility
- If mixed import styles exist, add a re-export so both `import GlobalDepartmentFilter` and `{ GlobalDepartmentFilter }` remain valid. This avoids broad refactors when wiring slots.

Validation
- Mount components in isolation (unit tests or a local demo) to verify props and rendering.

---

## Phase 3 — Assignments Page (People view) Migration

Prompt 3.1 — Mount compact header into top bar slots (flag‑guarded)
- File: `frontend/src/pages/Assignments/AssignmentGrid.tsx`
- If `getFlag('COMPACT_ASSIGNMENT_HEADERS', false)` is true:
  - Do NOT render `<HeaderBarComp />`.
  - Use `useTopBarSlots()`:
    - Left slot: Title `Assignments` (text-lg) + subtitle (text-xs) + inline `WeeksSelector`.
    - Right slot: `StatusFilterChips` + `HeaderActions` wired to existing handlers/state.
  - Call `useLayoutDensity().setMainPadding('compact')` on mount; restore to `default` on unmount.

Prompt 3.2 — Week header snapping and scroll sync
- Set the sticky week header `top` to `0` (no measurement). Remove `headerRef/headerHeight/ResizeObserver` used only for vertical offset.
- Keep existing horizontal scroll sync between header/body; do not alter IDs/refs used for that sync.
 - Remove any paddings/margins or inline styles that referenced the old header height to avoid stray gaps.

Prompt 3.3 — Avoid duplication with GlobalDepartmentFilter
- The Layout already renders a global department filter. Do not pass `rightActions` to that component from the page in compact mode; place actions in the right slot instead.

Validation
- Build passes. Manually verify: compact top bar, week header directly under top bar, actions/filters functional.

---

## Phase 4 — Project Assignments Page (Projects view) Migration

Prompt 4.1 — Mount compact header into top bar slots (flag‑guarded)
- File: `frontend/src/pages/Assignments/ProjectAssignmentsGrid.tsx`
- If the flag is true:
  - Remove the page’s bulky 2‑row header block.
  - Use `useTopBarSlots()`:
    - Left slot: Title `Project Assignments` + subtitle + `WeeksSelector` + compact `People View` link (preserve current URL param behavior).
    - Right slot: `StatusFilterChips` + `HeaderActions` wired to existing handlers and loading flags.
  - Call `useLayoutDensity().setMainPadding('compact')` on mount; restore on unmount.

Prompt 4.2 — Week header snapping and scroll sync
- Set the sticky week header `top` to `0`. Remove any header height measurement code (and ResizeObserver) used only for vertical offset.
- Preserve horizontal scroll sync and column resize behavior.
 - Remove any paddings/margins that depended on header height to prevent vertical misalignment.

Validation
- Build passes. Week header aligns directly under the top bar. No duplicate headers.

---

## Phase 5 — State, URL, and Persistence

Prompt 5.1 — Preserve existing persistence semantics
- `WeeksSelector` reads/writes `weeks` via the page’s existing URL state hook (e.g., `useGridUrlState`).
- `StatusFilterChips` uses the same `selectedStatusFilters`, `toggleStatusFilter`, and `format` utilities already in use (localStorage persistence remains unchanged).
- Source of truth:
  - Assignments page uses its current status filter hook (e.g., `useProjectStatusFilters`).
  - Projects page uses `useProjectFilters` (and its `statusOptions`), not hardcoded lists.
- Carry over query params for cross‑links (People <-> Projects views).

Validation
- Refresh the page after changing filters and week count: values persist as before.

---

## Phase 6 — Theming, Density, and Z‑Index

Prompt 6.1 — Apply compact tokens and stacking rules
- Typography: title `text-lg`, subtitle `text-xs`, controls `text-xs`.
- Ensure adequate contrast, hover, and visible focus rings.
- Set top bar above week header (`z-30` vs `z-20`) to avoid overlap glitches; dropdowns/menus should render at `z-50`.
- Avoid creating new stacking contexts (e.g., CSS `transform`) on ancestors of dropdowns to prevent unintended layering.

Validation
- Visual pass across common widths; verify no clipping or overlapping.

---

## Phase 7 — Tests

Prompt T1 — Type & build checks
- Run `npm run build` in `frontend` and resolve any type errors.

Prompt T2 — Infrastructure unit tests
- Top Bar Slots: mounting/unmounting replaces/clears content; no leaks.
- (Optional) Layout density: toggling padding updates `<main>` classes.

Prompt T3 — Page interaction tests (JSDOM)
- With flag on, mount each page and assert:
  - Legacy header blocks are absent.
  - Top bar contains weeks selector, status chips, and actions.
  - Sticky week header computes `top: 0` and renders before the first grid row.
  - Toggling a status chip calls the provided handler.

Prompt T4 — Persistence and URL tests
- Pre-seed localStorage with a custom status selection; mount and assert chips reflect it.
- Change weeks via selector; assert URL query param updates and persists across remount.

Prompt T5 — Scroll sync unit
- Programmatically scroll the week header container; assert the grid body scroll position matches (and vice versa). Keep DOM structure used for sync unchanged.

Prompt T6 — E2E sanity (optional if infra available)
- Navigate to both pages; verify the week header remains snapped under the top bar while scrolling and column resize still works.

Prompt T7 — Accessibility smoke checks
- Ensure interactive elements have accessible names and are keyboard navigable.

Prompt T8 — Dropdown layering checks
- Open a status dropdown near the week header and assert it appears above grid cells and the week header (z-index sanity).

Prompt T9 — Slot cleanup on route change
- Navigate from a page that sets slots (Assignments) to one that does not; assert the top bar no longer shows page-injected content immediately after navigation.

---

## Phase 8 — Rollout & Docs

Prompt 8.1 — Enable flag and document
- Ship with `COMPACT_ASSIGNMENT_HEADERS=false` by default. After validation, enable to `true`.
- Add a brief doc in `docs/` describing the Top Bar Slots API, density control, and how to inject page content.
- Document `setRuntimeFlag('COMPACT_ASSIGNMENT_HEADERS', true)` to ease local testing and CI tests that need the feature on.

Acceptance Criteria
- Blue‑boxed controls live in the global top bar on both pages.
- Week header sits directly under the top bar (`sticky; top: 0`).
- All controls behave as before; URL/localStorage persistence intact.
- No backend changes required; no broken routes or regressions to scroll/resize sync.
