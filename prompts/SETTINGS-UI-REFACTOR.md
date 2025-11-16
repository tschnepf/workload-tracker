# Settings Page Refactor — Split Pane Navigation Plan

This precursor plan modernizes the Settings experience so later features (like the Integrations Hub) have an ergonomic foundation. Execute these steps before touching the Integrations prompts.

## Goals

- Replace the single long scroll of cards with a split-pane layout: navigation rail on the left, content panel on the right.
- Keep all existing Settings sections (roles, backups, calendar feeds, utilization, etc.) functional, but decouple them into modules so they can be lazy-loaded or extended.
- Ensure the navigation can gate sections by capability (e.g., admin-only, feature flags) and is ready to host an “Integrations” entry once that feature flag is enabled.
- Maintain accessibility (keyboard focus, ARIA roles) and responsive behavior down to tablet widths.

## Phase 1 — Inventory & Module Extraction

Prompt: “Audit `frontend/src/pages/Settings/Settings.tsx` and list every logical section (Role Management, Utilization Scheme, Department Project Roles, Backups, Restore, Calendar Feeds, etc.) **and** the shared state/side effects they rely on (roles list, modals, audit logs, people options, toasts). Document this inventory in `docs/settings-sections.md` with details: component file, admin requirements, feature flag dependencies, approximate render cost, required data sources, and modal ownership.”

Prompt: “Search docs/README/onboarding materials for references to Settings anchors (e.g., `#role-management`). Capture these URLs in the same inventory doc so we know which references must be updated or redirected once the split-pane ships.”

Prompt: “Define a `SettingsDataContext` (or equivalent React Query hooks) that encapsulates shared fetches/mutations (e.g., roles list, auth users, people options). Sections should consume context or their own hooks so they can be mounted independently without orphaning modals or reimplementing fetch logic.”

Prompt: “Extract each section into its own component under `frontend/src/pages/Settings/sections/`. Components must accept minimal props (e.g., context handles, callbacks) and export metadata (`id`, `title`, `requiresAdmin`, `featureFlag`, `icon`, `estimate`) consumed by the navigation. Write unit tests for any section that currently lacks coverage, including the modal flows (RoleForm/RoleDeleteConfirm) after relocation.”

Prompt: “Capture regression scenarios for every existing workflow (role CRUD, user creation/linking, backup upload/download, restore, audit refresh, calendar feed generation, utilization editing). Store this list alongside the inventory so QA/automation has a definitive checklist post-refactor.”

## Phase 2 — Navigation Layout & Routing

Prompt: “Build a reusable `SettingsSplitPane` component that renders:
1. A vertical nav list (left rail) showing section titles (and optional icons/badges).
2. A content surface on the right that displays the selected section component.
3. Keyboard support (Up/Down to move, Enter/Space to activate) and aria roles (`role='tablist'`/`role='tab'` or `nav`+`aria-controls`).”

Prompt: “Add optional search/filter above the nav list so admins can quickly find sections. Persist the last-selected section in `localStorage` (per user) and support deep linking via `?section=<id>` query param. Provide backward-compatible redirects for existing anchor links (e.g., `#role-management`) so old documentation/bookmarks still land on the correct section.”

Prompt: “Integrate the split-pane into `Settings.tsx`: keep the global `Sidebar` + content shell intact, render the new nav/content pane within the main area, and ensure non-admin users only see the sections they’re allowed to view (hide nav entries and block direct URL access).”

Prompt: “Establish a shared `SettingsSectionFrame` component (title, description, standardized loading/error/empty states) so each section has consistent visuals and toasts. Adopt it while migrating the first few modules.”

Prompt: “Introduce a temporary feature flag (e.g., `VITE_SETTINGS_SPLITPANE`) so the new layout can be toggled during rollout/rollback. Document how to disable it quickly if regressions are discovered.”

## Phase 3 — Capability & Flag Wiring

Prompt: “Update `useCapabilities` consumers to provide capability metadata to the Settings page. Each section should receive only the bits it needs (e.g., `projectRolesByDepartment`, upcoming `integrations.enabled`) to decide whether to show/show disabled state.”

Prompt: “Add a placeholder navigation item for Integrations (hidden until `caps.integrations?.enabled` is true). This ensures the layout change doesn’t require another wholesale refactor when the Integrations Hub ships.”

## Phase 4 — UX Polish & Testing

Prompt: “Add responsive behavior: on small screens collapse the nav into a dropdown or slide-out menu while keeping content scrollable. Ensure focus management works when the layout changes.”

Prompt: “Create Cypress/Vitest UI tests that:
- Render the split-pane and verify navigation swaps content without remounting unrelated sections (lazy-load sections like Backups/Restore to avoid unnecessary API calls).
- Confirm admin vs non-admin views.
- Validate deep linking (`?section=backups`) and persistence of last selection.
- Verify anchor redirects (old `#role-management` URLs → new query param) still reach the right section.”

Prompt: “Run accessibility audits (screen reader navigation, ARIA validation, focus trapping in modals) to ensure the new nav and section modules remain usable with assistive tech. Fix any violations surfaced by tools like axe or Lighthouse.”

Prompt: “Update documentation (`README.md` or `docs/settings-overview.md`) with screenshots/gifs showing the new workflow and instructions for adding future sections.”

Prompt: “Review analytics/telemetry hooks (if any) that record Settings interactions, updating event names/element IDs to match the new split-pane navigation. Coordinate with whoever owns product metrics.”

Prompt: “If copy/translation management is in scope, submit the new navigation labels and descriptions to the localization pipeline so the Settings nav remains fully translated.”

Prompt: “Add a regression test suite (manual checklist or automated) covering the workflows captured in Phase 1. Ensure these tests run after enabling the split-pane flag and again after the flag is removed.”

## Success Criteria

- Settings page renders via split-pane layout with keyboard-friendly navigation.
- All legacy sections still function, but are self-contained modules.
- Feature/capability flags hide sections reliably.
- Tests cover navigation behavior, section gating, and responsive interactions.
