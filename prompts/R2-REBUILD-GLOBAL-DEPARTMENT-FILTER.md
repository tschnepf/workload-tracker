

# R2-REBUILD — Global Department Filter (Agent-Ready, Sequential Prompts)

Purpose: Introduce a single, persistent department filter applied across the entire application. The selection must be visible and changeable anywhere, persist across navigation and reloads, and propagate to all relevant pages and API calls. Follow repository standards from `R2-REBUILD-STANDARDS.md` with no shortcuts, no band-aids, and lean programming best practices. All changes must be non-breaking.

Key Standards to Honor (Do Not Deviate):

- Backend models and DB: snake_case. API: camelCase via DRF serializers with `source=...` mapping.
- UI: strictly use tokens from `frontend/src/theme/tokens.ts` (VSCode dark theme). No hardcoded hex colors.
- Performance: avoid N+1 queries (`select_related`/`prefetch_related`), add useful indexes, cache where appropriate.
- Tests: Add focused DRF tests for backend behavior and smoke tests for frontend where practical.
- Safety gates: tsc must pass; containers restarted when necessary; verify with browser network tab.
- No shortcuts or temporary hacks. When errors are found, apply the correct fix at the correct layer.

Global Filter Principles:

- One source of truth: global department selection with optional “include sub-departments”.
- Visible in the app layout header; usable from any page.
- Persists to localStorage; supports deep link via URL (?dept=ID&deptChildren=0|1).
- Pages with a local department widget sync to global by default; optional local override only when necessary.
- Non-breaking: existing endpoints keep response shapes; filters are optional query params.

---

Critical Safety Checks (Run on Every Prompt Before/After):

```bash
# Pre-flight
find frontend/src -name "*.js" -o -name "*.jsx" | grep -v node_modules  # Must be empty; delete if found
# Health
docker-compose ps  # All services must be Up
curl -s http://localhost:8000/api/health/ | grep "healthy"

# Post-frontend changes (MANDATORY)
docker-compose exec frontend npx tsc --noEmit
# Restart frontend if changes not reflecting
docker-compose restart frontend

# Post-backend changes (MANDATORY)
docker-compose exec backend python manage.py test -v 2  # Run scoped tests you added
curl -s http://localhost:8000/api/health/ | grep "healthy"
```
If any check fails, STOP and fix properly. No band-aids.

---

## Prompt 1 — Freeze Contract: Global Department Filter Specification

Define the global department filter contract in `contracts/department.filter.md`.

Requirements:

- Document front-end state contract:
  - State: `selectedDepartmentId: number|null`, `includeChildren: boolean`.
  - Persistence: localStorage keys `deptFilter.selectedId`, `deptFilter.includeChildren`.
  - URL params: `?dept=ID` and `?deptChildren=0|1`. On load, URL overrides localStorage if present. On change, update URL via `history.replaceState` (no history spam).
  - Event propagation: global store emits changes; pages subscribe via hook.
- Document backend contract:
  - Query params accepted where relevant: `department=<id>`, `include_children=0|1` (snake_case on backend; serializers to camelCase where exposed via API clients).
  - Endpoints to support (read-only filter): People list, Assignments list, People workload_forecast, People capacity_heatmap. Others optional as needed by pages.
- Include validation notes: ignore invalid IDs, tolerate missing params, no response shape changes.
- Provide example requests/responses illustrating filters applied.

Acceptance Criteria:

- Contract file exists with the above details and examples.
- Naming strictly follows repo standards (snake_case backend, camelCase API shape where applicable).

---

## Prompt 2 — Frontend Foundation: Global Store + Hook (No UI Yet)

Create a minimal, dependency-free global store and hook for department filter.

Requirements:

- Files: `frontend/src/store/departmentFilter.ts` and `frontend/src/hooks/useDepartmentFilter.ts`.
- Store API:
  - State: `selectedDepartmentId: number | null` (STANDARDIZE on null for "All"; do NOT use empty string), `includeChildren: boolean`.
  - Methods: `setDepartment(id: number | null)`, `clearDepartment()`, `setIncludeChildren(v: boolean)`.
  - Persistence: initialize from localStorage; write-through on change.
  - URL sync: on initial mount, read from `location.search` ONCE (URL has precedence over localStorage). Use an `initializing` guard to avoid echo loops. Thereafter, update URL via `history.replaceState` on user-initiated changes only (no history spam).
- Hook: returns state + setters + helper to construct API params `{ department: number|undefined, includeChildren: boolean|undefined }`.
- Strict TypeScript; no runtime logs; no hardcoded colors.

Safety & Validation:

- TypeScript compile must pass.
- Include a tiny unit-like test or usage example in a comment.
- Verify that changing the store updates localStorage and URL exactly once per change and does not loop.

Acceptance Criteria:

- Store and hook compile; no side effects on import; URL/localStorage handling isolated and resilient.
- First render does NOT flash "All" and then re-load; initialization is stable.

---

## Prompt 3 — Frontend UI: GlobalDepartmentFilter Component + Layout Integration

Add a compact, accessible dropdown component in the app layout header.

Requirements:

- Component: `frontend/src/components/filters/GlobalDepartmentFilter.tsx`.
- Behavior:
  - Load departments via existing `departmentsApi.listAll()` (use react-query or memoized fetch per repo conventions).
  - Control binds to global store; selecting a department updates global state.
  - Include a clear button and an optional “Include sub-departments” checkbox.
  - Make the dropdown searchable (typeahead). Filter as the user types; highlight matches in results. Keep it dependency-free; throttle input to ~100ms.
  - If department count is large (>50), use simple list virtualization or limit results to top N with a “show more” affordance. Avoid heavy libraries.
- Styling: use tokens from `theme/tokens.ts`; no hardcoded hex; keyboard accessible.
- Accessibility: provide a visible label or `aria-label` (e.g., "Global department filter"), ensure focus is visible and keyboard navigation is supported. Announce changes via `aria-live="polite"` on a hidden region (e.g., “Department filter set to Engineering.”).
  - Follow ARIA combobox pattern fully: support Home/End, PageUp/Down, type-to-select; Esc clears input when empty.
  - Provide `aria-describedby` help text on the "Include sub-departments" checkbox to explain scope.
  - Respect `prefers-reduced-motion` for any animations or scroll-into-view behavior.
- Optional UX: if changing department triggers heavy queries, debounce the state-to-query propagation by ~150–250ms (do not debounce the store itself).
- Integration: render the component inside the main layout header (`frontend/src/components/layout/Layout.tsx` or equivalent), right-aligned in the actions bar.
- Global affordances:
  - Add a small active badge in the header showing the current selection (e.g., “Dept: Engineering”) with an inline clear “×”.
  - Add a “Copy link” button/icon to copy a deep link reflecting the current filter (uses `navigator.clipboard`, fallback to selection on unsupported browsers).
  - Add a keyboard shortcut to focus/open the filter (suggested: Alt+Shift+D to reduce collisions). Implement at the layout level; ensure it’s announced and configurable in code.
- Do not change page-level behavior yet; only expose the control globally.

Safety & Validation:

- TypeScript compile must pass.
- Verify no console errors and dropdown options load from API.

Acceptance Criteria:

- Filter visible in header on all pages; selection updates global store.
- Typeahead search works with keyboard navigation; focus is visible; screen reader announces updates.
- Header shows active badge and clear; “Copy link” copies a URL with `dept`/`deptChildren` params.
- Alt+Shift+D focuses the filter from anywhere in the app (unless focus is inside an input/textarea).

---

## Prompt 4 — Frontend Wiring (Pages With Existing Department Filters)

Synchronize existing page-level department filters to the global store by default.

Requirements:

- Pages: Dashboard, Team Forecast, and any other page already using department filters.
- Replace local department state with global store state, or bind local control to global store.
- If a page truly needs a local override, add a small toggle: “Use local filter”, which enables a page-local state; default OFF. Avoid this unless strictly necessary.
- Ensure queries re-run when the global filter changes:
  - Include `selectedDepartmentId` (and `includeChildren` when applicable) in all query keys; or
  - Explicitly invalidate and refetch on filter changes.

Safety & Validation:

- TypeScript compile must pass.
- Browser test: change department in header; page data updates accordingly; reload and navigate—filter persists.

Acceptance Criteria:

- Pages reflect global selection; no breaking changes to other behavior.

---

## Prompt 5 — Frontend Wiring (Pages Without Department Filters)

Apply global department filter implicitly to pages that previously had no department control (e.g., Assignments).

Requirements:

- Consume the global filter via hook and pass it to all relevant API calls on the page.
- Show a small, non-intrusive info pill like “Filtered by: Electrical” with a click target that focuses the global filter control in the header (and optionally includes a quick “Copy link” action next to it).
- Keep page UX lean: do not add local dropdowns unless a real use case demands it.
- Update forms/selectors default behavior:
  - Person-selecting dropdowns (e.g., on Assignments create/edit) should default to filtering by the global department.
  - If a page requires viewing people across departments, provide an explicit override toggle local to that control.

Safety & Validation:

- Verify affected API calls include filter params only when selectedDepartmentId is set.
- TypeScript compile must pass; no console errors.

Acceptance Criteria:

- Pages without prior filters now respect the global filter; UX remains simple.

---

## Prompt 6 — Frontend: URL Sync and Persistence Polish

Finalize URL parameter handling and persistence semantics.

Requirements:

- On first load: if URL has `?dept=ID` and/or `?deptChildren=0|1`, initialize from URL and overwrite localStorage.
- On subsequent changes: update URL via `history.replaceState` (do not push a new history entry).
- Clearing the filter removes `dept` and `deptChildren` from the URL and localStorage.
- Add a small helper util for parsing/serializing the query.
- Guard against URL<->store update loops using an `initializing` flag. Only one initialization from URL is allowed per load.
- Define precedence order clearly: URL on first load > localStorage; thereafter, store drives URL.
- Ensure the header “Copy link” button uses the current URL (including `dept`/`deptChildren`) and provides a clear success/failure toast or aria-live announcement.

Safety & Validation:

- Manual test across navigation and reloads; copy link to a new tab and verify selected department is restored.

Acceptance Criteria:

- Deep links work; persistence is predictable and stable.

---

## Prompt 11 — UX Enhancements (Optional but Recommended)

Polish the experience with lightweight, accessible enhancements.

Requirements:

- Hierarchical UX (if applicable):
  - If departments are hierarchical, display the parent path in option labels (e.g., “Engineering › Backend”).
  - Disable or hide “Include sub-departments” when the selected department has no children (or show a tooltip explaining why it’s disabled).
- Loading feedback:
  - Show a small skeleton or progress bar in pages when data refetches due to a filter change; avoid layout shift.
- Multi-tab behavior (optional):
  - Listen for the `storage` event and update the store if `deptFilter.*` keys change in another tab. Protect with a simple guard to avoid echo loops. Consider a small feature flag (e.g., `enableStorageSync`) defaulting to false.
- Recents:
  - Maintain a small LRU list (e.g., last 5) of recently used departments in localStorage and surface them at the top of the dropdown for quicker access.
- Discoverability:
  - Add a one-line tooltip or helper text on first use (persist dismissal in localStorage).

Acceptance Criteria:

- None of the enhancements introduce heavy deps; a11y remains intact.
- Tree/labels, skeletons, storage sync (if enabled), and recents behave as described.

---

## Prompt 7 — Backend: Standardize Department Filtering Across Endpoints

Add optional department filters to relevant endpoints without changing response shapes.

Requirements:

- Endpoints to support: `people` list, `assignments` list, `people/workload_forecast`, `people/capacity_heatmap`.
- Query params (backend snake_case): `department=<id>`, `include_children=0|1`.
- Filtering strategy:
  - For people: filter by `person.department_id` with optional tree expansion if include_children is true.
  - For assignments: filter by related assignment’s person.department.
  - For forecast/heatmap: scope the base queryset of people to filtered set before aggregation.
- Performance: `select_related('department')` where used; for assignments include `select_related('person__department')`. Ensure indexes on `people(department_id)` and `assignments(person_id)` exist.
- Tests: Add DRF tests per endpoint to assert filtering behavior and default (no filter) behavior.
- Param handling and semantics:
  - Accept `include_children` as `1` or `0` (strings or ints). Default to `0` if missing.
  - If hierarchical traversal is not implemented yet, ignore `include_children` without error and document this in the API description.
- Extended coverage (optional but recommended for consistency): If deliverables/calendar endpoints compute counts derived from people/assignments, add optional `department/include_children` to keep numbers consistent across pages.

Safety & Validation:

- Do not alter existing response shapes.
- TypeScript contract unchanged; frontend only adds params.

Acceptance Criteria:

- Department filtering works across specified endpoints; tests pass.

---

## Prompt 8 — Frontend: API Client Extensions and Refactors

Ensure all relevant client calls accept department parameters and pass them through.

Requirements:

- Extend existing API clients (e.g., `peopleApi`, `assignmentsApi`) to accept optional `{ department?: number, includeChildren?: boolean }` in methods used by pages.
- Introduce a single helper (e.g., `buildDeptParams`) to map UI state to backend params consistently: `{ department: id, include_children: includeChildren ? 1 : 0 }`. Forbid ad-hoc query string concatenation.
- Run `npx tsc --noEmit` and fix any fallout with proper solutions (no band-aids).

Acceptance Criteria:

- API clients compile; pages pass through department params consistently.

---

## Prompt 9 — Tests and QA Script

Add focused tests and a repeatable QA script.

Requirements:

- Backend DRF tests: per endpoint, verify filtered vs. unfiltered counts; invalid department ID ignored; children inclusion behaves correctly (if implemented now; otherwise mark TODO).
- Frontend smoke checks: a minimal test that mounts the filter store and a mock consumer, verifying: initialization from URL (URL precedence), change updates URL and localStorage once, consumer re-renders with the new state, and no initialization loop occurs.
- QA Script (manual):
  1) Select a department in the header; confirm Dashboard, Team Forecast, Assignments update.
  2) Reload and navigate to multiple pages; filter persists.
  3) Copy current URL; open in a new tab; filter is applied.
  4) Toggle include-children and confirm people/assignments counts adjust.
  5) Clear the filter; verify all pages show all departments.
  6) Open two tabs; change department in one; verify the other remains stable (documented behavior). Optional enhancement: listen to `storage` events later.

Acceptance Criteria:

- Tests pass locally; QA script succeeds without console errors.

---

## Prompt 10 — Production Polish and Non-Breaking Guarantees

Harden performance, ensure non-breaking behavior, and finalize documentation.

Requirements:

- Confirm indexes exist on `people.department_id` and relevant FKs used in filters.
- Add `select_related('department')` in hot paths to prevent N+1 queries.
- Confirm all new code uses dark tokens; no hardcoded colors introduced.
- Confirm no existing analytics, charts, or pages are broken by the changes (run a quick smoke suite).
- Update `README.md` (or a suitable doc) with a short “Global Department Filter” section explaining behavior and deep links.
  - Document the keyboard shortcut (Alt+Shift+D) to open/focus the global filter.
- Verify forms/selectors default to the global department where applicable (e.g., people pickers on Assignments).
- Ensure initial page load does not double-fetch due to late initialization; guard queries until store initialization completes.

Acceptance Criteria:

- No regressions; performance remains acceptable; docs updated.

---

Appendix — Engineering Notes

- No heavy dependencies are introduced.
- Prefer small, composable utilities over large abstractions.
- Consistent error handling: when issues arise, fix at the source. Avoid layers of workaround.
- Future option: Persist per-user default department server-side; out of scope for now.

End of Guide.
