# Theme Switcher Implementation Plan (Backend + Frontend)

This plan introduces switchable color schemes using CSS variables, a small theme manager, and a Settings control persisted per‑user via the existing accounts settings APIs. The work is phased to minimize risk, keep changes lean, and avoid UI/behavior regressions.

Principles
- Lean programming best practices only — no shortcuts, quick fixes, or band‑aids.
- Preserve current behavior; do not change layouts or logic while refactoring visuals.
- Coordinate backend and frontend changes carefully to avoid contract mismatches.
- Keep changes small, testable, and reversible. Land phases independently.

---

## Phase 0 — Prep & Discovery (no code changes)

1) Audit colors and shared components
- Prompt:
  > Scan the codebase for hard‑coded color classes (bg-[#...], text-[#...], border-[#...]) used in shared components (Card, Sidebar, Buttons, inputs, tables, CalendarGrid). List files and occurrences. Propose a minimal token set (CSS variables) that covers these colors without uncontrolled expansion. Do not modify code yet.

2) Define minimal token set
- Prompt:
  > Propose a minimal set of CSS variables for the UI primitives. Include base and hover/alpha-friendly tokens to avoid Tailwind opacity suffixes with CSS variables:
  >
  > - Core: --bg, --surface, --card, --border, --borderSubtle, --text, --muted
  > - Brand: --primary, --primaryHover, --accent, --focus
  > - Hover/overlays: --surfaceHover, --cardHover, --surfaceOverlay (pre-baked alpha), --borderOverlay
  > - Calendar: --shade0, --shade1, --shade2, --shade3, --shade4
  >
  > Map current default theme values to these variables in a table. Do not change any component yet.

---

## Phase 1 — Theme Tokens + Theme Manager (scaffold only)

3) Add theme CSS classes and tokens
- Prompt:
  > Create `src/styles/themes.css` (or extend `src/index.css`) with theme classes `.theme-default`, `.theme-smc-navy`, `.theme-steel-cyan`, `.theme-triad`, `.theme-midnight`, `.theme-sky`, `.theme-topbar`. Each class must define the CSS variables from Phase 0 Step 2. Import this stylesheet once in the frontend entry. No component refactors yet.
  >
  > Align base HTML/CSS with variables and remove hardcoded dark defaults that would override schemes:
  > - In `frontend/index.html`, do not force a dark background via fixed colors; in the critical inline CSS, use variable-driven values with safe fallbacks (e.g., `background: var(--bg, #1e1e1e); color: var(--text, #cccccc);`).
  > - In `frontend/src/index.css`, replace global dark `body` styles with `background-color: var(--bg); color: var(--text);`.
  > - Choose a single root (`document.documentElement`) for applying both the `dark` class and `.theme-*` class.

4) Add a small ThemeManager
- Prompt:
  > Implement a lean ThemeManager that becomes the single source of truth for both display mode and color scheme:
  > - Mode (light/dark/system) continues to use the `dark` class per Tailwind’s `darkMode: 'class'` setting.
  > - Color scheme applies a `.theme-<name>` class (e.g., `.theme-default`, `.theme-sky`).
  > - Apply both classes to `document.documentElement` as early as possible (before hydration) to prevent FOUC.
  > - Provide `getMode()/setMode()` and `getColorScheme()/setColorScheme()` APIs and persist both to localStorage.
  > - Update the existing `useThemeFromSettings` hook to delegate to ThemeManager (do not directly toggle classes in the hook).
  > - Add unit tests for set/get behavior and unknown-value fallback to `'system'`/`'default'`.

5) Dev toggle (temporary)
- Prompt:
  > Add a dev‑only query override `?colorScheme=sky` (or any known scheme). If present, apply immediately and persist via ThemeManager. This is for developer preview only and should be clearly documented. Do not ship prominent UI based on this.

---

## Phase 2 — Tokenize Shared Components (surgical refactor)

6) Card component
- Prompt:
  > Refactor `frontend/src/components/ui/Card.tsx` to use CSS variables instead of hard‑coded colors. Replace bg, border, and text color classes with `bg-[var(--card)] border-[var(--border)] text-[var(--text)]`. Keep props and structure unchanged. Do not introduce new dependencies.

7) Sidebar component
- Prompt:
  > Refactor `frontend/src/components/layout/Sidebar.tsx` to use tokens for the wrapper background, borders, icon colors, hover background, and active state (selection stripe and text). Use `bg-[var(--surface)]`, `border-[var(--border)]`, `text-[var(--muted)]`, and `text-[var(--primary)]` for active icons. Ensure focus states use `outline-[var(--focus)]` or an equivalent visible ring. Do not alter layout or navigation behavior.

8) Shared Buttons
- Prompt:
  > Identify the shared Button component(s). Implement `primary` and `ghost` variants using tokens: `bg-[var(--primary)] hover:bg-[var(--primaryHover)] text-white`, and ghost as `border-[var(--border)] bg-transparent text-[var(--text)] hover:border-[var(--focus)]`. Ensure keyboard focus uses `outline-[var(--focus)] outline-2`. Do not change call sites.

9) Tables, inputs, and chips (minimal surface)
- Prompt:
  > Replace common hard‑coded colors for table borders, chip borders, inputs, and muted text with `var(--border)` and `var(--muted)`. Keep scope limited to shared primitives only. No behavior changes.

Testing (Phase 2)
- Prompt:
  > Build and run the app. Verify visually that default theme looks unchanged. Check Card, Sidebar, Buttons, inputs, and tables for regressions. Confirm keyboard focus visibility. Do not proceed until parity is confirmed.

---

## Phase 3 — Calendar Shading Tokens

## Phase 2.5 â€” Layout Shell Tokenization

- Prompt:
  > Replace inline `darkTheme` usages and hardcoded hex values in top-level shells with CSS variables. Specifically:
  > - `frontend/src/components/layout/Layout.tsx`: header background/border and any inline colors should read from `var(--surface)`, `var(--border)`, `var(--text)`, and focus tokens.
  > - Remove direct imports of `darkTheme` for styling; keep logic intact.
  > - Ensure page wrappers and any global surfaces (e.g., app background) use `var(--bg)`/`var(--surface)` rather than fixed `#1e1e1e`/slate classes.
  > Do not alter layout structure or behavior. Complete this before exposing a user-facing scheme switcher.

10) CalendarGrid: month shading and today
- Prompt:
  > Update `frontend/src/components/deliverables/CalendarGrid.tsx` to read month shading from `--shade0..--shade4` variables (e.g., via a small helper that maps week index to shade). Today pill should use `bg-[var(--primary)] text-white`. Do not change layout or data logic.

11) Pre‑deliverables tint
- Prompt:
  > Replace pre‑deliverable tint/border with rgba values derived from theme tokens where feasible (or keep constants that harmonize with the theme). Ensure legibility in all themes.

Testing (Phase 3)
- Prompt:
  > Verify calendar visual parity in default theme. Switch themes (via dev query) and confirm shading and today indicator render correctly. Check that pills/labels remain readable.

---

## Phase 4 — Backend Support for Per‑User Theme

12) Extend UserSettings (backend)
- Prompt:
  > Update backend accounts serializers and views to include a `colorScheme` (string) field in user settings. Accept known themes and pass through arbitrary strings without validation failure. Ensure OpenAPI reflects the new field. Add unit tests for read/write round‑trip.

13) Auth store wiring (frontend)
- Prompt:
  > Extend `frontend/src/store/auth.ts` UserSettings type with `colorScheme?: string`. On hydration, if a colorScheme is present, apply it via ThemeManager. Implement `setSettings` flow to persist colorScheme when changed. Unit‑test the store change.

Testing (Phase 4)
- Prompt:
  > Save a colorScheme via Settings API and reload. Confirm ThemeManager applies the saved theme on boot. Validate OpenAPI types if used by code generation.

---

## Phase 5 — Settings UI for Color Scheme

14) Add Settings control
- Prompt:
  > In `frontend/src/pages/Settings/Settings.tsx` (or Profile), add a “Color scheme” selector listing: Default, SMC Navy, Steel Cyan, Triad, Midnight, Sky, Topbar. On change, call ThemeManager.setTheme and persist via auth.setSettings. Keep UI lean; use existing form primitives.

15) Guardrails
- Prompt:
  > Add basic validation to ensure only known theme keys are offered by the selector. If a previously saved custom value is present, show it as “Custom”. Do not block saving known options.

Testing (Phase 5)
- Prompt:
  > Manually switch themes via the UI. Confirm immediate application and persisted reload. Test on the My Work page, Team Dashboard, and Assignments grid. Verify focus and contrast.

---

## Phase 6 — Optional Enhancements

16) System theme (optional)
- Prompt:
  > Add a “System” option that maps to the default theme for now. Prepare a hook for future OS‑level detection, but do not implement OS detection yet to keep scope lean.

17) Per‑route defaults (optional)
- Prompt:
  > Add a tiny helper that allows specific pages (e.g., Print views) to request the default theme temporarily. This should be a scoped override and must revert on navigation.

---

## Phase 7 — QA, Accessibility, and Rollout

18) Accessibility pass
- Prompt:
  > Audit color contrast for text and controls in all themes against WCAG AA. Adjust tokens if needed. Ensure focus rings are consistently visible across components.

19) Regression suite
- Prompt:
  > Run a visual walkthrough on: login, My Work, Team Dashboard, Projects, Assignments grid, Deliverables Calendar. Verify no layout drift or dark/light flicker on boot.

20) Documentation
- Prompt:
  > Update README and a short `docs/THEMES.md` with available themes, how variables map to components, and how to add a new theme safely. Include a short section on testing themes and the dev query override.

---

## Deliverables Summary
- Theme tokens file with multiple theme classes
- ThemeManager with localStorage persistence and early boot application
- Tokenized shared components (Card, Sidebar, Buttons, inputs/tables)
- CalendarGrid shading refactored to theme variables
  
  Note: `colorScheme` is separate from `theme` (light/dark/system) and controls only the palette applied via CSS variables. `theme` toggles display mode via the `dark` class.
- Backend + frontend support for per‑user `colorScheme`
- Settings UI to switch themes, persisted and applied at boot
- QA and docs

## Notes
- Keep all changes lean and reversible. Avoid wholesale rewrites; focus on replacing color primitives only.
- No shortcuts: do not inline theme logic into each component; centralize tokens and application via ThemeManager.
- Coordinate backend schema changes with frontend types to avoid drift.

---

## Plan Updates and Non‑Negotiable Constraints

The following refinements make the plan fool‑proof and avoid common pitfalls:

1) Early theme application (FOUC prevention)
- Add a tiny inline script in `frontend/index.html` (before the bundle) that reads `localStorage.theme` and applies the theme class to `<body>` immediately. ThemeManager can still manage runtime switching, but this prevents a flash of the default.

2) Tailwind/JIT safety
- Use only literal class strings with CSS variables (e.g., `bg-[var(--card)]`). Do NOT construct Tailwind class names dynamically at runtime — they will be purged.
- If you must select from a family (e.g., 5 calendar shades), predeclare an array of 5 literal classes and choose among them. If unavoidable, add those classes to the Tailwind safelist.

3) Focus visibility
- Prefer ring utilities for consistent focus styling: `focus-visible:ring-2 ring-[var(--focus)] ring-offset-1 ring-offset-[var(--card)]`. Avoid outline because it is less consistent across browsers.

4) Calendar shading
- Provide shading via (a) a fixed array of literal classes like `['bg-[var(--shade0)]', … 'bg-[var(--shade4)]']` or (b) inline `style={{ background: 'var(--shadeX)' }}`. Do not generate Tailwind class names dynamically.

5) Backend whitelist for persistence
- The backend currently sanitizes `settings` and will drop unknown keys. Add `'colorScheme'` to the allow‑list and pass the value through as a string (no strict enum yet). Keep existing `'theme'` (light/dark/system) untouched.
- After backend changes, if your workflow relies on OpenAPI → TS generation, run `npm run openapi:types` and validate the frontend builds.

6) ThemeManager fallback
- If the saved value is missing or unknown, coerce to `'default'`, apply it, and persist the corrected value. Log a dev‑only warning if helpful.

7) Scope control
- Tokenize only shared primitives first (Card, Sidebar, Buttons, inputs/tables) and CalendarGrid shades. Defer niche or one‑off hex colors until after the core switch works.

8) Accessibility
- Validate WCAG AA contrast for text and key controls for every theme. Adjust token values where needed. Ensure focus rings remain visible on all backgrounds.

2a) Opacity and hover with CSS variables
- Avoid Tailwind’s `/opacity` suffix with CSS variables (e.g., `bg-[var(--surface)]/50`). Prefer dedicated hover/overlay tokens with baked alpha such as `--surfaceHover`/`--surfaceOverlay`, and use them via `hover:bg-[var(--surfaceHover)]`.

5a) Frontend types
- Add `colorScheme?: string` to the `UserSettings` type and wire it through hydration and `setSettings` flows. Keep `theme` (light/dark/system) behavior unchanged.

7a) Layout shell coverage
- Before exposing a user-facing scheme switcher, include the layout/header shell tokenization so global surfaces adhere to tokens, preventing mixed styles.

9) Theme vs color scheme separation
- Treat `theme` as display mode (`light`/`dark`/`system`) and `colorScheme` as palette (`default`, `sky`, etc.). ThemeManager controls both; the hook delegates to ThemeManager. Apply classes to `document.documentElement`.

10) Base HTML/CSS alignment
- Remove global hardcoded dark background/classes from `index.html`/`index.css` and switch to variable-driven base styles to avoid conflicts with applied schemes.

11) Dev override parameter
- Use `?colorScheme=sky` for the developer override (not `?theme=`) to avoid colliding with the light/dark/system mode.

12) Tests and staged rollout
- Components with tests asserting explicit color classes (e.g., `StatusBadge`) should be deferred to a later phase to avoid breaking tests. When tokenizing those, update tests to assert semantic classes or data attributes rather than specific hex/Tailwind color names.

13) Scrollbar and utilities
- Replace fixed-color scrollbar utilities with variable-driven equivalents or add tokens for scrollbar track/thumb for consistency across schemes.
