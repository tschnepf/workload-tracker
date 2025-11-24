# Dashboard Mobile UI Verification

**Date:** 2025-11-23  
**Scope:** Phase 4 responsive testing for the Dashboard (prompts/MobileUI.md)

## Test Setup
- Added `frontend/tests/e2e/dashboard-responsive.spec.ts` with Playwright scenarios covering 360px, 414px, 768px, and 1024px viewports.
- Each scenario mocks `dashboardApi`, `projectsApi`, and `peopleApi` (plus dependent endpoints) to provide deterministic data and to avoid backend dependencies.
- Feature flag `MOBILE_UI_DASHBOARD` and refresh-token hydration are seeded via `page.addInitScript` so the UI boots directly into the new mobile layout.

## Assertions
1. **Horizontal Layout Safety** – Verified `scrollWidth <= clientWidth` for every viewport.
2. **Header + Toolbar** – Confirmed the sticky overview/filters region renders at all breakpoints.
3. **Analytics Presentation** – Checked the mobile carousels (360/414/768) are visible, and the desktop grid (1024) hides the mobile carousel.
4. **Heatmap Drawer** – On mobile widths, ensured tapping “View details” opens the new availability modal (drawer experience).
5. **Desktop Availability Table** – At 1024px validated that the column headers (“Name / Current Week / Next Week”) remain visible to guarantee non-mobile parity.

## Results
- All four viewport runs passed locally via `npx playwright test frontend/tests/e2e/dashboard-responsive.spec.ts`.
- No horizontal scrolling detected; modals and carousels rendered as expected.
- The mocked APIs exercised the same code paths as production (dashboard summary, capacity heatmap, project counts), proving the UI does not rely on shortcut data when switching layouts.

## Follow-up
- Keep these tests in CI once backend mocks are accepted.
- When additional dashboard widgets gain lazy loading, extend the spec to assert their intersection observers (DeferredWidget) don’t fire prematurely on smaller screens.

