# Frontend Tests Remediation Plan — Amendments (Overrides)

This addendum updates and supersedes parts of `prompts/FRONTEND-TESTS-REMEDIATION-PLAN.md` to align with the current codebase and avoid breakage.

## Key Overrides
- Use the existing `formatStatus` in `frontend/src/components/projects/status.utils.ts` as the single source of truth. Do not add new mapping/helpers.
- Fix tests to match the real contract (explicit expected labels), rather than duplicating formatting logic.
- Keep test harness minimal. Do not introduce a global `TestProviders` wrapper unless a test explicitly needs it.
- Prefer Vitest file-path runs or `-t` name filters over `--filter`.
- Calibrate performance tests for CI stability; prefer relative assertions and/or smaller datasets.
- Unknown status contract: non-empty unknown strings are Title Cased (e.g., `not_a_status` → `Not A Status`); only null/undefined → `Unknown`.

## Section-by-Section Changes

### Phase 0 — Pre-Flight
- Replace test commands with file-path runs:
  - `npm --prefix frontend run test:run -- src/components/projects/__tests__/statusBadge.visual.test.tsx`
  - `npm --prefix frontend run test:run -- src/components/projects/__tests__/accessibility.test.tsx`
  - `npm --prefix frontend run test:run -- src/components/projects/__tests__/performance.test.tsx`
  - `npm --prefix frontend run test:run -- src/pages/Personal/__tests__/personalDashboard.integration.test.tsx`
  Optionally use: `npm --prefix frontend run test:run -- -t "<test name pattern>"`.

- TestProviders harness: mark as optional. Only add providers when a test requires them. Do not refactor existing tests that already pass with `MemoryRouter`.

### Phase 1 — StatusBadge Label Formatting
- Do not add a new LABELS map. Keep `formatStatus` as the single source of truth.
- Update `statusBadge.visual.test.tsx` to assert explicit labels:
  - `active` → `Active`
  - `active_ca` → `Active CA`
  - `planning` → `Planning`
  - `on_hold` → `On Hold`
  - `completed` → `Completed`
  - `cancelled` → `Cancelled`
- Unknown contract: add a test case asserting `formatStatus('not_a_status')` produces `Not A Status`. Null/undefined → `Unknown`.

### Phase 2 — StatusDropdown A11y
- Current implementation already supports Enter/Space on focused option and correct ARIA roles. Verify behavior; no code changes expected.

### Phase 4 — PersonalDashboard Integration
- Keep tests on `MemoryRouter`. Do not migrate to data router/`RouterProvider` unless a blocking test need emerges.

### Phase 6 — Tests & Static Checks
- Focused runs: use `test:run` with file paths (see Phase 0). Avoid `--filter`.
- Full suite: `npm --prefix frontend run test:run`.
- Build/typecheck: `npm --prefix frontend run build` (includes `tsc --noEmit`).
- Optional: add `"typecheck": "tsc --noEmit"` if desired for CI.

### Performance Tests
- Favor relative checks (memoized vs non-memoized) and/or relaxed thresholds compatible with CI variance.
- Consider reducing dataset sizes or guarding heavy tests behind `RUN_HEAVY=1`.

## Notes
- Encoding artifacts in the base plan (e.g., `�?``) are cosmetic; follow the corrections above where there’s any ambiguity.

