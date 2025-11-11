# Projects Pages TSX Refactor & Guardrails Plan

This plan captures current issues and provides phased, prescriptive prompts to safely refactor the Projects pages under `frontend/src/pages/Projects`, enforce lean programming practices, and add guardrails to prevent future formatting/encoding regressions. Each step is phrased as a prompt that can be re-fed into an AI agent.

Lean programming principles for all steps:
- Keep changes minimal, focused, and incremental. Avoid band-aids or shortcuts.
- Fix root causes, reduce duplication, and improve clarity without adding unnecessary abstractions.
- Maintain strict type-safety; remove `any` casts where feasible without broad rewrites.
- Keep backend and frontend aligned by verifying OpenAPI types and usage.
- Validate with TypeScript, linting, and targeted tests after each phase.

---

## Scope & Current Issues (Summary)

- Encoding/copy artifacts introduced by previous AI edits:
  - `frontend/src/pages/Projects/list/components/ProjectsTable.tsx`: corrupted sort icon characters; corrupted fallbacks for next deliverable text.
  - `frontend/src/pages/Projects/list/components/FiltersBar.tsx`: corrupted ellipsis in loading message.
  - `frontend/src/pages/Projects/list/components/PersonSearchResult.tsx` and `frontend/src/pages/Projects/list/components/ProjectDetailsPanel.tsx`: stray `dYZ_` prefix in “Skill Match” label.
- `frontend/src/pages/Projects/ProjectsList.tsx` is large and contains duplicate filters logic: two `useProjectFilters(...)` invocations (the second with `customSortGetters` supersedes the first).
- Duplicated status dropdown UI logic across `ProjectsTable` and `ProjectDetailsPanel`.
- Lint quality: `useProjectFilters` warns about a missing dependency in `useMemo`.
- Tooling: no Prettier/.editorconfig/.gitattributes guardrails detected; risk of single-line file regressions and encoding issues.

---

## Phase 1 — Sanitize Encoding Artifacts (Low-risk, surgical)

Step 1.1 — Fix sort icon characters in ProjectsTable
- Prompt:
  - Update `frontend/src/pages/Projects/list/components/ProjectsTable.tsx` to remove corrupted characters used for sort icons. Replace the return in `SortIcon` with safe, accessible indicators using inline SVG or ASCII arrows. Example (lean option): return a `<span>` containing `'^'` for asc and `'v'` for desc with class `text-[var(--primary)]`.
  - Keep the component signature unchanged. Do not introduce new dependencies.
  - Ensure the icons are visually consistent with the existing table header style.

Step 1.2 — Fix next deliverable fallback labels
- Prompt:
  - In `frontend/src/pages/Projects/list/components/ProjectsTable.tsx`, replace any corrupted placeholders like `'?"'` with a neutral fallback string `'-'` where `nextDeliverable` is absent.
  - Confirm both non-virtual and virtual table bodies use the same fallback `'-'` for consistency.

Step 1.3 — Fix FiltersBar ellipsis
- Prompt:
  - In `frontend/src/pages/Projects/list/components/FiltersBar.tsx`, replace the corrupted ellipsis in the loading text with ASCII `...` to avoid encoding issues.
  - Do not alter message semantics or component props.

Step 1.4 — Fix stray `dYZ_` text in Skill Match labels
- Prompt:
  - In `frontend/src/pages/Projects/list/components/PersonSearchResult.tsx` and `frontend/src/pages/Projects/list/components/ProjectDetailsPanel.tsx`, replace the `dYZ_ Skill Match` string with `Skill Match`.
  - Optionally, add a small inline SVG check or badge if needed, but prefer plain text to keep it lean.

Step 1.5 — Validate
- Prompt:
  - Run `npx tsc --noEmit` to confirm no TypeScript errors.
  - Run a local render sanity check for Projects list view and verify the table header arrows and fallbacks render as expected.

---

## Phase 2 — Simplify ProjectsList Filters (Remove duplication)

Step 2.1 — Remove redundant filters hook usage
- Prompt:
  - Open `frontend/src/pages/Projects/ProjectsList.tsx` and remove the first `useProjectFilters(projects, filterMetadata)` invocation and associated unused variables (`selectedStatusFilters`, `sortBy`, etc.).
  - Keep the second `useProjectFilters(projects, filterMetadata, { customSortGetters: { nextDue: ... } })` as the single source of truth.
  - Rename the `...2` suffixed variables (e.g., `selectedStatusFilters2`, `sortBy2`) back to their base names to reduce confusion while adjusting all references accordingly.
  - Do not change `customSortGetters`; preserve the `nextDue` mapping via `nextDeliverablesMap`.

Step 2.2 — Preserve selection and table wiring
- Prompt:
  - Ensure `useProjectSelection(sortedProjects)` uses the now de-suffixed `sortedProjects` from Step 2.1.
  - Verify props passed into `ProjectsTable` match the de-suffixed names (`projects`, `sortBy`, `sortDirection`, `onSort`, `selectedProjectId`, etc.).
  - Remove any lingering imports/variables made redundant by this change.

Step 2.3 — Validate
- Prompt:
  - Run `npx tsc --noEmit` and `npm run lint:soft` to confirm no errors introduced.
  - Manually verify: sorting by `client`, `name`, `number/status`, and `nextDue` behaves the same as before.

---

## Phase 3 — Consolidate Status Dropdown (DRY UI logic)

Step 3.1 — Create a reusable ProjectStatusDropdown component
- Prompt:
  - Add `frontend/src/components/projects/ProjectStatusDropdown.tsx` exporting a small, typed component that renders the status button and dropdown using existing classes and `editableStatusOptions` and `StatusBadge`.
  - Props: `{ status: string; onChange: (newStatus: string) => void; isOpen: boolean; setOpen: (v: boolean) => void; }`.
  - Keep the element wrapper marked with `.status-dropdown-container` to preserve the outside-click closing logic used elsewhere.
  - Follow lean coding: no new library, minimal logic, reuse existing styling utilities.

Step 3.2 — Replace in ProjectsTable and ProjectDetailsPanel
- Prompt:
  - Update `frontend/src/pages/Projects/list/components/ProjectsTable.tsx` and `frontend/src/pages/Projects/list/components/ProjectDetailsPanel.tsx` to use `ProjectStatusDropdown` instead of duplicating dropdown markup.
  - Preserve current behavior: selected row should keep its visual state; closing on outside click must still work; ensure calls delegate to existing `onChangeStatus`/`onStatusChange`.

Step 3.3 — Validate
- Prompt:
  - Run `npx tsc --noEmit` and validate opening/closing and updating project status in both table and details panel still works.

---

## Phase 4 — Add Guardrails (Formatting, encoding, and pre-commit)

Step 4.1 — Add .editorconfig
- Prompt:
  - Create `.editorconfig` at repo root with:
    - `[*]`
    - `charset = utf-8`
    - `end_of_line = lf`
    - `insert_final_newline = true`
    - `indent_style = space`
    - `indent_size = 2`
  - Do not auto-rewrite the entire repo; these settings will govern future edits.

Step 4.2 — Add .gitattributes
- Prompt:
  - Create `.gitattributes` at repo root with:
    - `* text=auto eol=lf`
    - `*.ts text`
    - `*.tsx text`
  - This normalizes line endings and avoids accidental single-line files caused by EOL mismatches.

Step 4.3 — Introduce Prettier (scoped formatting first)
- Prompt:
  - Add devDeps: `prettier`, `eslint-config-prettier`, `lint-staged`, `husky`.
  - Add `prettier.config.js` with a lean config (2-space indent, printWidth 100–110, singleQuote true, trailingComma all).
  - Add npm scripts: `"format": "prettier --write ."` and update eslint to extend `prettier` last.
  - Initialize Husky pre-commit hook running lint-staged on staged files only.
  - Configure lint-staged to run `prettier --write` and `eslint --fix` on `*.ts,*.tsx,*.js,*.jsx,*.json,*.css`.
  - First run: restrict formatting to `frontend/src/pages/Projects/**/*` to minimize churn. Do not mass-format the entire repo unless requested.

Step 4.4 — Validate
- Prompt:
  - Run `npm run lint:soft` to confirm no new errors and improved consistency. Ensure files remain multi-line and UTF-8.

---

## Phase 5 — Backend/Frontend Coordination

Step 5.1 — Regenerate OpenAPI types
- Prompt:
  - Run `npm run openapi:types` in `frontend/` to regenerate API types from `../backend/openapi.json`.
  - Re-run `npx tsc --noEmit` and resolve any type drift immediately in the Projects pages. Do not silence types; fix usage.

Step 5.2 — Verify API method shapes used by Projects pages
- Prompt:
  - Confirm the following calls match current backend shapes and expected return values:
    - `deliverablesApi.bulkList(ids)` used by `useNextDeliverables` returns an object keyed by projectId with arrays of deliverables.
    - `assignmentsApi.list({ project, page, page_size })` pagination semantics used by `useProjectAssignments` are correct.
    - `assignmentsApi.update(...)`, `assignmentsApi.delete(...)`, and `assignmentsApi.checkConflicts(...)` payloads and responses align with backend.
    - `projectsApi.getAvailability(projectId, mondayIso, { candidates_only, department, include_children })` used in `useProjectAvailability` matches OpenAPI.
    - `peopleApi.skillMatch`/`skillMatchAsync` and `jobsApi.pollStatus` are consistent with backend.
  - If drift is detected, update request/response handling in the hooks/components without changing API contracts unless coordinated with backend.

Step 5.3 — Validate
- Prompt:
  - Run `npx tsc --noEmit` and a quick app smoke test of the Projects view: filters, selection, status change, next deliverables display, person search.

---

## Phase 6 — Testing (Unit, Integration, E2E)

Step 6.1 — Unit tests (Vitest)
- Prompt:
  - Add unit tests for:
    - `useProjectFilters`: status filter combinations, custom `nextDue` sort getter application, and search.
    - `ProjectsTable` SortIcon: renders correct indicator for `asc` vs `desc` and hides when not the active column.
  - Follow lean tests: small fixtures, no deep mocking frameworks beyond what is already used.

Step 6.2 — Integration tests (React Testing Library)
- Prompt:
  - Render `ProjectsList` with mocked hooks/data to validate:
    - List renders, sorting toggles, and fallback `'-'` for next deliverables.
    - Status change triggers `onChangeStatus` and closes dropdown.
    - “Select a project” empty state when none selected.
  - Avoid coupling to implementation details; query by roles/labels.

Step 6.3 — E2E flows (Playwright)
- Prompt:
  - Add a focused spec to navigate to Projects, type a search term, toggle a status filter, select a project, open status dropdown and change status, and confirm details panel updates.
  - Skip heavy assignment editing flows here unless required.

Step 6.4 — Lint/type checks in CI
- Prompt:
  - Ensure CI runs: `npx tsc --noEmit` and `npm run lint:soft` at minimum.
  - Add `npm run test:run` for unit/integration coverage on PRs touching the Projects pages.

---

## Phase 7 — Small Quality Pass

Step 7.1 — Address `useMemo` dependency warning in `useProjectFilters`
- Prompt:
  - Update `frontend/src/pages/Projects/list/hooks/useProjectFilters.ts` to make `matchesStatusFilter` a stable reference or include it in the `useMemo` dependency array for `filteredProjects`.
  - Keep behavior identical; avoid introducing new state or heavy memoization layers.

Step 7.2 — Remove obvious `any` casts in ProjectsList
- Prompt:
  - In `frontend/src/pages/Projects/ProjectsList.tsx`, replace `as any` status update casts with precise types, keeping minimal surface changes.
  - Re-run `npx tsc --noEmit` to validate.

---

## Final Verification

Step F.1 — Comprehensive pass
- Prompt:
  - Run: `npx tsc --noEmit`, `npm run lint:soft`, `npm run test:run`.
  - Manually verify: Projects page loads, sorting/filtering works, status dropdowns work in both table and details, next deliverables render or show `'-'`, person search renders “Skill Match” correctly.
  - Confirm files remain properly formatted (multi-line, UTF-8) and no corrupted characters remain.

---

## Addendum — Plan Hardening & Guardrails (Consolidated)

These additions strengthen the plan to be fool‑proof and reduce risk of code‑breaking changes or encoding regressions. When a step below “supersedes” an earlier instruction, follow this addendum.

Editing Rules (apply to every step)
- Use apply_patch for all file changes. Preserve formatting and existing line endings.
- Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal `\r\n` sequences; let the patch handle newlines.
- Avoid bulk regex replacements; submit minimal, contextual patches. Keep patches small and focused.
- After each code edit, run `npx tsc --noEmit` from `frontend/` to validate. Stop on any error and fix before continuing.
- Only use best‑practice programming. Do not use shortcuts or band‑aids. Never remove code or functionality just to make tests pass.

### Phase 0 — Baseline & Safety (Gating)

Step 0.1 — Ensure a clean working state
- Prompt:
  - Confirm the working tree is clean and create a feature branch for this effort (no edits yet).

Step 0.2 — Capture baseline signals
- Prompt:
  - From `frontend/`, run `npx tsc --noEmit`, `npm run lint:soft`, and `npm run test:run` (if tests exist). Record results. Do not proceed if there are baseline errors unrelated to this plan; surface them to the maintainer.

Step 0.3 — Baseline file‑health scan (entire repo)
- Prompt:
  - Scan all tracked files for encoding/safety hazards and log findings:
    - U+FFFD replacement char `�`, BOM `\ufeff`, control characters (outside standard whitespace), and extremely long lines (> 4000 chars).
    - Single‑line files (≤ 1 newline) in `*.ts,*.tsx,*.js,*.jsx,*.css,*.md`.
  - Do not modify files yet; just report counts and locations to confirm scope.

Step 0.4 — Proceed gating
- Prompt:
  - Proceed to Phase 1 only if baseline is healthy or if issues are confined to the Projects pages as targeted by this plan.

### Phase 1 — Sanitize Encoding Artifacts (add pre/post scans)

Step 1.0 — Targeted pre‑scan (Projects pages only)
- Prompt:
  - Search `frontend/src/pages/Projects/**/*` for U+FFFD `�`, BOM `\ufeff`, stray `dYZ_`, and corrupted placeholders in ProjectsTable (next deliverables and sort icons). Capture exact file:line matches for reference.

Step 1.5 — Validate (post‑scan and compile) — supersedes earlier Step 1.5
- Prompt:
  - Run `npx tsc --noEmit` to confirm no TypeScript errors.
  - Re‑run the targeted scan from Step 1.0 to ensure no `�`, `\ufeff`, or `dYZ_` remain within `frontend/src/pages/Projects/**/*`.
  - Run a local render sanity check for Projects list view and verify the table header arrows and fallbacks render as expected.

### Phase 2 — Simplify ProjectsList (split into safer sub‑steps)

Step 2.1 — Remove redundant filters hook usage (no renames yet) — supersedes prior Step 2.1
- Prompt:
  - Open `frontend/src/pages/Projects/ProjectsList.tsx` and remove the first `useProjectFilters(projects, filterMetadata)` invocation and associated unused variables (`selectedStatusFilters`, `sortBy`, etc.).
  - Keep the second `useProjectFilters(projects, filterMetadata, { customSortGetters: { nextDue: ... } })` as the single source of truth.
  - Do not rename variables in this sub‑step. Do not change `customSortGetters`.
  - Immediately run `npx tsc --noEmit` and fix any errors.

Step 2.2 — Safe renaming of `...2` variables (new)
- Prompt:
  - Rename the `...2` suffixed variables (e.g., `selectedStatusFilters2`, `sortBy2`, `sortedProjects2`, etc.) back to their base names, updating all references in `ProjectsList.tsx`.
  - After renaming, run `npx tsc --noEmit` and `npm run lint:soft`. Fix any missed references.

Step 2.3 — Verify removal and preserve selection wiring — supersedes prior Step 2.2
- Prompt:
  - Grep for any lingering `...2` symbol names to ensure none remain.
  - Ensure `useProjectSelection(sortedProjects)` uses the now de‑suffixed `sortedProjects`.
  - Verify props passed into `ProjectsTable` match the de‑suffixed names (`projects`, `sortBy`, `sortDirection`, `onSort`, `selectedProjectId`, etc.). Remove any lingering imports/variables made redundant by this change.

### Phase 3 — Status Dropdown consolidation (preserve behavior)

Step 3.1 — Component details — augmentation
- Prompt:
  - Create `frontend/src/components/projects/ProjectStatusDropdown.tsx` with props `{ status: string; onChange: (newStatus: string) => void; isOpen: boolean; setOpen: (v: boolean) => void; }`.
  - Keep a wrapper with `.status-dropdown-container` to remain compatible with existing outside‑click logic.
  - Internally, implement a `useEffect` that installs and cleans up an outside‑click listener, and support Escape key to close for accessibility.
  - No new dependencies; reuse existing styling.

### Phase 4 — Guardrails (blocking checks)

Step 4.4 — Add blocking file‑health checks (encoding + single‑line guard) — new
- Prompt:
  - Add a small script (e.g., `scripts/check-file-health.mjs`) that, for staged files, fails on:
    - U+FFFD `�`, BOM `\ufeff`, or disallowed control characters.
    - Files with ≤ 1 newline (single‑line) in relevant extensions.
    - Any line exceeding 4000 characters as a safety threshold.
  - Integrate into `lint-staged` and add `npm run check:health` to run in CI.
  - Ensure `eslint` has `no-irregular-whitespace: error` and `unicode-bom: ['error','never']`. Optionally set `max-len` to 120–140.

Step 4.5 — Git EOL safety (recommended)
- Prompt:
  - Document and recommend `git config core.autocrlf input` for Windows contributors so local editing aligns with `.gitattributes` LF policy.

### Phase 5 — Backend/Frontend coordination (enforce enums)

Step 5.3 — Verify status literals/enums — new
- Prompt:
  - Confirm the set of allowed project status values with the backend/OpenAPI. If enumerated, create a narrow TypeScript union for status and ensure UI components accept only those values.

### Phase 6 — Testing (expand coverage)

Step 6.1 — Unit tests — augmentation
- Prompt:
  - Add a `useNextDeliverables` unit test verifying next upcoming selection and that the UI fallback is `'-'` when `null`.

Step 6.3 — E2E flows — augmentation
- Prompt:
  - Assert that “Skill Match” renders (and `dYZ_` never appears) and table headers show correct sort indicators for the active column.

Step 6.4 — CI checks — augmentation
- Prompt:
  - Ensure CI runs: `npx tsc --noEmit`, `npm run lint:soft`, `npm run test:run`, `npm run check:health`, and `prettier --check`. Gate merges on these checks.

### Final Verification (add CI parity)

Step F.2 — CI parity — new
- Prompt:
  - Ensure CI mirrors pre‑commit checks: `prettier --check`, `npm run check:health`, `npx tsc --noEmit`, lint, and tests. Do not allow bypassing guardrails. Keep scope minimal and changes lean.
