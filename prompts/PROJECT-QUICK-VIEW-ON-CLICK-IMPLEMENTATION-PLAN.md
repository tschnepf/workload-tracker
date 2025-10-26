# Project Quick View on Name/Pill Click — Popover Implementation Plan

This plan delivers a reusable, accessible Project “Quick View” popover (anchored panel, no navigation) that shows the same details as the Projects page panel when users click a project name or pill. It emphasizes lean programming: single source of truth, minimal duplication, incremental changes, strong typing, and coordinated frontend/backend use of existing APIs and caches.

The prompts are prescriptive and can be fed directly to the AI‑Agent. Complex items are split into focused sub‑steps to reduce risk and avoid broad, breaking changes.

---

## Phase 0 — Discovery & Acceptance Criteria

- Confirm touchpoints to open Quick View (no navigation):
  - Assignments: `frontend/src/pages/Assignments/ProjectAssignmentsGrid.tsx`
  - Assignments (person rows): `frontend/src/pages/Assignments/grid/components/ProjectCell.tsx`
  - Deliverables Calendar: `frontend/src/components/deliverables/CalendarGrid.tsx`
  - Dashboard pre‑deliverables: `frontend/src/components/dashboard/UpcomingPreDeliverablesWidget.tsx`
  - Optional later: `frontend/src/components/personal/MyProjectsCard.tsx`, Projects list `ProjectsTable`
- Acceptance criteria:
  - Clicking a project name or pill does not navigate; it opens an anchored popover that displays project details (same content as Projects page panel).
  - Popover supports keyboard (Enter/Space to open, Esc and close button to exit), traps focus within the popover, and is screen‑reader friendly.
  - Edits behave exactly like the Projects page (status, inline fields, assignments, hours) and update React Query caches consistently.
  - Underlying page keyboard shortcuts and grid key handlers do not fire while the popover is focused.
  - Popover auto‑closes on outside click, route changes, and when auth session is lost.
  - Popover repositions on window resize/scroll and flips placement to remain visible.
  - Popover exposes role="dialog" with aria-modal="true" and a meaningful label; restores focus back to the trigger (or a safe fallback) on close.

---

## Phase 1 — Foundation: Context + Popover Shell

Step 1.1 — Add Project Quick View popover context and hook

- Prompt:
  - Create `frontend/src/components/projects/quickview/ProjectQuickViewPopoverProvider.tsx` implementing a React context with state `{ isOpen: boolean; projectId: number | null; anchorRect: DOMRect | null }` and methods `{ open: (id:number, anchorEl?: HTMLElement)=>void; close: ()=>void }`.
  - Export `useProjectQuickViewPopover()` hook that throws if used without provider.
  - Provider renders a positioned popover (portal to `document.body`) anchored to the trigger element (`getBoundingClientRect()`), with optional arrow and shadow, and a content container (wired in Phase 3).
  - Do not fetch data here. Only manage open/close, target project id, and popover positioning.
  - Keep it small, typed, dependency‑free.
  - Define overlay layering constants (e.g., POPOVER_Z=1500, DROPDOWN_Z=2000, TOAST_Z=9999) and apply consistently.
  - Single‑instance behavior: last‑open wins. Calling `open()` should close any existing instance before opening a new one.
  - `open` signature: `open(projectId: number, anchorEl?: HTMLElement, opts?: { placement?: 'bottom-start'|'top-start'|'auto'; source?: 'calendar'|'assignments'|'dashboard'|'projects' })`.
  - Fallback open: when `anchorEl` is omitted, center the popover using the same size rules as the responsive fallback.
  - Tokenize geometry: add `EDGE_MARGIN`, `ARROW_SIZE`, and `VIEWPORT_PADDING` constants reused by the positioning logic.

Step 1.2 — Mount provider at app layout root

- Prompt:
  - Edit `frontend/src/components/layout/Layout.tsx` to wrap the main page content with `ProjectQuickViewPopoverProvider` so all pages can open the popover.
  - Ensure no layout shift and no changes to TopBar/Sidebar behavior.

Step 1.3 — Placeholder for early integration

- Prompt:
  - Inside the provider, render a temporary lightweight body (e.g., “Loading project…”) when `isOpen` is true. This will be replaced in Phase 3.

Step 1.4 — Focus, keyboard isolation, and positioning

- Prompt:
  - In `ProjectQuickViewPopoverProvider`, implement:
    - Focus trap within the popover; store previously focused element on open, restore it on close.
    - A keydown handler registered in capture phase (window.addEventListener with capture=true) that prevents underlying global handlers (grid navigation, layout shortcuts) while focus is inside the popover. Allow Tab/Shift+Tab, Esc to close.
    - Outside click to close (ignore clicks inside the popover). Maintain a set of “owned” portal roots (e.g., dropdowns) and ignore clicks on those while they’re open. Tag owned portals with `data-owner="project-quickview"` for reliable detection.
    - Reposition on window resize/scroll and on nearest scrollable ancestor (detect overflow containers); flip placement when near viewport edges and clamp within viewport using `EDGE_MARGIN`. Throttle reposition using `requestAnimationFrame`.
    - Compute position via a small, unit‑tested utility that returns `{ left, top, placement, arrowOffset }` based on `anchorRect`, viewport, and tokens.
    - Close on route changes (`useLocation()`) and when auth token becomes unavailable.
    - On close, if the original trigger is gone (virtualized/recycled), restore focus to a safe fallback (e.g., the page container) instead of throwing.
    - Layout stability: defer initial paint of the popover content until the first `requestAnimationFrame` positioning completes to avoid visible “jump.”
  - Do not lock the body scroll.
  - Store `anchorRect` on open and prefer using it for positioning rather than live DOM measurement, to be resilient to virtualization.

---

## Phase 2 — Click Wiring at Touchpoints (No Navigation)

Step 2.1 — Calendar: open on pill/group click

- Prompt:
  - Edit `frontend/src/components/deliverables/CalendarGrid.tsx`:
    - For `DeliverablePill` and `PreDeliverableGroupCard`, add `onClick={(e) => pid != null && open(pid, e.currentTarget)}` using `useProjectQuickViewPopover()`.
    - Ensure keyboard activation works: Enter/Space triggers `open(pid, e.currentTarget)` and call `e.preventDefault(); e.stopPropagation();`.
    - Preserve existing hover/dim behavior.
    - Guard against null `pid`.
    - On Enter/Space, prioritize popover open and suppress dimming toggles; allow Escape to clear dim only when the popover is not open.

Step 2.2 — Assignments grid: project summary row opens popover

- Prompt:
  - Edit `frontend/src/pages/Assignments/ProjectAssignmentsGrid.tsx`:
    - Wrap `{p.name}` in a `<button>` styled as a link; on click: `open(p.id!, e.currentTarget)`.
    - Add `e.preventDefault(); e.stopPropagation();` to avoid toggling expand and to anchor.
    - Add keyboard Enter/Space support.

Step 2.3 — Assignments person row: project cell opens popover

- Prompt:
  - Edit `frontend/src/pages/Assignments/grid/components/ProjectCell.tsx`:
    - Render project name as a `<button>` when `projectId` is present; on click: `open(projectId, e.currentTarget)`.
    - Add keyboard Enter/Space support; prevent row selection toggles. Ensure status dropdown interactions remain unchanged. Stop propagation in both click and keydown handlers.

Step 2.4 — Dashboard pre‑deliverables: open from project name

- Prompt:
  - Edit `frontend/src/components/dashboard/UpcomingPreDeliverablesWidget.tsx`:
    - Render `{it.projectName}` as a `<button>` when `it.project` is finite; on click: `open(it.project, e.currentTarget)`.
    - Do not alter completion flows.

Step 2.5 — Optional: Personal My Projects, Projects list table

- Prompt:
  - `frontend/src/components/personal/MyProjectsCard.tsx`, `frontend/src/pages/Projects/list/components/ProjectsTable.tsx`: replace navigation on name with popover open; keep behind a flag if desired.

---

## Phase 3 — Detail Parity via Container Wrapper (Popover Content)

Step 3.1a — Read‑only MVP container

- Prompt:
  - Create `frontend/src/components/projects/quickview/ProjectDetailsContainer.tsx` accepting `projectId: number`, initially read‑only:
    - Use `useProject(projectId)` for core data; show skeleton/error as needed.
    - Lazy load `DeliverablesSection` with existing loader.
    - Size the popover to panel dimensions (width ~1000–1100px; maxHeight ~80vh) and enable internal scrolling.
    - Show a subtle loading shimmer immediately on open, even when data is hot, to improve perceived responsiveness.

Step 3.1b — Add assignments list display

- Prompt:
  - Integrate `usePeople()` + `useProjectAssignments({ projectId, people })` to display assignments (read‑only hours for now).

Step 3.1c — Add status and inline field updates

- Prompt:
  - Wire `useUpdateProjectStatus` and `useInlineProjectUpdate` to enable status changes and inline text/date edits, reusing Projects page cache keys.

Step 3.1d — Add role changes and hours edits

- Prompt:
  - Add role changes using the same callbacks fed to `AssignmentRow`.
  - Add week hours editing using the existing inline edit hooks and `assignmentsApi` helpers.

Step 3.2 — Render `ProjectDetailsPanel` inside the popover

- Prompt:
  - In `ProjectQuickViewPopoverProvider`, when open, render `<ProjectDetailsContainer projectId={projectId} />` into the popover body.
  - Provide an accessible heading/label reflecting `project.name`. Include an explicit “Close” button in the sticky header for discoverability.
  - Keep the header (title + close) sticky within the popover so users retain context while scrolling.

Step 3.3 — Safety switches and deletion constraints

- Prompt:
  - Omit delete from popover initially (avoid destructive actions in an anchored context). Add later only if explicitly desired with a confirmation gate.
  - Ensure `react-query` invalidations mirror Projects page. Explicit keys:
    - `['projects']`
    - `['projects', id]`
    - `PROJECT_FILTER_METADATA_KEY`
  - If a future “delete” action is added, pair it with a short‑lived “Undo” toast when feasible to reduce irrecoverable errors.

Step 3.4 — Dropdown layering inside popover (RoleDropdown)

- Prompt:
  - Ensure `RoleDropdown` renders above the popover:
    - Option A: `zIndex` prop (default high value when in popover) and a class or style (e.g., `z-[2000]`).
    - Option B: `portalRoot` prop to render into a node appended within the popover container.
  - Add a test that the dropdown is visible/clickable in the popover.

---

## Phase 4 — Performance, Caching, Prefetch

Step 4.1 — Lazy loading and suspense boundaries

- Prompt:
  - Fetch only when open; keep Deliverables lazy with existing fallback.

Step 4.2 — Prefetch on hover for snappy open

- Prompt:
  - Where project names are listed, prefetch `['projects', id]` on mouseenter/focus.
  - Throttle/debounce to prevent storms; cancel on quick mouseleave.
  - Prefetch only project detail, not assignments; avoid calendar‑wide prefetching.
  - Consider a very small (100–200ms) prefetch delay to avoid fetching for accidental transient hovers.

Step 4.3 — Cache consistency guarantees

- Prompt:
  - Use the same mutations/hooks as the Projects page for edits so lists and grids update without manual sync.

---

## Phase 5 — Accessibility & UX Polish

Step 5.1 — Keyboard and SR support

- Prompt:
  - Popover container uses `role="dialog"` with `aria-modal="true"` and `aria-labelledby` or `aria-label`; supports Esc to close. Provide an offscreen heading fallback id if a visible header is not present.
  - Triggers (project name wrappers) are keyboard activatable (Enter/Space) and use `<button>` or appropriate roles.
  - On open, set initial focus to the header’s Close button; include a “Skip to content” link inside the popover for keyboard users.
  - Restore focus to the trigger on close; if trigger no longer exists (virtualized), restore to a safe fallback (e.g., page container).
  - Verify underlying keyboard handlers do not fire while popover focused.

Step 5.2 — Visual affordances and sizing

- Prompt:
  - Ensure adequate width/height, an arrow pointing to anchor, and internal scroll without double scrollbars.

Step 5.3 — Responsive fallback (small screens)

- Prompt:
  - When viewport width < 768px, render the popover as a centered panel:
    - maxWidth: 95vw, maxHeight: 90vh, internal scroll; identical keyboard/focus behavior.
    - Maintain anchor context visually with an arrow if space permits; otherwise omit.

---

## Phase 6 — Testing

Step 6.1 — Unit tests: provider and hook

- Prompt:
  - `frontend/src/components/projects/quickview/__tests__/ProjectQuickViewPopoverProvider.test.tsx`:
    - Assert open/close, focus trap, outside‑click close, Esc close, restore focus.

Step 6.2 — Component tests: container wiring

- Prompt:
  - `frontend/src/components/projects/quickview/__tests__/ProjectDetailsContainer.test.tsx`:
    - Mock APIs; assert name, client, description, status badge, and lazy deliverables render.
    - Provide a synthetic `anchorRect` in tests to validate positioning independently of real DOM.

Step 6.3 — Integration tests: touchpoints open popover

- Prompt:
  - Add tests to assert:
    - Calendar pill click opens Quick View (anchored to pill).
    - Project name in Assignments summary row opens Quick View without toggling expand.
    - Dashboard pre‑deliverable project name opens Quick View.

Step 6.4 — Keyboard isolation, layering, and positioning

- Prompt:
  - Assert grid keyboard listeners don’t fire while popover focused.
  - Assert RoleDropdown renders above popover and is operable.
  - Assert popover repositions on resize/scroll and flips placement near viewport edges.
  - Assert outside click ignores clicks on portalized dropdowns owned by the popover (no accidental close while interacting with dropdowns).
  - For virtualized lists, assert opening from a recycled row uses stored anchorRect; if anchor disappears, positioning falls back gracefully and focus restores to a safe fallback on close.
  - Race conditions: test rapid open → close → open sequences to verify single‑instance cleanup and focus restoration.

Step 6.5 — E2E smoke (optional)

- Prompt:
  - Playwright: navigate to Assignments, click a project name; assert popover visible and shows the correct project.

Step 6.6 — Run and stabilize tests

- Prompt:
  - Run `cd frontend && npm test` and fix only issues introduced by this feature.

---

## Phase 7 — Rollout & Docs

Step 7.1 — Feature flag (optional)

- Prompt:
  - Gate opening Quick View behind a flag (e.g., `PROJECT_QUICK_VIEW_POPOVER=true`) for gradual rollout.

Step 7.2 — Minimal docs

- Prompt:
  - Add a short “Project Quick View” section covering where it works, how to open, and parity with the Projects page.

---

## File‑Level Implementation Pointers (for the Agent)

- Popover/context
  - Add: `frontend/src/components/projects/quickview/ProjectQuickViewPopoverProvider.tsx`
  - Add: `frontend/src/components/projects/quickview/ProjectDetailsContainer.tsx`
  - Edit: `frontend/src/components/layout/Layout.tsx` (wrap provider)

- Touchpoints
  - Edit: `frontend/src/components/deliverables/CalendarGrid.tsx`
  - Edit: `frontend/src/pages/Assignments/ProjectAssignmentsGrid.tsx`
  - Edit: `frontend/src/pages/Assignments/grid/components/ProjectCell.tsx`
  - Edit: `frontend/src/components/dashboard/UpcomingPreDeliverablesWidget.tsx`
  - (Optional) Edit: `frontend/src/components/personal/MyProjectsCard.tsx`, `frontend/src/pages/Projects/list/components/ProjectsTable.tsx`

- Reuse, don’t duplicate:
  - `frontend/src/pages/Projects/list/components/ProjectDetailsPanel.tsx`
  - Hooks: `useProject`, `usePeople`, `useProjectAssignments`, `useProjectAvailability`, `useProjectAssignmentAdd`, `useAssignmentInlineEdit`, `useUpdateProjectStatus`, `useInlineProjectUpdate`
  - APIs: `projectsApi`, `assignmentsApi`

- Testing locations
  - `frontend/src/components/projects/quickview/__tests__/...`
  - Co‑located component tests for calendar, assignments grid, dashboard widget

---

## Guardrails and Non‑Goals

- No backend changes; reuse existing endpoints for details, status, assignments, deliverables.
- No duplication of panel logic; the container adapts and feeds `ProjectDetailsPanel`.
- Keep diffs minimal and focused. Do not refactor unrelated code.
- Maintain accessibility and keyboard support across triggers and the popover.
- Avoid new dependencies; use React Query caching and existing UI primitives.
- Quick View closes on route changes, auth loss, and outside click.

---

## Done When

- Clicking a project name/pill opens an anchored, interactive popover (no navigation) with Projects‑page parity.
- Edits within the popover reflect across pages without refresh.
- Tests cover provider behavior and at least one integration per touchpoint.
- No regressions in expand/collapse, hover behavior, or status dropdowns.
