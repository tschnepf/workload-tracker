Refactor First

Phase 0 — Setup & Baseline (New)

- Preconditions: confirm `frontend` has `lint:soft` (non‑blocking warnings) and configure ESLint import resolver so `@` aliases resolve.
  - If missing, add `eslint-plugin-import` and `eslint-import-resolver-typescript`; update `frontend/eslint.config.js` with `settings: { 'import/resolver': { typescript: { project: 'frontend/tsconfig.json' } } }` and light max‑lines warnings (non‑blocking).
- Baseline capture: write `prompts/analysis-baseline.txt` with:
  - Current commit SHA and timestamp
  - Top 10 largest TS/TSX files under `frontend/src` (path + size)
  - React Query keys used by Assignments and Project grids
  - Event bus topics/signatures: `subscribeGridRefresh(p: { touchedWeekKeys?: string[]; reason?: string })`
  - LocalStorage keys: `assignGrid:*`, `projGrid:*` (list exact keys in use)
  - Dropdown keying: `${assignment.id}:${assignment.project}` for Status dropdowns
  - Note existing seams to reuse: `toWeekHeader` (grid/utils), `useGridUrlState`, `useCellSelection`
- Optional analyzers (non‑blocking):
  - `npx --yes madge --circular --ts-config frontend/tsconfig.json "frontend/src/**/*.{ts,tsx}"`
  - `npx --yes ts-prune --ignore "src/api/schema.ts"`

Phase 1
frontend/src/pages/Assignments/AssignmentGrid.tsx:1 — 1962 lines

- Goals: reduce to <350 lines by extracting UI pieces, hooks, and utils; preserve behavior and query keys.
- Step 2.1 (seams, no moves): HeaderBar, WeekHeader (sticky), Legend, PersonGroupHeader, AssignmentRow (existing), ProjectCell, RemoveAssignmentButton, WeekCell, DeliverablesBar, ColumnResizeHandle.
- Step 2.2 (hooks in-file): useGridColumnWidths (must persist existing keys), useEditingCell, useStatusControls (compose `useDropdownManager` + `useProjectStatus` without changing public props), useDeliverableBars, useScrollSync, useWeekHeaders (reuse `toWeekHeader`), and reuse `useCellSelection` where applicable.
- Step 3.1 (move components): to `frontend/src/pages/Assignments/grid/components/*` using alias `@/pages/...`.
- Step 3.2 (move hooks): to `frontend/src/pages/Assignments/grid/hooks/*`; keep signatures and call order.
- Step 3.3 (utils): move `classifyDeliverableType`, `deliverableTypeColors` to `frontend/src/util/deliverables.ts` and reuse `@/pages/Assignments/grid/utils/toWeekHeader`; avoid cycles.
- Step 3.3.1 (guarded test): add a minimal unit test to assert deliverable classification/color outputs match pre‑refactor examples (exact labels/colors).
- Step 3.4 (major container): extract `AssignmentRow` into `grid/components/AssignmentRow.tsx` with a typed props interface; keep keying and focus timing.
- Guards: keep `subscribeGridRefresh` topic and react-query keys unchanged; do not alter StatusBadge/Dropdown public APIs; preserve localStorage keys for column widths; preserve dropdown keying format `${assignment.id}:${assignment.project}`; keep hook call order identical (no new conditional hooks).
- Validation: build + unit/smoke; confirm identical hook order.


- Step 4.1 (component): PersonSection
  - Path: `frontend/src/pages/Assignments/grid/components/PersonSection.tsx`
  - Scope: A single person’s block including PersonGroupHeader, Add‑Assignment UI, Assignments map, Empty state
  - Props (explicit):
    - `person`, `weeks`, `gridTemplate`, `loadingAssignments`
    - Handlers: `togglePersonExpanded(personId)`, `addAssignment(personId, project)`, `removeAssignment(assignmentId, personId)`
    - Selection: `onCellSelect`, `onCellMouseDown`, `onCellMouseEnter`, `selectedCell`, `selectedCells`
    - Editing: `onEditStart`, `onEditSave`, `onEditCancel`
    - Status controls: `getProjectStatus`, `statusDropdown`, `projectStatus`, `onStatusChange`
    - Deliverables: `getDeliverablesForProjectWeek`
  - Guards: presentational only; do not call data hooks here.
  - Validation: build + smoke for expand/collapse, add/remove, selection.

- Step 4.2 (component): AddAssignmentRow
  - Path: `frontend/src/pages/Assignments/grid/components/AddAssignmentRow.tsx`
  - Scope: project search input, dropdown, save/cancel buttons, row layout across weeks
  - Props: `personId`, `weeks`, `gridTemplate`, state/handlers from `useProjectAssignmentAdd`
  - Validation: keyboard + mouse flows for search/select/save/cancel.

- Step 4.3 (component): StatusBar
  - Path: `frontend/src/pages/Assignments/grid/components/StatusBar.tsx`
  - Scope: Utilization legend + selection summary pill
  - Props: `labels: { blue; green; orange; red }`, `selectionSummary?: string`
  - Validation: consistent layout, no visual regressions.

- Step 4.4 (component): EmptyStateRow
  - Path: `frontend/src/pages/Assignments/grid/components/EmptyStateRow.tsx`
  - Props: `weeks`, `gridTemplate`
  - Validation: correct column structure when no assignments.

- Step 4.5 (hook): useProjectAssignmentAdd
  - Path: `frontend/src/pages/Assignments/grid/useProjectAssignmentAdd.ts`
  - Moves: add‑assignment state/handlers (project search, dropdown nav, select/save/cancel)
  - Inputs: `people`, `setPeople`, `assignmentsApi`, `projectsApi` (passed/injected), `showToast`
  - Returns: `{ state, actions }` for AddAssignmentRow + container
  - Guards: preserve API payloads, toasts, and behavior.

- Step 4.6 (hook): useAssignmentsSnapshot
  - Path: `frontend/src/pages/Assignments/grid/useAssignmentsSnapshot.ts`
  - Moves: `loadData()` + async snapshot polling (job id/progress/message), `weeks` via `toWeekHeader`, `isSnapshotMode`, `subscribeGridRefresh`
  - Returns: `{ weeks, isSnapshotMode, loadData, asyncJob, setPeople, setAssignmentsData, setProjectsData, setDeliverables, setHoursByPerson }`
  - Guards: React Query key usage and event bus signatures unchanged.

- Step 4.7 (hook): useGridKeyboardNavigation
  - Path: `frontend/src/pages/Assignments/grid/useGridKeyboardNavigation.ts`
  - Moves: window keydown logic (Enter/Tab/Arrows) using `useCellSelection` + `editingCell`
  - Inputs: `{ selectedCell, editingCell, isAddingAssignment, weeks, csSelect, setEditingCell, setEditingValue }`
  - Guards: maintain focus/selection semantics and timing.

- Step 4.8 (hook): useDeliverablesIndex
  - Path: `frontend/src/pages/Assignments/grid/useDeliverablesIndex.ts`
  - Moves: `getDeliverablesForProjectWeek` using an indexed Map built from `deliverables`
  - Returns: `(projectId, weekStart) => Deliverable[]`
  - Guards: classification/colors still from `@/util/deliverables`.

- Step 4.9 (hook): useProjectStatusFilters
  - Path: `frontend/src/pages/Assignments/grid/useProjectStatusFilters.ts`
  - Moves: `selectedStatusFilters` state, `formatFilterStatus`, `toggleStatusFilter`, `matchesStatusFilters`
  - Consumers: HeaderBar, rowOrder builder for `useCellSelection`
  - Guards: preserve labels and “Active ‑ No Deliverables” semantics.

- Step 4.10 (utils): assignmentActions
  - Path: `frontend/src/pages/Assignments/grid/assignmentActions.ts`
  - Moves: `updateAssignmentHours`, `updateMultipleCells`, `removeAssignment`
  - Guards: keep React Query invalidations identical (`['capacityHeatmap']`, `['workloadForecast']`).

- Step 4.11 (container, optional): PeopleSection
  - Path: `frontend/src/pages/Assignments/grid/components/PeopleSection.tsx`
  - Scope: iterates people and renders `PersonSection` items; AssignmentGrid becomes a thin composer of hooks + top layout.

Guards (4.x)

- Do Not Change — React Query keys, event bus topics, dropdown keying (`assignmentId:projectId`), localStorage width keys.
- Presentational components must not call data hooks directly.
- Move incrementally, one item at a time; verify after each step.

Validation (after each 4.x step)

- Build: `npm --prefix frontend run build`
- Tests: `npm --prefix frontend run test:run`
- Soft Lint: `npm --prefix frontend run lint:soft`


Phase 2
frontend/src/pages/Projects/ProjectsList.tsx:1 — 1820 lines

- Goals: reduce to <400 lines; split pane UI and editing logic.
- Step 2.1 (seams): FiltersBar, ProjectsTable (left), ProjectDetailsPanel (right), AssignmentRow (existing), PersonSearchResult (existing), DeliverablesSectionLoader.
- Step 2.2 (hooks): useProjectFilters (search, status, dept), useProjectSelection, useAssignmentInlineEdit, useRoleSearch, useVirtualRows (very thin wrapper over react‑virtual that preserves row keys/measurement/overscan), usePaneLayout.
- Step 3.1 (move components): to `frontend/src/pages/Projects/list/components/*` (keep lazy DeliverablesSection as-is).
- Step 3.2 (move hooks): to `frontend/src/pages/Projects/list/hooks/*`.
- Step 3.3 (utils): consolidate status helpers (format/color/options) under `@/components/projects/statusUtils.ts` if not already present; re-export from StatusBadge for stability.
- Guards: preserve routes/Links, toast messages, and mutation invalidation; keep scroll virtualization contract and row keys identical; preserve `Suspense` boundaries and lazy imports (do not relocate `DeliverablesSection`).
- Validation: build + smoke; ensure tab/focus behavior in inline editor remains.

Phase 3
frontend/src/pages/People/PeopleList.tsx:1 — 1529 lines

- Goals: reduce to <400 lines; isolate details/filters/skills editors.
- Step 2.1 (seams): FiltersPanel, PeopleListPane (uses existing PeopleListTable), PersonDetailsPanel, SkillsEditor, BulkActionsBar, AutocompleteDropdowns (role/location), GearMenu, DeleteConfirm.
- Step 2.2 (hooks): usePeopleQuery+Pagination, usePersonSelection, useSkillsEditing (including proficiency editing), useDropdowns, useAutocomplete, useBulkActions.
- Step 3.1 (move components): to `frontend/src/pages/People/list/components/*`.
- Step 3.2 (move hooks): to `frontend/src/pages/People/list/hooks/*`.
- Step 3.3 (utils): extract `normalizeProficiencyLevel` and shared skill helpers to `frontend/src/util/skills.ts`.
- Step 3.3.1 (guarded test): add a minimal unit test for `normalizeProficiencyLevel` to confirm mappings (beginner/intermediate/advanced/expert) are unchanged.
- Guards: keep `useUpdatePerson` mutation shape, toast strings, and autofocus behaviors; preserve keyboard handlers; preserve ARIA roles/ids for autocompletes, initial auto-select, and autocomplete dropdowns.
- Validation: build + smoke; verify pagination and initial auto-select.

Phase 4
frontend/src/pages/Assignments/ProjectAssignmentsGrid.tsx:1 — 1364 lines

- Goals: reduce to <350 lines; mirror person grid patterns.
- Step 2.1 (seams): HeaderBar, WeekHeader, Legend, ProjectRow, AssignmentRow, WeekCell, ColumnResizeHandle.
- Step 2.2 (hooks): useGridColumnWidths (shared, with `projGrid` keys), useCellSelection (existing), useScrollSync (refs only, no DOM queries), useEditingCell, useTotalsLoading, useWeeksHorizon.
- Step 3.1 (move components): to `frontend/src/pages/Assignments/project-grid/components/*`.
- Step 3.2 (move hooks): to `frontend/src/pages/Assignments/project-grid/hooks/*`.
- Step 3.3 (utils): deliverable type mapping/bar calc shared with person grid under `@/util/deliverables.ts`.
- Guards: preserve localStorage width keys (`assignGrid:*`, `projGrid:*`), status change events, and legend labels derived from `useUtilizationScheme` (do not hardcode).
- Validation: build + smoke.

Phase 5
frontend/src/services/api.ts:1 — 1329 lines

- Goals: reduce to <400 lines without breaking public API exports.
- Step 2.M (identify pure utils): token helpers (`base64UrlDecode`, `getTokenExpSeconds`), `ensureAccessTokenFresh`, ETag integration, inflight/response cache, `doFetch`/`fetchApi`, error mapping.
- Step 3.M (move utils): create `frontend/src/services/internal/{auth.ts,client.ts,cache.ts,errors.ts}` for helpers. Keep side-effect-free; no behavior changes.
- Step 3.M.1 (API split guard): keep resource clients (e.g., `peopleApi`, `projectsApi`, etc.) in `services/api.ts`; re-export any moved helpers as needed to avoid churn. Optionally introduce `services/resources/*` in a later pass.
- Guards: keep symbol names and method signatures; maintain ETag and If-Match behavior; retain `@/api/client` and `authHeaders` usage.
- Validation: typecheck + smoke; check import cycles.

Phase 6
backend/people/views.py:1 — 1271 lines

- Goals: reduce to <400 lines; isolate throttles, selectors, and services.
- Step B.1 (separate throttles): move `FindAvailableThrottle`, `HotEndpointThrottle`, `HeatmapThrottle`, `SkillMatchThrottle` to `people/throttles.py`.
- Step B.2 (selectors): move queryset builders and descendant-resolution to `people/selectors.py`.
- Step B.3 (services): move utilization calculations, Excel import/export triggers, and skill-match orchestration to `people/services/{utilization.py,excel.py,skills.py}`.
- Step B.4 (views split): keep `PersonViewSet` CRUD/list minimal; extract heavy `@action` endpoints (e.g., `utilization`, skill match) into dedicated APIViews or separate ViewSets in `people/views_extra.py`; wire in `urls.py`.
- Guards: preserve route names, `extend_schema` docs, ETag/Last-Modified semantics, throttling scopes, and response shapes.
- Validation: run DRF spectacular schema generation; basic smoke of list + utilization.

Refactor Next

Phase 7
backend/projects/utils/excel_handler.py:1 — 1042 lines

- Goals: reduce to <350 lines; separate export/import/template concerns.
- Step B.M (identify seams): group helpers by sheet: projects, assignments, deliverables; and by mode: template vs export vs import.
- Step B.1 (module split): create `projects/excel/{export.py,import.py,template.py,utils.py}`; move `_create_*_sheet` functions and IO helpers accordingly.
- Step B.2 (re-exports): keep `export_projects_to_excel` and any public functions in `utils/excel_handler.py` as shims importing from new modules to avoid import churn.
- Step B.3 (types): introduce small dataclasses/typed dicts for row schemas to shrink per-function complexity.
- Guards: keep header names, cell formats, and response filename patterns.
- Validation: generate a file and compare sheet names/headers to baseline.

Phase 8
backend/assignments/views.py:1 — 986 lines

- Goals: reduce to <400 lines; move aggregation, throttles, and grid snapshot logic out.
- Step B.1 (throttles): move `HotEndpointThrottle`, `GridSnapshotThrottle` to `assignments/throttles.py`.
- Step B.2 (selectors/services): extract department-descendant resolution, ordering, and aggregates to `assignments/selectors.py` and `assignments/services/grid_snapshot.py`.
- Step B.3 (views split): keep CRUD minimal; extract heavy `@action` endpoints to `assignments/views_extra.py`.
- Guards: maintain ETag/IMS handling, query param names, and response shapes.
- Validation: schema regen + smoke.

Phase 9
frontend/src/pages/Assignments/AssignmentForm.tsx:1 — 952 lines

- Goals: reduce to <300 lines; isolate inputs and editor logic.
- Step 2.1 (seams): PersonSelector, ProjectSelector, RoleInput, WeekHoursEditor, ActionsBar.
- Step 2.2 (hooks): useAssignmentFormState, useWeekHoursModel, useRoleAutocomplete, useValidation.
- Step 3.1/3.2: move components/hooks under `frontend/src/pages/Assignments/form/{components,hooks}`.
- Guards: keep form submission shape and validation messages intact.
- Validation: build + basic e2e flow.

Phase 10
backend/deliverables/views.py:1 — 817 lines

- Goals: reduce to <400 lines; move business logic to services.
- Step B.1 (services): move reallocation logic and window computation to `deliverables/services/reallocation.py` with pure functions.
- Step B.2 (selectors): move common queryset builders to `deliverables/selectors.py`.
- Step B.3 (views split): keep CRUD minimal; move calendar/reallocation/reorder actions to `deliverables/views_extra.py`.
- Guards: preserve flags (AUTO_REALLOCATION), response contract (`reallocation` summary keys), and transaction boundaries.
- Validation: unit test reallocation service to confirm unchanged outputs.

Phase 11
backend/projects/views.py:1 — 751 lines

- Goals: reduce to <400 lines; split stats/excel/actions.
- Step B.1 (selectors/services): extract project list ordering, filtering, and stats to `projects/{selectors.py,services/stats.py}`.
- Step B.2 (excel endpoints): move to `projects/views_excel.py` calling the `excel` utilities.
- Step B.3 (views split): keep CRUD/basic actions only in main ViewSet.
- Guards: keep route names, serializer choices, and throttling.
- Validation: smoke list/retrieve and export.

Phase 12
frontend/src/pages/Dashboard.tsx:1 — 788 lines

- Goals: reduce to <300 lines; compose from widgets.
- Step 2.1 (seams): FiltersBar, KPIWidgets, UtilizationChart, UpcomingDeliverables, ActivityFeed.
- Step 2.2 (hooks): useDashboardData, useAutoRefresh, useKpiDerivations.
- Step 3.1/3.2: move to `frontend/src/pages/Dashboard/{components,hooks}`.
- Guards: maintain existing query keys and refresh intervals.
- Validation: smoke.

Low Priority (still candidates)

Phase 13
frontend/src/pages/Skills/SkillsDashboard.tsx:1 — 564 lines

- Goals: reduce to <300 lines.
- Step 2.1 (seams): SkillFilters, SkillCloud, PeopleBySkillList, SkillTrends.
- Step 2.2 (hooks): useSkillFilters, useSkillMetrics, useTrends.
- Step 3.1/3.2: move to `frontend/src/pages/Skills/dashboard/{components,hooks}`.
- Validation: smoke.

Phase 14
backend/config/settings.py:1 — 547 lines

- Goals: reduce to <400 lines without changing behavior.
- Step B.S (split settings): create `backend/config/settings/` package with `base.py` and environment overlays (`dev.py`, `prod.py`). In fast mode, only move bulky dicts to `config/settings_components/{logging.py,rest.py,caches.py,features.py}` and import them from current settings.
- Step B.G (guard): leave `DJANGO_SETTINGS_MODULE` pointing to current module; no env churn; keep existing import path working.
- Validation: runserver/lint smoke; ensure all dicts imported and merged.

Phase 15
frontend/src/components/deliverables/DeliverablesSection.tsx:1 — 531 lines

- Goals: reduce to <350 lines.
- Step 2.1 (seams): SectionHeader, DeliverableList, DeliverableItemRow, InlineEditors.
- Step 2.2 (hooks): useDeliverablesQuery, useInlineEdit, useReorder.
- Step 3.1/3.2: move to `frontend/src/components/deliverables/{components,hooks}` (keep default export stable).
- Guards: maintain status color/label mapping.
- Validation: smoke.

Phase 16
frontend/src/components/layout/Sidebar.tsx:1 — 522 lines

- Goals: reduce to <250 lines.
- Step 2.1 (seams): SidebarHeader, NavList, NavItem, FooterActions.
- Step 2.2 (hooks): useSidebarState, useNavSections.
- Step 3.1 (config): move nav items to `frontend/src/components/layout/navItems.ts` and render from data.
- Validation: smoke; verify active route and keyboard nav.

Phase 17
frontend/src/components/mockup/AssignmentGridMockup.tsx:1 — 873 lines

- Goals: reduce to <400 lines or archive.
- Step 2.1 (seams): split into smaller mock components (MockHeader, MockRow, MockCell) for reuse in docs/tests.
- Step 3.1 (move): place under `frontend/src/components/mockup/assign-grid/*` or mark as archived if unused.
- Guards: none; avoid shipping mock logic into prod bundles if possible (code split or dev-only flag).
- Validation: smoke in story or dev route.

Safety Gates (Global)

- Do Not Change — React Query keys and invalidation patterns (all pages). Keep key arrays and queryClient usage identical.
- Do Not Change — Event bus topics and signatures: `subscribeGridRefresh`, project status subscription, `showToast` topics.
- Do Not Change — localStorage keys: `assignGrid:*`, `projGrid:*` (e.g., `assignGrid:clientColumnWidth`, `assignGrid:projectColumnWidth`, `projGrid:widthsScaled075`, `projGrid:widthsFix_v2025_10`, `projGrid:widthsFix_projectReset_client06`).
- Do Not Change — Public export names and module paths for `services/api.ts` (e.g., `peopleApi`, `projectsApi`, `assignmentsApi`, `deliverablesApi`, `jobsApi`). If helpers are split, re-export shims from original file.
- Do Not Change — DRF route names/URLs, throttling scopes, and `extend_schema` docs when splitting backend views.
- Do Not Change — Excel artifacts: sheet names (Projects, Assignments, Deliverables), header text and order, filename patterns.
- Do Not Change — Reallocation response contract keys: `deltaWeeks`, `assignmentsChanged`, `touchedWeekKeys`.
- Do Not Change — Status enums, labels, and color mappings used by `StatusBadge`/`StatusDropdown`.
- Do Not Change — Hook call order and absence of conditional hook calls within components.

Safety Gates (Per Phase)

- Addendum for Phase 1: reuse `toWeekHeader` for week headers; keep hook call order; avoid introducing new conditional hooks.
- Addendum for Phase 4: legend labels must continue to derive from `useUtilizationScheme`.
- Addendum for Phase 5: use shared `etagStore` canonicalization consistently across legacy and typed clients.

- Phase 1 (AssignmentGrid.tsx): keep dropdown keying (`assignment.id:projectId`), `subscribeGridRefresh` wiring, week header generation, and column width persistence keys. Don’t move data hooks into presentational seams.
- Phase 2 (ProjectsList.tsx): preserve virtualization keys, `Suspense` boundaries, inline edit focus/blur timing, and toast messages.
- Phase 3 (PeopleList.tsx): keep ARIA roles/ids for autocompletes, initial auto-select, pagination `next` handling, and mutation shapes.
- Phase 4 (ProjectAssignmentsGrid.tsx): mirror person grid width keys and scroll sync; keep legend labels and status change events.
- Phase 5 (services/api.ts): preserve symbol names and If-Match/ETag behavior; only move pure helpers and re-export.
- Phase 6 (backend/people/views.py): keep route/action names, throttling scopes, ETag/Last-Modified semantics when splitting.
- Phase 7 (excel_handler.py): freeze sheet names/headers and template/export behavior; add shims for moved functions.
- Phase 8 (backend/assignments/views.py): preserve ETag/IMS handling, ordering semantics, and filter params.
- Phase 9 (AssignmentForm.tsx): keep form submission payload shape and validation messages.
- Phase 10 (backend/deliverables/views.py): preserve AUTO_REALLOCATION flag semantics and transaction boundaries.
- Phase 11 (backend/projects/views.py): keep list ordering and export endpoints intact; wire excel endpoints to new module.
- Phase 12 (Dashboard.tsx): keep query keys and refresh intervals.
- Phases 13–17: maintain public exports and props of components moved; avoid import cycles.

Validation Matrix (Run After Each Phase)

- Typecheck/Build: `npm --prefix frontend run build`
- Unit/Smoke: `npm --prefix frontend run test:run` (or targeted smoke tests)
- Soft Lint: `npm --prefix frontend run lint:soft` (keep CI `lint` strict); ensure ESLint import resolver resolves `@` aliases (no unresolved import warnings)
- Import Cycles (optional): `npx --yes madge --circular --ts-config frontend/tsconfig.json "frontend/src/**/*.{ts,tsx}"`
- Unused Exports (optional): `npx --yes ts-prune --ignore "src/api/schema.ts"`
- OpenAPI Types Regen: `npm --prefix frontend run openapi:types` → only `frontend/src/api/schema.ts` should change
- Backend Schema (optional): regenerate spectacular and ensure URLs unchanged
- Manual Smoke: navigate critical flows (selection, inline edit, dropdowns) and verify no regressions

Characterization Baselines (Before and After)

- UI Snapshots: capture DOM/screenshot of key flows in the grids (selection range, edit cell, status dropdown open).
- API Shapes: record example JSON payloads for hot endpoints (people list with dept filters, assignments list with ordering, project grid snapshot). Compare keys/types post-refactor.
- Excel Golden: export a sample file, verify sheet names and headers match baseline 1:1.
- OpenAPI Hash: record hash/size of `backend/openapi.json`; if changed unexpectedly, investigate.
 - Baseline Doc: append frozen keys/topics/localStorage keys and dropdown keying to `prompts/analysis-baseline.txt` and compare pre/post counts.

Change Management and Rollback

- Two-step commits per unit: (A) in-file extraction only; (B) file moves + import updates + shim re-exports.
- Use `git mv` for history when moving files; avoid broad renames.
- Big UI pages behind feature flags where feasible. If gating, add typed flags to `frontend/src/lib/flags.ts` (e.g., `UI_NEW_ASSIGNMENT_GRID`, `UI_NEW_PROJECTS_LIST`, `UI_NEW_PEOPLE_LIST`) and gate routes in `frontend/src/main.tsx`. If not gating, skip flag work to reduce scope.
- Keep shim modules for backend view splits and Excel utilities; remove shims only after adoption.

Definition of Done (Per Phase)

- Target line count met (or materially reduced toward target).
- All Safety Gates observed; public APIs unchanged.
- Validation Matrix passes (typecheck, build, smoke; optional cycle/unused checks clean or documented).
- No new import cycles introduced.
- For backend phases: routes, throttles, and schema generation verified; response shapes unchanged.

Frozen Contracts (Must Remain Stable)

- React Query keys: include `['capacityHeatmap', ...]`, `['workloadForecast', ...]` and any existing keys used by grids/filters.
- Event bus: `subscribeGridRefresh` listener signature `(p: { touchedWeekKeys?: string[]; reason?: string }) => void`.
- LocalStorage keys: exact `assignGrid:clientColumnWidth`, `assignGrid:projectColumnWidth`, `assignGrid:widthsFix_v2025_10`, and `projGrid:*` keys including migration/fix flags and `projGrid:statusFilters`.
- Dropdown keying: `${assignment.id}:${assignment.project}` for Status dropdown instances.
- Public services: export names and module path for `services/api.ts` clients (`peopleApi`, `projectsApi`, `assignmentsApi`, `deliverablesApi`, `jobsApi`, `utilizationSchemeApi`).
- Status utilities: `StatusBadge` re‑exports (`formatStatus`, `editableStatusOptions`) and color mapping contracts.

Golden Checks Cheat Sheet

- React Query keys/topics/localStorage: search refs with ripgrep and compare counts
  - `rg "queryClient|useQuery\(" frontend/src`
  - `rg "gridRefreshBus|toastBus|projectStatusSubscription" frontend/src`
  - `rg "assignGrid:|projGrid:" frontend/src`
- Excel: verify headers quickly by opening a generated file and listing row 1 of each sheet; compare to baseline list
- OpenAPI/types: `rg "export type .* =" frontend/src/api/schema.ts` to confirm type names still present
