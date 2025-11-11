# Project Quick View Popover — Assignments First (Phased Plan)

This plan builds a reusable, accessible Project "Quick View" popover and integrates it only on the Assignments page initially (clicking a project name opens the popover). The popover is architected for reuse across pages without duplication. The plan emphasizes lean programming: single source of truth, minimal glue, strong typing, incremental changes, and careful frontend/backend coordination. Shortcuts or band-aids are not acceptable.

---

## Phase 0 — Scope, Reuse Strategy, Acceptance

Step 0.1 — Define scope and reuse approach

- Prompt:
  - Create a reusable Project Quick View popover that portals to `document.body` and is openable from any page via a small API: `open(projectId, anchorEl?, opts?)`.
  - For this iteration, only wire it to the Assignments page project name click. Do not add triggers elsewhere.
  - Create a canonical Project Details content component used by the popover. In a future follow-up, refactor the Projects page to use the same content so changes reflect everywhere.

Step 0.2 — Acceptance criteria

- Prompt:
  - Clicking a project name in Assignments opens an anchored popover near the clicked name (no navigation, no row-expand toggle).
  - Popover shows a header (name, client, status with edit) and a Deliverables section (lazy-loaded). Edits update caches consistently.
  - Keyboard: Enter/Space activates triggers; Esc and Close button dismiss; focus is trapped in the popover; focus is restored to the trigger on close.
  - Underlying grid key handlers and global shortcuts do not fire while the popover is focused.
  - Popover repositions on scroll/resize and stays in viewport; on small screens it centers as a panel.
  - Outside click closes the popover but does not close when interacting with owned portalized dropdowns within the popover.

---

## Phase 1 — Foundation: Provider, Hook, Portal

Step 1.1 — Add Quick View popover provider + hook

- Prompt:
  - Add `frontend/src/components/projects/quickview/ProjectQuickViewPopoverProvider.tsx` implementing a React context with state:
    - `{ isOpen: boolean; projectId: number | null; anchorRect: DOMRect | null; opts?: { placement?: 'bottom-start'|'top-start'|'auto'; source?: string } }`
    - methods: `{ open(id: number, anchorEl?: HTMLElement, opts?: any): void; close(): void }`.
  - Render nothing when closed. When open, portal a positioned popover container using a stable portal root: if `#project-quickview-root` is not present under `document.body`, create and append it once; render into that node with `position: fixed`.
  - Geometry tokens: `EDGE_MARGIN=8`, `ARROW_SIZE=8`, `VIEWPORT_PADDING=8`.
  - Z-index tokens: `POPOVER_Z=1200`, `DROPDOWN_Z=1300`, `TOAST_Z=9999`. Apply to container and expose via CSS variables if helpful.
  - Do not apply CSS transform or filter on the popover container (avoid creating new stacking contexts). Use `position: fixed; z-index: var(--popover-z, 1200)`.
  - Single-instance behavior: last-open wins. `open()` should close any existing instance before opening a new one.
  - Keep the provider small, typed, dependency-free. No data fetching here.

Step 1.2 — Focus trap, keyboard isolation, outside click

- Prompt:
  - In the provider, implement:
    - Focus management: store `document.activeElement` on open; trap Tab/Shift+Tab within the popover; restore focus to the original trigger on close (fallback to a page container if trigger is gone).
    - Capture-phase keydown listener active while the popover is open. If focus is inside the popover, `preventDefault` + `stopPropagation` for all keys except Tab/Shift+Tab and Esc; handle Esc to close. If the active element is inside an owned portal, do not close on Esc (let the dropdown/menu consume it). This blocks Assignments grid numeric-edit hotkeys and Layout shortcuts while focused in the popover.
    - Outside click to close: use a capture-phase `mousedown` listener; ignore clicks inside the popover. Maintain a set/registry of "owned" portal roots and ignore clicks within elements tagged `data-owner="project-quickview"`.
    - Reposition on window resize/scroll and nearest scrollable ancestor changes (listen to `scroll` with capture=true). Flip placement near edges and clamp within viewport paddings.
    - Attach all listeners only when open; remove them on close and on unmount (StrictMode-safe, idempotent cleanup).

Step 1.3 — Mount provider (global, inert when closed)

- Prompt:
  - Edit `frontend/src/components/layout/Layout.tsx` to mount `ProjectQuickViewPopoverProvider` at the app root (wrap `MainWithDensity` so it overlays content). Ensure it renders null when closed and attaches event listeners only while open.
  - Do not change any layout behavior. Verify the popover sits above `GlobalNavPending` (950) and TopBar (30).

Step 1.4 — No flag gating

- Prompt:
  - Do not gate the provider or triggers behind a feature flag. Mount the provider globally and implement the Assignments trigger directly. Keep the provider inert when closed (renders null, no listeners).

Step 1.5 — Public API surface and shared types

- Prompt:
  - Add `frontend/src/components/projects/quickview/types.ts` defining `OpenOpts` and context state interfaces to avoid circular deps and `any` types.
  - Add `frontend/src/components/projects/quickview/index.ts` that exports `ProjectQuickViewPopoverProvider`, `useProjectQuickViewPopover`, and a typed `open(id: number, anchorEl?: HTMLElement, opts?: OpenOpts)`.

Step 1.6 — Repositioning performance

- Prompt:
  - Throttle reposition using `requestAnimationFrame` (coalesce multiple scroll/resize events into one measurement per frame).
  - Expose `reposition()` inside the provider and call it when popover content size changes (e.g., after project detail loads, deliverables load, or dropdown open/close) to keep the arrow and placement aligned.

---

## Phase 2 — Canonical Project Details Content

Step 2.1 — Add Project Details container (single source of truth)

- Prompt:
  - Add `frontend/src/components/projects/quickview/ProjectDetailsContainer.tsx` that accepts `projectId: number` and renders canonical details UI for the popover and future page reuse.
  - Responsibilities:
    - Fetch project detail via `useProject(projectId)` immediately so ETag is cached for subsequent edits.
    - Render a header with name, client, editable status using existing `StatusBadge` + `StatusDropdown` (standardize on this dropdown to reduce drift) and reuse `useUpdateProject`/`useProjectStatus` for edits.
    - Render `DeliverablesSection` lazily with `variant="embedded"`; on deliverable changes, invalidate `PROJECT_FILTER_METADATA_KEY` and reflect updated state.
    - On content load/resolution (project detail, deliverables), call `reposition()` from the provider to re-align the popover.
    - Provide robust states: header and deliverables skeletons while loading; an inline error view with Retry and a “View full project” link to `/projects?projectId={id}` if fetch fails.
    - Keep the container small; do not duplicate Projects page orchestration. Use the same query keys: `['projects']`, `['projects', projectId]`, `PROJECT_FILTER_METADATA_KEY`.

Step 2.2 — Add Project Details core/presentational component

- Prompt:
  - Add `frontend/src/components/projects/quickview/ProjectDetailsCore.tsx` as a presentational component (no data fetching). Props are plain data and small callbacks.
  - Layout:
    - Sticky header inside popover: title (client + name) and a Close button (the provider passes `onClose`).
    - Status editor area aligned to the right using existing `StatusBadge`/dropdown.
    - Deliverables block below, using lazy `DeliverablesSection` (embedded variant).
    - Add a subtle sticky-header shadow once content scrolls.
    - Opening transition: 120–160ms scale/opacity animation on content only; respect `prefers-reduced-motion: reduce` and disable animations when set.
    - Labeling: ensure a stable header id and apply `role="dialog" aria-modal="true" aria-labelledby={headerId}` on the container.

Step 2.3 — Owned portal integration for dropdowns

- Prompt:
  - Ensure dropdowns/menus inside the popover (e.g., status dropdown, future role dropdowns) either:
    - Set `data-owner="project-quickview"` on their portal roots, or
    - Accept an optional `portalRoot?: HTMLElement` prop to render into a node appended to the popover container, or
    - Use a provider API to `registerOwnedPortal(el: HTMLElement)` and `unregisterOwnedPortal(el)`.
  - Apply this for any dropdown used in the container to avoid accidental outside-click close.

---

## Phase 3 — Wire to Assignments Page (single touchpoint)

Step 3.1 — Add open trigger on project name (summary row)

- Prompt:
  - Edit `frontend/src/pages/Assignments/ProjectAssignmentsGrid.tsx`:
    - In the summary row section labeled "Project name (no chevron) with status aligned to right" (around the existing title `title={p.name}`), render the project name as a `<button type="button" className="truncate text-left">` with:
      - `onClick={(e) => { e.stopPropagation(); open(p.id!, e.currentTarget as HTMLElement); }}`
      - `onKeyDown={(e) => { if (e.key==='Enter' || e.key===' ') { e.preventDefault(); e.stopPropagation(); open(p.id!, e.currentTarget as HTMLElement); } }}`
      - `tabIndex={0}` and `role="button"`
      - Visual affordance: add `cursor-pointer` and `hover:underline` to signal interactivity; keep layout width constraints intact.
    - Ensure row expand does not toggle; call `stopPropagation()` on click and key handlers.
    - Guard: if `p.id` is null/undefined, do not render the trigger.

Step 3.2 — Prefetch on hover/focus

- Prompt:
  - Where project names are rendered, prefetch `['projects', p.id]` on `mouseenter`/`focus` via React Query (`ensureQueryData` or `prefetchQuery`).
  - Debounce 150ms to avoid transient hovers; since prefetches are not cancellable, only start after the delay if the pointer remains on the trigger.

---

## Phase 4 — Accessibility, Positioning, Responsive

Step 4.1 — Keyboard and screen reader support

- Prompt:
  - Popover container uses `role="dialog"` with `aria-modal="true"` and `aria-labelledby` or `aria-label`.
  - On open, set initial focus to the header Close button; include a "Skip to content" link inside the popover.
  - Restore focus to the original trigger on close. If the trigger is gone (virtualized), restore to a safe fallback (e.g., main content container).
  - Build a focus loop: compute focusable elements at open time and wrap focus on Tab/Shift+Tab between first and last elements.

Step 4.2 — Positioning and viewport safety

- Prompt:
  - Compute position from `anchorRect` with fallback to centered panel when `anchorEl` is omitted or disappears.
  - Flip placement near viewport edges and clamp within `VIEWPORT_PADDING`.
  - On viewport width < 768px: render as a centered panel (`maxWidth: 95vw; maxHeight: 90vh; overflow: auto`), identical keyboard/focus behavior. In panel mode, lock background scroll (`document.body.style.overflow = 'hidden'` on open) and restore on close.

---

## Phase 5 — Caching, Edits, Consistency

Step 5.1 — Data and ETag

- Prompt:
  - Ensure `useProject(projectId)` runs immediately on open so ETag is cached before any edits. Use `useUpdateProject` for status edits; it already invalidates `['projects']`, `['projects', id]`, and `PROJECT_FILTER_METADATA_KEY` on settle.

Step 5.2 — Deliverables edits parity

- Prompt:
  - Use `DeliverablesSection` as-is (embedded variant). Ensure its invalidations (`PROJECT_FILTER_METADATA_KEY`) and toast/refresh behaviors work without modification. Avoid duplication of deliverables logic in the popover.

---

## Phase 6 — Testing (AI-Agent runnable)

Step 6.1 — Unit tests: provider and hook

- Prompt:
  - Add `frontend/src/components/projects/quickview/__tests__/ProjectQuickViewPopoverProvider.test.tsx`:
    - Assert open/close updates state and renders portal.
    - Assert focus trap, Esc close, outside-click close.
    - Assert outside-click ignores elements with `data-owner="project-quickview"`.
    - Assert route change (mock `useLocation`) and auth loss close the popover.
    - Assert Assignments grid numeric-edit hotkeys do not fire while popover is focused (simulate keypress).
    - Assert popover remains above `GlobalNavPending` overlay when nav is pending (layering test).
    - Assert Esc while a dropdown inside the popover is focused does not close the popover (owned-portal precedence).

Step 6.2 — Component tests: details container

- Prompt:
  - Add `frontend/src/components/projects/quickview/__tests__/ProjectDetailsContainer.test.tsx`:
    - Mock `useProject` data; assert name/client/status render; mock status edit updates via `useUpdateProject`.
    - Lazy deliverables render with embedded variant; simulate an update and assert invalidation.
    - Assert header and deliverables skeletons appear while loading; assert error view shows Retry + “View full project” link on failure.

Step 6.3 — Integration tests: Assignments trigger

- Prompt:
  - Add `frontend/src/components/projects/quickview/__tests__/AssignmentsOpenQuickView.integration.test.tsx`:
    - Render a minimal Assignments summary row with a project entry.
    - Click project name; assert popover visible and shows the correct project.
    - Assert row expand does not toggle on click (stopPropagation works).
    - With popover focused, press a numeric key and assert Assignments editing does not start.

---

## Phase 7 — Future Adoption (not in this iteration)

Step 7.1 — Docs

- Prompt:
  - Keep the provider mounted globally but implement triggers only on Assignments for now.
  - Add a brief "Project Quick View" section to `README.md` covering usage and the open API for future reuse.
  - Document how to tag owned portals (`data-owner="project-quickview"`) and when to call `registerOwnedPortal()`.

Step 7.2 — Future reuse

- Prompt:
  - Plan follow-ups to add triggers on Calendar pills, Dashboard pre-deliverables, and Projects list, using the same `open()` API.
  - Create a separate plan to refactor the Projects page detail panel to use `ProjectDetailsContainer/Core` to truly unify content across the app.

---

## Phase 8 — Lean Guardrails and Non-Goals

Step 8.1 — Lean programming guardrails

- Prompt:
  - Do not duplicate Projects page logic; reuse hooks/mutations and `DeliverablesSection`.
  - Keep provider dumb: no data fetching, no business logic.
  - Strong typing on context and container props; avoid `any`.
  - Idempotent listener attach/detach; avoid StrictMode ghost listeners.
  - Do not apply transforms/filters on the popover container; avoid unintended stacking contexts.

Step 8.2 — Non-goals for this iteration

- Prompt:
  - Do not add delete project inside popover.
  - Do not implement triggers outside Assignments.
  - Do not change Projects page panel; refactor will be handled in a separate plan.

---

## File Inventory (to be created/edited)

- New: `frontend/src/components/projects/quickview/ProjectQuickViewPopoverProvider.tsx`
- New: `frontend/src/components/projects/quickview/types.ts`
- New: `frontend/src/components/projects/quickview/index.ts`
- New: `frontend/src/components/projects/quickview/ProjectDetailsContainer.tsx`
- New: `frontend/src/components/projects/quickview/ProjectDetailsCore.tsx`
- Edit: `frontend/src/components/layout/Layout.tsx` (mount provider)
- Edit: `frontend/src/pages/Assignments/ProjectAssignmentsGrid.tsx` (trigger on project name + prefetch)
- Tests: `frontend/src/components/projects/quickview/__tests__/*.test.tsx`

---

## Success Criteria

- Assignments page: clicking a project name opens a reusable popover with project header and deliverables; keyboard and mouse work; grid shortcuts are isolated while open.
- Edits in the popover reflect in React Query caches and on other pages without manual sync.
- The popover component and canonical details container are ready to be used from other pages with no architectural changes.
