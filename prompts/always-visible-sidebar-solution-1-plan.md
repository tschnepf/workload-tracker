# Always-Visible Sidebar — Solution 1 (App-Level Scroll Isolation) Implementation Plan

Goal: Keep the sidebar always visible on desktop by isolating vertical scroll inside the app shell (main) or page-level panels, not the document body. Maintain clean, consistent, best-practice layout across all pages. Preserve the existing mobile off‑canvas sidebar.

Guiding principles
- Single source of truth for the shell (`Layout` + `Sidebar`); remove page-level sidebar wrappers.
- Full-height app (`h-screen`) with scroll confined to `<main>` or explicit panels (`overflow-y-auto`).
- Use minimal, focused changes consistent with Tailwind conventions; no hacks, no band-aids.
- Avoid `position: fixed`/`sticky` for the sidebar; prevent z-index/overlay complexity.

Each step below is a ready-to-run prompt for the AI agent. Execute them one at a time.

---

Step 0 — Audit layout usage across pages

Prompt:
"""
Scan `frontend/src/pages/**` to inventory layout usage patterns:

- List pages that import/use `@/components/layout/Layout`.
- List pages that import/use `@/components/layout/Sidebar` directly.
- List pages that use neither (e.g., public routes like `Auth/Login`).

Propose the action for each group:
- Keep as-is (already under `Layout`).
- Refactor to use `Layout` and remove direct `Sidebar` usage (targets in later steps).
- Confirm standalone (no sidebar on purpose, e.g., login).

Deliverables:
- A short list of pages in each category and the chosen action per page. No code changes yet.
"""

---

Step 1 — Update Layout wrapper to full-height, scroll-isolated app

Prompt:
"""
Open `frontend/src/components/layout/Layout.tsx` and refactor the outer container for full-height scroll isolation:

- Change the top-level wrapper from `min-h-screen` to `h-screen overflow-hidden flex` so the body does not scroll.
- Ensure the right column wrapper uses `flex flex-col min-w-0 min-h-0`.
- Ensure the header bar is non-growing (`flex-shrink-0`).
- Update `<main>` to `flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 lg:px-8 py-8` so scrolling is confined to the content area.
- Mobile drawer a11y: when the drawer opens, trap focus inside it and restore focus to the hamburger on close. Keep Escape-to-close.

Do not introduce any fixed or sticky positioning for the sidebar. Maintain current theme tokens and class names. Keep diffs small and readable.

Acceptance criteria:
- Scroll is confined to the app shell (main) or page-level panels; the body never scrolls.
- For split-pane pages, main stays height-bounded and panels scroll independently.
- Sticky elements (e.g., table headers) remain sticky within their scroll container.
- Sidebar remains visible on desktop; no double scrollbars in common views (Dashboard, Assignments, Projects).
"""

---

Step 2 — Sidebar: full height, pinned bottom, scrollable middle, accessible nav

Prompt:
"""
Open `frontend/src/components/layout/Sidebar.tsx` and ensure correct sizing, structure, and semantics:

- Apply `h-screen flex flex-col` to the top-level sidebar container.
- Keep the header at the top as a non-growing element.
- Restructure into three vertical sections: header (top), a scrollable middle wrapper for the menu groups, and a pinned bottom section (profile/help).
  - Wrap the menu groups (main menu, department items, system items) in a middle container with `flex-1 min-h-0 overflow-y-auto` so only this area scrolls when content exceeds viewport height.
  - Move the existing bottom section outside the scrollable middle so it remains pinned at the bottom.
  - If `<nav>` currently wraps both the menu groups and the bottom section, split so `<nav>` contains only the menu groups within the scrollable middle; keep semantics intact.
- Accessibility & semantics:
  - Add `role="navigation"` and `aria-label="Primary"` to the nav container.
  - For icon-only links, add `aria-label` with the menu item name. Ensure tooltips also appear on keyboard focus (use `group-focus-within:` or equivalent).
  - Consider using `NavLink` (from react-router) for built‑in `aria-current="page"` and active states.
- Do not use `position: sticky` or `position: fixed`. Avoid global overflow rules that could clip tooltips.
- Tooltip layering: keep horizontal overflow un-clipped (avoid `overflow-x-hidden` on container). If overlap issues arise, add a modest `z-10` to the sidebar container.

Acceptance criteria:
- Sidebar occupies the full viewport height on desktop.
- If the menu is long, only the middle area scrolls; the header and bottom section remain visible.
- Nav landmarks and link labels are accessible; tooltips are visible on hover and keyboard focus.
"""

---

Step 3 — Audit global window/body scroll and sticky scope

Prompt:
"""
Search the codebase for body/window scroll assumptions and sticky elements:

- Find any `window.addEventListener('scroll', …)` or logic that relies on body scroll. If found, migrate to listen on the appropriate scrollable container within the page or `<main>`.
- Verify elements using `position: sticky` (e.g., headers in tables) are inside the same element that scrolls (either `<main>` or a panel) so they remain sticky after isolation.

Deliverables:
- A short note of any findings and proposed minimal fixes. Apply only targeted refactors; avoid global hacks.
"""

---

Step 4 — Refactor PeopleList to use shared Layout (remove local Sidebar)

Prompt:
"""
Open `frontend/src/pages/People/PeopleList.tsx` and refactor to use the shared `Layout`:

- Import `Layout` from `@/components/layout/Layout` and wrap the page content with `<Layout>…</Layout>`.
- Remove direct imports/usages of `Sidebar` from this page.
- Remove any page-level `min-h-screen`/`h-screen` wrappers.
- At the page root (inside `<Layout>`), use `h-full min-h-0 flex` for split panes.
- Panels: apply `min-h-0 overflow-y-auto` where panels contain long lists/tables. Optionally add `overscroll-contain` to prevent scroll chaining.
- Preserve existing functionality, styling, and semantics. Keep code lean; no band-aids.

Acceptance criteria:
- Renders within the shared shell; sidebar is always visible on desktop.
- Left/right panels scroll independently without introducing a second page scrollbar.
"""

---

Step 5 — Refactor DepartmentsList to use shared Layout (remove local Sidebar)

Prompt:
"""
Open `frontend/src/pages/Departments/DepartmentsList.tsx` and refactor to use the shared `Layout`:

- Import and wrap content with `<Layout>`; remove direct `Sidebar` imports/usages.
- Remove any page-level `min-h-screen`/`h-screen` wrappers that compete with the shared shell.
- At the page root (inside `<Layout>`), use `h-full min-h-0 flex` for the internal split layout.
- Panels: apply `min-h-0 overflow-y-auto` only to scrollable panels; optionally add `overscroll-contain`.
- Maintain existing dark theme styles and interactions.

Acceptance criteria:
- Uses the shared shell; sidebar remains visible.
- No double scrollbars; only panels with long content scroll.
"""

---

Step 6 — Refactor ProjectsList to use shared Layout (remove local Sidebar)

Prompt:
"""
Open `frontend/src/pages/Projects/ProjectsList.tsx` and migrate it to the shared `Layout`:

- Wrap with `<Layout>`; remove direct `Sidebar` usage.
- Remove any page-level `min-h-screen`/`h-screen` wrappers.
- At the page root (inside `<Layout>`), use `h-full min-h-0 flex`.
- Panels: apply `min-h-0 overflow-y-auto` to long panels; optionally add `overscroll-contain`.
- Keep all existing behavior and styling. Avoid quick fixes.

Acceptance criteria:
- Renders under the shared shell with an always-visible sidebar on desktop.
- Only content areas scroll; layout shell remains stable.
"""

---

Step 7 — Refactor Settings page to use shared Layout (remove local Sidebar)

Prompt:
"""
Open `frontend/src/pages/Settings/Settings.tsx` and refactor to use `Layout`:

- Wrap the page in `<Layout>` and remove direct `Sidebar` usage.
- Remove any page-level `min-h-screen`/`h-screen` wrappers that conflict with the shared shell.
- At the page root (inside `<Layout>`), use `h-full min-h-0 flex` for internal sections.
- Ensure scroll is confined to the page content with `overflow-y-auto` on the specific panels that need it; optionally add `overscroll-contain`.
- Preserve error/loading states within the content area; do not add wrappers that conflict with the shared layout.

Acceptance criteria:
- Settings renders within the unified shell; sidebar is always visible on desktop.
- Loading and error states no longer create a second page-level scrollbar.
"""

---

Step 8 — Sanity-check other pages for shell consistency

Prompt:
"""
Scan the remaining pages under `frontend/src/pages` and verify they either:

1) Already render inside `<Layout>`, or
2) Are intentionally standalone (e.g., `Auth/Login`) where the sidebar should not appear.

Then, explicitly check for the following and resolve them:
- Any remaining direct imports/usages of `@/components/layout/Sidebar` in protected app pages — replace with `<Layout>` and remove the direct sidebar usage.
- Any nested shells — pages should not render `<Sidebar />` themselves once wrapped by `<Layout>`.
- Any page-level `min-h-screen`/`h-screen` wrappers that compete with the shared shell — remove or neutralize and use `min-h-0`/`overflow-y-auto` in the appropriate inner panels.

Acceptance criteria:
- All protected app pages render under the shared `Layout` with no direct `Sidebar` imports/usages.
- No nested shells are present (only `Layout` renders the sidebar).
- Public pages like `Login` remain sidebar-free as designed.
"""

---

Step 9 — Add an end-to-end test for sidebar visibility and scroll behavior

Prompt:
"""
Create a new Playwright spec `frontend/tests/e2e/sidebar-visibility.spec.ts` that:

- Logs in and navigates to several pages (Dashboard, Assignments, Projects, People).
- Asserts that the sidebar element is visible in the viewport and remains visible after scrolling the content.
- Verifies only one vertical scrollbar is present (or, equivalently, that `document.scrollingElement` does not scroll while the content container does).
- On mobile viewport, verifies the hamburger is visible, the sidebar is hidden by default, and opens as an off-canvas panel when toggled.
- Also verify: keyboard navigation exposes labels for icon-only links (aria-label or tooltip on focus); sticky headers remain sticky within their scroll region; background content does not scroll when the mobile drawer is open.

Keep the test concise, robust, and aligned with existing conventions.
"""

---

Step 10 — Manual QA checklist and polish

Prompt:
"""
Perform a quick manual QA pass (no code changes unless a defect is found):

- Desktop: Navigate across pages; verify the sidebar never scrolls off-screen. Scroll long pages; confirm only the content area or intended panels scroll.
- Desktop: Open sidebar tooltips and confirm they are not clipped; adjust minimal z-index on the sidebar container only if needed.
- Mobile: Verify header actions and hamburger; the off-canvas sidebar behaves as before; background content does not scroll while open.
- Check for removal of double scrollbars and absence of layout shifts.

If issues are found, fix them at the root cause with minimal, clean adjustments.
"""

---

Step 11 (Optional) — Router-level consolidation for long-term consistency

Prompt:
"""
Optional improvement for maintainability (do not implement if out of scope):

- In `frontend/src/main.tsx`, introduce a protected shell route that renders `<Layout><Outlet/></Layout>` for all authenticated pages, eliminating the need for per-page `<Layout>` wrappers.
- Migrate pages to be pure content components (no direct layout/shell code), removing any remaining layout duplication.

Keep diffs minimal and reviewable; preserve current route behavior and lazy loading.
"""

---

Step 12 (Optional) — Mobile viewport unit refinement (iOS SVH/DVH)

Prompt:
"""
Evaluate mobile behavior after scroll isolation:

- If `h-screen` (100vh) causes viewport height issues on iOS Safari (e.g., jumpy address bar, content cutoff), consider switching the top-level container to `h-[100svh]` or `h-[100dvh]` if supported by your Tailwind version.
- Confirm Tailwind support for SVH/DVH units in `tailwind.config.js`; if unsupported, treat this as a future improvement.
- Keep changes minimal and scoped to the top-level container; do not introduce fixed positioning or global overflow hacks.

Acceptance criteria:
- Mobile (iOS Safari) scroll feels natural without content cutoff or layout jumps.
"""

