# Settings Experience Overview

The Settings page now uses a split-pane layout:

- **Left navigation** lists all sections that the current user is allowed to access. The list supports search, keyboard navigation, remembers the last selected section in `localStorage`, and deep-links via `?section=<id>`.
- **Right pane** shows the selected section inside a standardized card (`SettingsSectionFrame`). Section headings and descriptions live in component metadata so both the navigation and the content stay in sync.
- The layout is responsive: below `md` breakpoints the navigation stacks above the content.
- The feature can be disabled instantly via the `VITE_SETTINGS_SPLITPANE=false` environment variable, which reverts to the sequential card layout (useful for rollback).
- Legacy anchors such as `/settings#role-management` automatically redirect to the corresponding section in the split-pane by updating the query string.

## Adding a New Section

1. Create a component under `src/pages/Settings/sections/` that renders its content inside `SettingsSectionFrame`.
2. Export the section via `sections/index.tsx` with metadata: `id`, `title`, `requiresAdmin`, optional `featureFlag`, and the component reference.
3. If the section needs shared data (auth, capabilities), use `useSettingsData()`. Otherwise, manage data locally inside the section.
4. Update `docs/settings-sections.md` with new regression scenarios.
5. If the section gates future work (e.g., Integrations), add an entry with `featureFlag` so the nav slot exists but stays hidden until the capability flag is true.

## Regression Checklist

See `docs/settings-sections.md` for the authoritative list. At a minimum:

- Verify deep linking (`?section=...` and legacy `#` anchors).
- Confirm search/filter, keyboard navigation, and persistence of the selected section.
- Ensure the split-pane flag works (toggle in `.env` and reload).
- Run `npm run test:run -- RoleManagementSection` and `npm run build` after changes.

