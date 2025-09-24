# Personal Calendar Widget Plan (My Work)

Goal
- Add a “My Calendar” widget on the My Work page that mirrors the Deliverables Calendar page behavior, but scoped only to the logged-in person’s deliverables and pre‑deliverables.
- Keep the implementation lean, reuse existing helpers/components, and avoid duplication where practical.

Guiding Principles
- Reuse before reinventing: copy or extract shared utilities from the existing calendar page (`frontend/src/pages/Deliverables/Calendar.tsx`).
- Keep code small and readable; prefer single-purpose functions and narrow components.
- Preserve API shapes; prefer server-side filtering using existing endpoints and query flags (`mine_only=1`).
- Add tests close to the code you change; don’t overreach.

Risk Checklist (Mitigations baked into steps below)
- Deliverables filter gap: ensure `mine_only=1` filters BOTH deliverables and pre‑items; add `.distinct()` to avoid duplicates.
- Fallback path correctness: if the union endpoint fails, filter deliverables client‑side using deliverable‑assignment links for the current person.
- No‑person edge case: guard widget fetch/render when no linked Person.
- Auth readiness: use `useAuthenticatedEffect` so data loads only when a token is available.
- Timezone: keep date math consistent with the full calendar (UTC via `toISOString()`); document in README.
- Performance: default to 6–8 weeks and keep rendering compact; no heavy virtualization needed.

Prerequisites
- Person is linked to the authenticated user (existing behavior on My Work).
- Existing endpoints remain available:
  - `GET /api/deliverables/calendar_with_pre_items/?start&end[&mine_only=1]`
  - Fallbacks: `GET /api/deliverables/calendar?start&end` and `GET /api/deliverables/pre_deliverable_items/?mine_only=1&start&end`

Scope
- Minimal path: Implement widget and integrate into My Work using the unified endpoint, adding server-side filter where needed.
- Optional refactor: Extract shared calendar grid and utilities for reuse by both the page and the widget.

Non‑Goals
- Do not change existing calendar page user experience beyond extracting helpers (optional step).
- Do not introduce new dependencies.

---

Step 1 — Backend: Ensure `mine_only=1` filters deliverables in the union endpoint
- Objective: When the client requests `GET /api/deliverables/calendar_with_pre_items/?start=...&end=...&mine_only=1`, both deliverables and pre‑deliverables are restricted to items assigned to the logged-in person, without duplicates.
- Change:
  - File: `backend/deliverables/views.py`
  - In `calendar_with_pre_items`:
    - Resolve the current user’s `person_id` (reuse the existing code block used for pre‑items) and, when `mine_only` is truthy, filter the Deliverable queryset with `assignments__person_id=<person_id>` and `assignments__is_active=True`.
    - Apply `.distinct()` to the Deliverable queryset when `mine_only` is active to avoid duplicate rows from the join.
    - For `pre_qs`, keep the existing `mine_only` filter and apply `.distinct()` as well when `mine_only` is active.
- Tests:
  - New: `backend/deliverables/tests/test_calendar_union_mine_only.py` with cases for:
    - Include/exclude by person (two deliverables assigned to different people).
    - Duplicate prevention (two assignments on same deliverable still yields one item).
    - Missing linked person (mine_only=1 returns an empty result set).
- Acceptance:
  - Request succeeds; response includes only the authenticated user’s deliverables and pre‑items under `mine_only=1` and contains no duplicates.

Prompt to run for Step 1
"""
Update `backend/deliverables/views.py::DeliverableViewSet.calendar_with_pre_items` to filter Deliverable queryset by the current user’s person when `mine_only=1`, mirroring existing pre‑item filtering. Add a focused test file `backend/deliverables/tests/test_calendar_union_mine_only.py` covering include/exclude cases. Keep code lean and reuse existing user→person resolution logic already present in the view.
"""

---

Step 2 — Frontend: Implement `PersonalCalendarWidget`
- Objective: Create a compact calendar widget component showing only the logged-in person’s items.
- Files:
  - New: `frontend/src/components/personal/PersonalCalendarWidget.tsx`
- Implementation details:
  - Reuse logic from `frontend/src/pages/Deliverables/Calendar.tsx` for:
    - Week anchoring (`startOfWeekSunday`), date formatting, and week horizon.
    - Type classification and label building for items.
    - Rendering grid with month shading, today highlight, and optional pre‑item visibility toggle.
  - Data loading:
    - Prefer the unified endpoint: `GET /api/deliverables/calendar_with_pre_items/?start=YYYY-MM-DD&end=YYYY-MM-DD&mine_only=1` with Authorization header.
    - Fallback strategy (to preserve person‑scoping):
      1) Fetch deliverables via `deliverablesApi.calendar(start, end)`.
      2) Fetch deliverable‑assignment links for the current person via `deliverableAssignmentsApi.byPerson(personId)` and build the allowed deliverable ID set.
      3) Filter the deliverables list client‑side to only those IDs.
      4) Fetch pre‑items via `GET /api/deliverables/pre_deliverable_items/?mine_only=1&start&end&page_size=100` and merge.
  - Guards & auth readiness:
    - Use `useAuthenticatedEffect` to defer fetching until a token is present.
    - Short‑circuit (render an inline empty/guard state) if `!auth.person?.id`.
  - Props: `className?` to fit into dashboard grid; internal state for `anchor` and `weeksCount` (default 6 weeks for compact UI) and `showPre` toggle.
  - Accessibility: Preserve headings, landmarks, and focus management patterns used elsewhere in My Work.
  - Keep the widget lean: render inside a `Card`; do not bring `Layout` into the widget.
  - Date/TZ: reuse `fmtDate` and `startOfWeekSunday` from the page; note that `fmtDate` uses UTC (`toISOString()`), consistent with existing behavior.
- Acceptance:
  - Widget renders items for the current user only; supports Prev/Next/Today, horizon updates, and toggling pre‑items.

Prompt to run for Step 2
"""
Create `frontend/src/components/personal/PersonalCalendarWidget.tsx`. Copy the essential rendering and helper logic from `frontend/src/pages/Deliverables/Calendar.tsx`, but scope all data requests to `mine_only=1`. Keep the component lean (internal state for `anchor`, `weeksCount`, `showPre`), expose a `className` prop, and render within a `Card` styled like other dashboard tiles. Prefer existing helpers (`resolveApiBase`, `getAccessToken`) and avoid new dependencies.
"""

---

Step 3 — Frontend: Integrate the widget into My Work
- Objective: Place the new widget into the My Work layout.
- File: `frontend/src/pages/Personal/PersonalDashboard.tsx`
- Changes:
  - Import `PersonalCalendarWidget` and render it in the compact widgets grid.
  - Only render when the user has a linked `person`.
  - Adjust grid columns as needed to keep a balanced layout (e.g., restore `xl:grid-cols-4` if adding a fourth tile).
- Acceptance:
  - The widget appears alongside other cards and scales with the grid.
  - Optional: keep `xl:grid-cols-3` and span the calendar (`md:col-span-2`) for layout balance, or switch to `xl:grid-cols-4` when adding a fourth tile.

Prompt to run for Step 3
"""
Update `frontend/src/pages/Personal/PersonalDashboard.tsx` to import and render `PersonalCalendarWidget` inside the cards grid (e.g., below Pre‑Deliverables/Deliverables/Projects). Render only if `auth.person?.id` is present. Keep layout balanced (update grid column counts if necessary).
"""

---

Step 4 (Optional) — Refactor to shared calendar grid
- Objective: Remove duplication by extracting a reusable calendar grid and small helpers.
- Files:
  - New: `frontend/src/components/deliverables/CalendarGrid.tsx` (stateless, presentational)
  - New: `frontend/src/components/deliverables/calendar.utils.ts` (date helpers, classification, label builders)
  - Update both `Calendar.tsx` and `PersonalCalendarWidget.tsx` to use the shared grid and utils.
- Acceptance:
  - Both pages render identically; logic is centralized.

Guardrails for Step 4
- `CalendarGrid` must be presentational (no routing, no auth), receive all data via props.
- `calendar.utils` must not import React/DOM; export pure helpers only.
- Use existing alias `@/` for imports to avoid brittle relative paths.

Prompt to run for Step 4
"""
Extract `CalendarGrid` and `calendar.utils` from `frontend/src/pages/Deliverables/Calendar.tsx` into `frontend/src/components/deliverables/`. Update both the page and `PersonalCalendarWidget` to use these shared utilities. Keep components pure and props small. Avoid changing rendered output.
"""

---

Step 5 — Tests
- Backend tests (from Step 1) should pass.
- Frontend tests:
  - New unit/integration test for `PersonalCalendarWidget` verifying:
    - Unified path includes `mine_only=1` and renders filtered results.
    - Fallback path filters deliverables client‑side using assignment links.
    - Navigation and pre‑item toggle behavior.
  - File: `frontend/src/components/personal/__tests__/personalCalendarWidget.test.tsx`.
- E2E (optional): Verify My Work shows only the current user’s items.
 - Test harness note: prefer mocking `apiClient` over raw `fetch` for consistency with current code patterns.

Prompt to run for Step 5
"""
Add `frontend/src/components/personal/__tests__/personalCalendarWidget.test.tsx` with tests for data loading (ensuring `mine_only=1` is used), basic rendering, and toggling pre‑items. Prefer mocking fetch and keeping tests small and deterministic.
"""

---

Step 6 — Types and OpenAPI
- If only filtering changed, no schema updates are required. If any schema changes were made, regenerate types.
- Command (from `frontend/`): `npm run openapi:types`

Prompt to run for Step 6
"""
If any API schema changed, regenerate types via `npm run openapi:types`. Otherwise, confirm no type drift in `src/api/schema.ts`.
"""

---

Step 7 — Accessibility, Performance, and Polish
- Ensure keyboard focus, headings, and color contrast remain adequate in the widget.
- Keep default weeks to 6–8 to control DOM size; rely on existing logic (no virtualization needed for personal scope).
- Optional: debounce rapid Prev/Next clicks to reduce overlapping requests.
- Use a simple shimmer/skeleton over a heavy spinner to keep perceived performance.
 - Display a compact, inline error state within the card if loading fails; avoid throwing to global boundaries.
- Confirm today highlight and month shading behave like the full calendar page.

Prompt to run for Step 7
"""
Review `PersonalCalendarWidget` for a11y and performance. Verify headings, focus order, contrast, and today/month visuals. Keep the component lean and avoid additional dependencies.
"""

---

Step 8 — Documentation
- Update `README.md` (My Work section) to mention the new My Calendar widget and how it scopes items to the logged-in person.

Prompt to run for Step 8
"""
Append a short note to `README.md` in the My Work section describing the My Calendar widget: scope (deliverables assigned via Deliverable Assignments and pre‑deliverables), controls (Prev/Next/Today, Show Pre‑Deliverables), default horizon (6 weeks), and that dates are computed in UTC for consistency with the full calendar.
"""

---

Notes on Style
- Follow the project’s serializer/naming discipline (camelCase at API boundaries; snake_case in models).
- Prefer small helpers; colocate utilities when scope is narrow, elevate to shared only when used by 2+ components.
- Keep props and component state minimal; avoid premature abstractions.
- Write tests that are focused and fast; don’t over-mock.
