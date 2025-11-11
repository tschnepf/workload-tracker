# Frontend Tests Remediation Plan (Prescriptive, Lean, No Shortcuts)

Scope: Fix failing frontend tests identified in `prompts/FAILING-TESTS-TRIAGE-APPENDIX.md` without introducing regressions or band-aid code. Maintain API contracts; keep changes minimal, local, and reversible. Follow lean programming best practices.

Impacted areas:
- StatusBadge label formatting (visual test)
- StatusDropdown keyboard/Enter semantics (a11y behavior)
- Performance test harness calibration (virtualization/memo)
- PersonalDashboard integration tests (React Router data router harness)

---

## Guiding Principles
- Favor correctness and safety over expedience; no shortcuts or quick fixes.
- Keep edits minimal and scoped; avoid broad refactors.
- Maintain UI/API response shapes and semantics across frontend and backend.
- Prefer small, self-contained PR-sized changes with clear rollbacks.
- Add or update tests alongside fixes; do not weaken assertions unless they were invalid.

---

## Phase 0 — Pre-Flight (Context & Baseline)

1) Prompt: Establish scope and file inventory
- "List the files involved in the failing tests and their implementations:
  - `frontend/src/components/projects/StatusBadge.tsx`
  - `frontend/src/components/projects/__tests__/statusBadge.visual.test.tsx`
  - `frontend/src/components/projects/StatusDropdown.tsx`
  - `frontend/src/components/projects/__tests__/accessibility.test.tsx`
  - `frontend/src/components/projects/__tests__/performance.test.tsx`
  - `frontend/src/pages/Personal/PersonalDashboard.tsx`
  - `frontend/src/pages/Personal/__tests__/personalDashboard.integration.test.tsx`
  - `frontend/src/components/layout/__tests__/sidebar.personal-flag.test.tsx`
  Confirm these exist and are tracked. Do NOT modify unrelated files."

2) Prompt: Baseline test run (scoped)
- "Run only the failing tests to capture current failures and stack traces using file paths or `-t` filters (Vitest v3):
  - `npm --prefix frontend run test:run -- src/components/projects/__tests__/statusBadge.visual.test.tsx`
  - `npm --prefix frontend run test:run -- src/components/projects/__tests__/accessibility.test.tsx`
  - `npm --prefix frontend run test:run -- src/components/projects/__tests__/performance.test.tsx`
  - `npm --prefix frontend run test:run -- src/pages/Personal/__tests__/personalDashboard.integration.test.tsx`
  Optionally: `npm --prefix frontend run test:run -- -t "StatusBadge Visual Regression Tests"`
  Record failure messages verbatim in a scratch note (no code changes)."

3) Prompt: API contract sanity (read-only)
- "Search for usages of backend endpoints affected by recent changes (reports totals, projects filter metadata). Confirm no field names changed in frontend code. Do not modify."

4) Prompt: Optional provider harness (only if needed)
- "Skip adding a global `TestProviders` wrapper unless a test explicitly requires providers. Current tests use `MemoryRouter` and pass `QueryClientProvider` inline where needed. Prefer the minimal harness for stability and to avoid refactor risk."

---

## Phase 1 — StatusBadge Label Formatting (Visual Consistency)

Goal: Resolve mismatch `On_hold` vs `On Hold` by aligning on a canonical formatting strategy used across UI. Keep accessibility and snapshots stable.

Amendments (folded into this plan)
- Use the existing `formatStatus` in `frontend/src/components/projects/status.utils.ts` as the single source of truth. Do not add a new mapping/helper.
- Update tests to assert explicit, canonical labels per status; do not re-implement formatting logic in tests.
- Unknown status contract: non-empty unknown strings are Title Cased (e.g., `not_a_status` → `Not A Status`); only null/undefined produce `Unknown`.
- Commands: use file-path runs or `-t` with Vitest v3. Example: `npm --prefix frontend run test:run -- src/components/projects/__tests__/statusBadge.visual.test.tsx`.

1) Prompt: Confirm single source of truth
- "Use the existing `formatStatus` as the single source of truth for display labels (e.g., `on_hold` → `On Hold`, `active_ca` → `Active CA`). Do not add a new mapping or helper."

2) Prompt: Ensure consistent usage
- "Ensure all components use `formatStatus` for display (they already do in `StatusBadge`, `StatusDropdown`, `MyProjectsCard`). Do not duplicate formatting logic in components or tests."

3) Prompt: Align test expectation
- "Update `statusBadge.visual.test.tsx` to assert explicit, canonical labels for each status:
  - `active` → `Active`
  - `active_ca` → `Active CA`
  - `planning` → `Planning`
  - `on_hold` → `On Hold`
  - `completed` → `Completed`
  - `cancelled` → `Cancelled`
  Do not re-implement formatting logic in the test; use an explicit mapping in test scope."

4) Prompt: Testing
- "Run `npm --prefix frontend run test:run -- src/components/projects/__tests__/statusBadge.visual.test.tsx`. Confirm the visual test passes and no new failures appear."

5) Prompt: Unknown key contract and test
- "Clarify the contract: non-empty unknown strings are Title Cased (e.g., `not_a_status` → `Not A Status`); only null/undefined produce `Unknown`. Add a test case asserting this behavior."

---

## Phase 2 — StatusDropdown Keyboard/Enter Semantics (A11y)

Goal: Ensure Enter selects the focused option consistently, matching ARIA expectations and test assertions. Current implementation and tests already align; verify behavior, no code changes expected.

1) Prompt: Inspect current keyboard handling
- "Open `StatusDropdown.tsx` and confirm `Enter`/`Space` on an option triggers selection and close (handled on the option `onKeyDown`). Keep ARIA roles and `aria-selected` as implemented."

2) Prompt: Align Enter behavior to focused option
- "If Enter currently toggles a default/current value, change it to select the focused option (if present). Ensure Escape closes without changes, and Space mirrors Enter when appropriate. Keep logic small."

3) Prompt: ARIA roles and attributes (lock one pattern)
- "If using `listbox`/`option`, ensure focused option is indicated and `aria-selected` reflects the chosen option. Keep semantics consistent with the chosen pattern."

4) Prompt: Update tests minimally
- "Assert that pressing Enter on a focused `completed` option yields `completed`. Keep other assertions intact (navigation, selection markers)."

5) Prompt: Testing
- "Run `npm --prefix frontend run test:run -- src/components/projects/__tests__/accessibility.test.tsx`. Confirm all a11y tests pass."

---

## Phase 3 — Performance Test Harness Calibration

Goal: Make performance benchmarks meaningful under virtualization/memoization. Stop asserting raw render counts when virtualization is present.

1) Prompt: Identify rendering strategy
- "Open `__tests__/performance.test.tsx` and determine whether the component(s) under test use virtualization or heavy memoization that suppresses mount counts."

2) Prompt: Choose a stable metric
- "Prefer one of:
  - time-boxed render duration (ms) under a fixed dataset size, or
  - number of visible row components after disabling virtualization in test mode (prop/env flag), or
  - interaction throughput (e.g., time to update 1 item among N).
  Pick a metric that reflects user-perceived performance and is insensitive to implementation details."

3) Prompt: Gate virtualization in test
- "If needed, add a prop like `testDisableVirtualization` (default false) that tests can enable. Keep this prop internal (doc-comment only) and avoid shipping dead code. Do not alter production behavior."

4) Prompt: Update test accordingly
- "Rewrite `performance.test.tsx` to use the chosen metric. Keep thresholds conservative and CI-safe; silence noisy logs."

5) Prompt: Testing
- "Run `npm --prefix frontend run test:run -- src/components/projects/__tests__/performance.test.tsx`. Confirm the test passes reliably on CI. Optionally guard heaviest tests behind `RUN_HEAVY=1`."

6) Prompt: Helpful debug output
- "When the metric fails, print measured values (e.g., `visibleRows=`, `durationMs=`) to speed up triage. Keep logs concise to avoid polluting CI."

---

## Phase 4 — PersonalDashboard Router Harness (Data Router)

Goal: Keep test harness minimal. Current tests work with `MemoryRouter`; only introduce a data router if a blocking need emerges.

0) Prompt: Provider harness (only if needed)
- "Prefer `MemoryRouter` in tests. Only add `RouterProvider`/`createMemoryRouter` and shared providers if a specific test requires them."

1) Prompt: Routing
- "Use `MemoryRouter` unless data router features are strictly needed for the test."

2) Prompt: Navigation helpers
- "If migrating to a data router, provide initial entries and route objects consistent with `Layout` usage. Handle loading/suspense if applicable."

3) Prompt: Testing
- "Run `npm --prefix frontend run test:run -- src/pages/Personal/__tests__/personalDashboard.integration.test.tsx`. Confirm both scenarios (linked/unlinked) pass."

4) Prompt: Mock network (optional)
- "If the component performs fetches, provide MSW handlers for the minimal endpoints touched to keep tests deterministic (no real network)."

---

## Phase 5 — Cross-Cutting Contract Checks (Read-Only)

1) Prompt: Backend contract audit
- "Search frontend for backup create flows and calendar consumers. Confirm that expected HTTP statuses and payload shapes are handled. Do not change frontend unless drift is verified."

2) Prompt: End-to-end smoke (optional)
- "If a local dev server is available, run the app and click through Projects and Personal pages. Capture any console errors related to API shapes. No code changes unless a real regression is found."

---

## Phase 6 — Test Suite & Static Checks (Repeatable)

1) Prompt: Run focused tests
- "Run only the updated test files first (use file paths or `-t`):
  - `npm --prefix frontend run test:run -- src/components/projects/__tests__/statusBadge.visual.test.tsx`
  - `npm --prefix frontend run test:run -- src/components/projects/__tests__/accessibility.test.tsx`
  - `npm --prefix frontend run test:run -- src/components/projects/__tests__/performance.test.tsx`
  - `npm --prefix frontend run test:run -- src/pages/Personal/__tests__/personalDashboard.integration.test.tsx`
  Confirm they pass."

2) Prompt: Run full frontend test suite
- "Run `npm --prefix frontend run test:run`. Ensure green. Record any unrelated failures in `prompts/FAILING-TESTS-TRIAGE.md` without fixing them here."

3) Prompt: Build/typecheck
- "Run `npm --prefix frontend run build` (includes `tsc --noEmit`). Fix type errors strictly local to changes."

4) Prompt: Ensure typecheck script exists (optional)
- "If a dedicated `typecheck` script is desired, add `"typecheck": "tsc --noEmit"` to `frontend/package.json`, and run it in CI."

---

## Phase 7 — Rollback & Safety

1) Prompt: Minimal rollback list
- "Prepare a list of commits (or files) touched in this effort. Ensure each change is isolated and can be reverted independently. Document in the PR description."

2) Prompt: Changelog and ownership
- "Add a short changelog entry summarizing fixes. Tag component owners (Projects UI, Personal Dashboard) for review."

3) Prompt: Production readiness
- "Confirm tests are green, builds pass, and no API drift was introduced. Ensure keyboard/a11y behavior changes were reviewed."

---

## Appendix — One‑Shot Prompts (Per‑Item Execution)

- "StatusBadge: keep `formatStatus` as the single source of truth; update `statusBadge.visual.test.tsx` to assert explicit labels (e.g., `on_hold` → `On Hold`)."
- "StatusDropdown: verify current Enter/Space selection behavior and ARIA roles/attributes in `StatusDropdown.tsx`; no code change expected; keep accessibility test asserting `completed`."
- "Performance tests: favor relative or CI‑safe thresholds; if necessary, reduce dataset sizes or guard heavy tests with an env flag (e.g., `RUN_HEAVY=1`)."
- "PersonalDashboard: keep `MemoryRouter` for tests as‑is; do not introduce a data router harness unless a test requires it."
- "Build, run focused tests, then full suite; then `npm --prefix frontend run build`. Do not modify unrelated code; record any unrelated failures in triage."

---

# Backend Tests Remediation Plan (From prompts/FAILING-TESTS-TRIAGE.md)

Scope: Fix failing backend tests called out in `prompts/FAILING-TESTS-TRIAGE.md` while maintaining API contracts and operational safety. Keep changes minimal, local, and reversible. No shortcuts or band-aid fixes.

Impacted areas:
- DRF throttling for backup creation endpoint (HTTP 429 on second POST)
- Read-only mode middleware honoring restore lock
- Deliverables calendar (mine-only) duplicate elimination and inclusion via project assignments
- UserProfile duplication created via signals (unique constraint violations)

---

## B‑Phase 0 — Pre‑Flight (Context & Baseline)

1) Prompt: Establish scope and file inventory
- "List the likely files to touch:
  - `backend/core/backup_views.py` (or corresponding backups API views)
  - `backend/config/settings.py` (DRF throttle config)
  - `backend/core/middleware.py` (Read‑Only/Restore lock middleware)
  - `backend/deliverables/views.py` (calendar endpoints) and/or utilities building the calendar queryset
  - `backend/accounts/signals.py` (UserProfile creation), `backend/accounts/models.py` (unique constraints)
  Confirm they exist and are tracked. Do NOT modify unrelated files."

2) Prompt: Baseline targeted tests
- "Run only the failing tests to capture current messages:
  - `python backend/manage.py test core.tests.test_backup.BackupAPITests.test_create_backup_enqueues_job_and_throttle -v 2`
  - `python backend/manage.py test core.tests.test_backup.MaintenanceMiddlewareTests.test_read_only_mode_blocks_post_when_lock_present -v 2`
  - `python backend/manage.py test deliverables.tests.test_calendar_union_mine_only -v 2`
  - Identify and run the specific test(s) causing IntegrityError for `accounts_userprofile_user_id_key`.
  Record stack traces; no code changes."

3) Prompt: API/UI contract sanity (read-only)
- "Search frontend for backup create flows and calendar consumers. Confirm that expected HTTP statuses (202 for first backup, 429 for throttled second) and payload shapes are handled. Do not change frontend yet."

---

## B‑Phase 1 — Backups Create Throttle (HTTP 429)

Goal: Ensure POST `/api/backups/` enforces throttle scope `backup_create`, returning 429 on the second POST within the configured window.

1) Prompt: Inspect view and throttle classes
- "Open backups API view (list/create). Verify a throttle scope (e.g., `throttle_scope = 'backup_create'`) or an explicit throttle class referencing this scope. If missing, add a minimal DRF throttle setup on the create action only."

2) Prompt: Settings and rates
- "Ensure `REST_FRAMEWORK['DEFAULT_THROTTLE_CLASSES']` includes `ScopedRateThrottle` (or equivalent) and `DEFAULT_THROTTLE_RATES['backup_create']` is defined (e.g., `"1/min"`). Keep values conservative and configurable."

3) Prompt: Test isolation and cache
- "In tests, ensure throttle storage is isolated (LocMemCache) and cleared between assertions. Use a distinct test user per test to avoid cross-test leakage of throttle history."

4) Prompt: Tests
- "Add/update a focused test asserting:
  - First POST → 202 (accepted or created)
  - Second POST within window → 429
  Use DRF test client; avoid network calls."

5) Prompt: Run targeted tests
- "Run `python backend/manage.py test core.tests.test_backup.BackupAPITests.test_create_backup_enqueues_job_and_throttle -v 2`. Confirm it passes."

---

## B‑Phase 2 — Read‑Only Mode via Restore Lock

Goal: When `<BACKUPS_DIR>/.restore.lock` exists, all mutating requests (POST/PUT/PATCH/DELETE) return 503, with a minimal allow-list.

1) Prompt: Middleware behavior
- "Open `backend/core/middleware.py` and locate Read‑Only mode middleware. Ensure it:
  - Resolves `settings.BACKUPS_DIR`, checks `<BACKUPS_DIR>/.restore.lock`.
  - Blocks mutating methods with HTTP 503 and concise message.
  - Allows GET/HEAD/OPTIONS and a minimal allow-list if needed (e.g., health endpoints).
  Keep logic small and side-effect free."

2) Prompt: Middleware ordering and allow-list
- "Confirm middleware order is early enough to block writes before view logic executes. Keep allow-list minimal (e.g., `/api/health`, `/api/readiness`). Document behavior briefly."

3) Prompt: Tests
- "Update/add a test that:
  - Creates a temp `BACKUPS_DIR` with `.restore.lock` present.
  - Issues a POST to a simple endpoint and asserts 503.
  - Removes lock and asserts normal behavior resumes.
  Use `override_settings(BACKUPS_DIR=tmpdir)`."

4) Prompt: Run targeted tests
- "Run `python backend/manage.py test core.tests.test_backup.MaintenanceMiddlewareTests.test_read_only_mode_blocks_post_when_lock_present -v 2`. Confirm it passes."

---

## B‑Phase 3 — Deliverables Calendar (Mine‑Only) Duplicates & Inclusion

Goal: Eliminate duplicate deliverables and ensure inclusion via project assignments when `mine_only` is active; keep response shape stable.

1) Prompt: Analyze current queryset logic
- "Open deliverables calendar view(s)/utility. Identify unions/joins used for mine-only. Note where duplicates enter (e.g., multiple joins across assignments/people)."

2) Prompt: Apply a vendor‑agnostic distinct strategy
- "Prefer a two‑stage approach for portability:
  - Subquery: select distinct deliverable IDs using annotations/filters (no `SELECT *`).
  - Outer query: filter with `id__in=subquery` and order appropriately.
  Avoid `distinct('id')` on SQLite; fallback to plain `.distinct()` only when safe."

3) Prompt: Ensure inclusion via assignments
- "Add/adjust a join to include deliverables linked through project assignments for the current user when `mine_only` is true. Keep filters indexed and selective."

4) Prompt: Tests
- "Update/add tests in `deliverables.tests.test_calendar_union_mine_only`:
  - `test_duplicate_deliverables_eliminated_with_distinct`
  - `test_mine_only_includes_deliverables_via_project_assignments`
  Ensure assertions are on stable fields and counts."

5) Prompt: Run targeted tests
- "Run `python backend/manage.py test deliverables.tests.test_calendar_union_mine_only -v 2`. Confirm both tests pass."

---

## B‑Phase 4 — UserProfile Duplication (Signals)

Goal: Make profile creation idempotent and resilient; avoid unique constraint violations on `accounts_userprofile.user`.

1) Prompt: Inspect signals and model constraints
- "Open `backend/accounts/signals.py` and locate post‑save handlers for `User`. Ensure the handler uses `get_or_create(user=user, defaults={...})` and handles race conditions conservatively (e.g., retry once on IntegrityError). Confirm a OneToOne field or unique index exists."

1.a) Prompt: Enforce schema consistency (if missing)
- "If `UserProfile.user` is not a `OneToOneField` with `unique=True`, add/confirm the unique constraint. Keep the migration surgical and avoid other changes."

1.b) Prompt: Guard against re‑entrancy
- "Ensure the signal avoids re‑entrant creation (e.g., ignore when `created=False` if appropriate). Keep logic minimal."

2) Prompt: Tests
- "Add a test simulating double‑invocation:
  - Create a user
  - Manually invoke the signal or create again in a way that may trigger the handler twice
  - Assert only one profile exists (idempotency)."

3) Prompt: Run targeted tests
- "Run `python backend/manage.py test accounts.tests` (or the specific test you added). Confirm green."

---

## B‑Phase 5 — Cross‑Cutting Contract Checks (Read‑Only)

1) Prompt: Backend contract audit
- "Re‑scan endpoints touched (backups create throttle, calendar) in frontend code for expected behaviors (429 handling, no schema drift). Do not change contracts lightly."

2) Prompt: Ops notes
- "Document throttle rate expectations and read‑only behavior in brief doc strings/help text where appropriate. Keep docs short and precise."

---

## B‑Phase 6 — Test Suite & Static Checks (Repeatable)

1) Prompt: Run only targeted tests
- "Run the four targeted areas again at high verbosity. Confirm all green."

2) Prompt: Run broader suite if feasible
- "Optionally run `python backend/manage.py test -v 1`. Any unrelated failures should be recorded in `prompts/FAILING-TESTS-TRIAGE.md` for later, not fixed here."

3) Prompt: Security/static tools
- "Run `bandit -r backend` and linter (e.g., `ruff .` or `flake8`) if configured. Confirm no new warnings introduced in touched files."

---

## B‑Phase 7 — Rollback & Safety

1) Prompt: Minimal rollback list
- "Prepare a list of commits/files changed. Ensure each change is isolated for easy revert. Capture in PR description."

2) Prompt: Production readiness
- "Confirm throttle works as configured, read‑only mode is enforced by lock, calendar duplicates eliminated, and profile creation is idempotent. Validate in staging if possible."
