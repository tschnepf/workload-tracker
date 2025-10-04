# Known Issues Log

Purpose: Track non-blocking issues discovered during the upgrade effort so they aren’t forgotten. Use this as a living checklist; add new items as they’re found and check them off when fixed.

How to use
- Add a new entry using the template below. Keep one line per actionable item when possible.
- Use checkboxes to track status. Link to commits/PRs that resolve items.
- Group related items under a short header (e.g., “ESLint: hooks” or “E2E: Playwright”).

Template
- [ ] [KI-XXXX] Short title — file:line — summary
  - Details: …
  - Discovered: YYYY-MM-DD by <who/phase>
  - Suggested fix: …
  - Links: (optional)

---

## Open Items

### ESLint: React hooks rule-of-hooks (errors)
- [ ] [KI-0001] Conditional hook call — `frontend/src/components/charts/CapacityTimeline.tsx:88` — React Hook `useRef` called conditionally
  - Details: Hooks must be called unconditionally in the same order
  - Discovered: 2025-09-15 (Phase 2, Step 5 lint)
  - Suggested fix: Refactor to move hooks to top-level; gate logic after hook calls

- [ ] [KI-0002] Conditional hook call — `frontend/src/components/charts/CapacityTimeline.tsx:89` — React Hook `useState` called conditionally
  - Details: Same as KI-0001
  - Discovered: 2025-09-15 (Phase 2, Step 5 lint)
  - Suggested fix: Same as KI-0001

- [ ] [KI-0003] Conditional hook call — `frontend/src/pages/Projects/ProjectsList.tsx:1731` — `useVirtualizer` called conditionally
  - Details: Hook likely used after early return/conditional path
  - Discovered: 2025-09-15 (Phase 2, Step 5 lint)
  - Suggested fix: Ensure `useVirtualizer` is always called; restructure returns/conditions

- [ ] [KI-0004] Unused eslint-disable — `frontend/src/pages/Dashboard.tsx:42` — Unused `eslint-disable` for `react-hooks/exhaustive-deps`
  - Details: Disable directive present with no matching rule report
  - Discovered: 2025-09-15 (Phase 2, Step 5 lint)
  - Suggested fix: Remove the directive or re-enable the rule contextually

### ESLint: Exhaustive deps and related warnings
- [ ] [KI-0100] Missing dep — `frontend/src/components/deliverables/DeliverablesSection.tsx:33` — add `loadDeliverables`
- [ ] [KI-0101] Missing dep — `frontend/src/components/departments/DepartmentHierarchy.tsx:35` — add `buildHierarchyTree`
- [ ] [KI-0102] Missing deps — `frontend/src/components/mockup/AssignmentGridMockup.tsx:544` — add `getAllEditableCells`, `selectedCell`
- [ ] [KI-0103] Missing dep — `frontend/src/components/mockup/AssignmentGridMockup.tsx:574` — add `handleKeyDown`
- [ ] [KI-0104] Missing deps — `frontend/src/components/projects/useProjectStatus.ts:189` — add `debug`, `enableCacheBusting`, `getCurrentStatus`, `retryWithBackoff`
- [ ] [KI-0105] Missing dep — `frontend/src/components/skills/SkillsAutocomplete.tsx:61` — add `searchSkills`
- [ ] [KI-0106] Memo deps logic — `frontend/src/hooks/usePeople.ts:29` — move `pages` calc inside useMemo or memoize
- [ ] [KI-0107] Effect deps — `frontend/src/pages/Assignments/AssignmentForm.tsx:243` — add `loadPeople`
- [ ] [KI-0108] Effect deps — `frontend/src/pages/Assignments/AssignmentForm.tsx:267` — add `projectSkills`; extract complex dep expression
- [ ] [KI-0109] Effect deps — `frontend/src/pages/Assignments/AssignmentForm.tsx:285` — add `projectSkills`; extract complex dep expression
- [ ] [KI-0110] Effect deps — `frontend/src/pages/Assignments/AssignmentForm.tsx:300` — add `sortPeopleByDepartmentAndSkills`
- [ ] [KI-0111] Effect deps — `frontend/src/pages/Assignments/AssignmentForm.tsx:312` — add `personSearchText`
- [ ] [KI-0112] Effect deps — `frontend/src/pages/Assignments/AssignmentForm.tsx:517` — add `performPersonSearch`
- [ ] [KI-0113] Effect cleanup ref — `frontend/src/pages/Assignments/AssignmentGrid.tsx:391` — copy `headerRef.current` inside effect
- [ ] [KI-0114] Effect deps — `frontend/src/pages/Assignments/AssignmentGrid.tsx:847` — add `isAddingAssignment`
- [ ] [KI-0115] Effect deps — `frontend/src/pages/Dashboard.tsx:36` — add `loadDashboard`
- [ ] [KI-0116] Effect deps — `frontend/src/pages/Departments/DepartmentsList.tsx:49` — add `selectedDepartment`
- [ ] [KI-0117] Effect deps — `frontend/src/pages/Departments/ManagerDashboard.tsx:24` — add `loadDepartments`
- [ ] [KI-0118] Effect deps — `frontend/src/pages/Departments/ManagerDashboard.tsx:31` — add `loadDepartmentData`, `loadDepartmentPeople`
- [ ] [KI-0119] Effect deps — `frontend/src/pages/Departments/ReportsView.tsx:44` — add `loadData`
- [ ] [KI-0120] Effect deps — `frontend/src/pages/People/PeopleList.tsx:112` — add `loadPeople`
- [ ] [KI-0121] Memo deps — `frontend/src/pages/People/PeopleListTable.tsx:123` — include `rowVirtualizer`
- [ ] [KI-0122] Effect deps — `frontend/src/pages/Projects/ProjectForm.tsx:40` — add `loadProject`
- [ ] [KI-0123] Effect deps — `frontend/src/pages/Projects/ProjectsList.tsx:414` — add `loadProjectAssignments`
- [ ] [KI-0124] useCallback deps — `frontend/src/pages/Projects/ProjectsList.tsx:455` — wrap `loadProjectAssignments` in useCallback
- [ ] [KI-0125] useCallback unnecessary dep — `frontend/src/pages/Projects/ProjectsList.tsx:628` — remove `candidatesOnly` from deps
- [ ] [KI-0126] Effect deps — `frontend/src/pages/Projects/ProjectsList.tsx:641` — add `people.length`, `performPersonSearch`, `personSearchResults.length`
- [ ] [KI-0127] useCallback deps — `frontend/src/pages/Projects/ProjectsList.tsx:819` — wrap `getCurrentWeekHours` in useCallback
- [ ] [KI-0128] Effect deps — `frontend/src/pages/Settings/Settings.tsx:71` — add `auth.user?.is_staff`

All above discovered: 2025-09-15 (Phase 2, Step 5 lint). Suggested fix for most warnings: include stable dependencies (functions via `useCallback`, memoized values via `useMemo`) or intentionally suppress with inline comments when behavior is verified.

### Other items seen during upgrades (non-blocking)
- [ ] [KI-0204] Encoding artifacts block small patches in heatmap/strip components
  - Details: Non-ASCII replacement characters in `TeamHeatmapCard.tsx` and `MyScheduleStrip.tsx` prevent precise text-hunk patches (e.g., titles with odd quotes/dashes). Color logic migration is partially applied elsewhere; these two should be migrated after running the existing `scan_fffd.js`/`fix_all_fffd.js` cleanup.
  - Discovered: 2025-10-04 (Phase 4 follow-up)
  - Suggested fix: Run the encoding cleanup scripts, then apply the util migration to replace percent thresholds with the shared `getUtilizationPill` and update title strings to use a normal en dash (–).
- [ ] [KI-0203] Deliverables calendar union tests failing
  - Details: Deliverables calendar union test failures look like logic/fixture issues and will still need investigation even after the profile toggle.
  - Discovered: 2025-10-04 (Phase 0/Tests rerun)
  - Suggested fix: Review test fixtures and union logic for duplicates and inclusion of project-assignment linked deliverables; add targeted unit coverage around the union query.
- [ ] [KI-0200] Frontend unit tests — Several Vitest tests failing post React 19 (text expectations and `act(...)` warnings)
  - Details: Tests expect legacy formatting (e.g., `On_hold` vs `On Hold`) and have overlapping/implicit act usage
  - Discovered: 2025-09-15 (Phase 2, Step 4 tests)
  - Suggested fix: Update assertions to match UI, wrap state updates in `act`, and avoid overlapping act calls

- [ ] [KI-0201] E2E Playwright — Browsers not installed inside frontend container
  - Details: `npx playwright install` needed; CI does this, dev container does not
  - Discovered: 2025-09-15 (Phase 2, Step 4 e2e)
  - Suggested fix: Install browsers ad-hoc when running e2e locally or document a make target

- [ ] [KI-0202] Backend tests — Some API tests failing with 401 and one import error in monitoring.tests
  - Details: Likely fixture/auth setup assumptions; not caused by package bumps
  - Discovered: 2025-09-15 (Phase 1 tests)
  - Suggested fix: Review test auth setup and update fixtures; fix module import

### Frontend architecture follow-ups
- [ ] [KI-0400] Root layout component split — separate layout from `App`
  - Details: After Router v7 migration, `App` acts as providers + outlet wrapper. Consider extracting a dedicated `RootLayout` to clarify responsibilities.
  - Discovered: 2025-09-15 (Phase 4, Step 8)
  - Suggested fix: Introduce `src/layouts/RootLayout.tsx` wrapping Suspense/ErrorBoundary and providers; keep `App` focused or remove it.

### Test execution reminders
- [ ] [KI-0401] Run full unit/E2E suite post-router migration
  - Details: Execute unit tests to catch path/import regressions. For E2E inside the frontend container, install browsers with `npx playwright install` first.
  - Discovered: 2025-09-15 (Phase 4, Step 8)
  - Suggested fix: Add a Makefile target to install browsers and run E2E; document in README.

### Backend ecosystem compatibility
- [ ] [KI-0300] Python redis client cannot be upgraded to 6.x with Celery 5.5.x/kombu 5.5.x
  - Details: pip resolver conflict when pinning `redis==6.4.0` with `celery[redis]==5.5.3` (kombu[redis] constraints). Kept `redis==5.0.1` to proceed.
  - Discovered: 2025-09-15 (Phase 3, Step 7 build)
  - Suggested fix: Revisit when Celery/kombu support redis 6.x; consider bumping Celery to a version that relaxes redis upper bound.

---

Last updated: 2025-09-15
