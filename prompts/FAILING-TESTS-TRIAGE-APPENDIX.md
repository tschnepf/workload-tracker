# Failing Frontend Tests (Out-of-Scope for SQL Remediation)

These failures were observed while running `npm --prefix frontend run test` during Phase 9 checks. They are unrelated to the SQL remediation changes and should be triaged separately.

1) src/components/projects/__tests__/statusBadge.visual.test.tsx
- Symptom: Expected "On_hold" but received "On Hold"; visual/formatting assertion mismatch.
- Likely UI: Status badge label casing/formatting.
- Suspected area: StatusBadge rendering/formatting logic.
- Repro: `npm --prefix frontend run test -- --filter statusBadge.visual`

2) src/components/projects/__tests__/accessibility.test.tsx
- Symptom: Dropdown Enter key selection expected 'completed' but received 'active'.
- Likely UI: Status dropdown selection state.
- Suspected area: StatusDropdown keyboard handling or default state.
- Repro: `npm --prefix frontend run test -- --filter accessibility`

3) src/components/projects/__tests__/performance.test.tsx
- Symptom: Expected initial render count 500; received 0.
- Likely UI: Performance harness / mock rendering volume.
- Suspected area: Test setup/mocks for list virtualization or React.memo regression harness.
- Repro: `npm --prefix frontend run test -- --filter performance`

4) src/pages/Personal/__tests__/personalDashboard.integration.test.tsx
- Symptom: React Router error: useNavigation must be used within a data router.
- Likely UI: PersonalDashboard routing context in tests.
- Suspected area: Test harness Router setup after react-router upgrades.
- Repro: `npm --prefix frontend run test -- --filter personalDashboard`

