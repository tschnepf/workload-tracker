# Personal Dashboard Implementation Plan

A phased, prescriptive plan to implement a first‑class Personal Dashboard ("My Work") that shows each signed‑in user their assignments, upcoming deliverables and pre‑deliverables, near‑term schedule, and actionable alerts. The plan emphasizes lean programming best practices: minimal surface area, clear ownership, strong typing, centralized mapping, and zero shortcuts/band‑aids. Backend and frontend changes must stay tightly coordinated to avoid naming or contract drift.

Goals
- Provide an at‑a‑glance “My Work” view with: My Summary, My Projects, My Deliverables, My Pre‑Deliverables, and My Schedule.
- Keep navigation instant and predictable; render fast, then hydrate details progressively.
- Avoid duplication: leverage existing endpoints and types where sound; add a single aggregated endpoint for performance and robustness.
- Maintain standards: snake_case→camelCase via serializers, OpenAPI→TS types, ETag/conditional GET, short‑TTL caches for heavy aggregates.

Success Criteria
- Personal Dashboard loads with visible content skeletons < 200ms; first meaningful content < 1s on warm backend.
- No snake/camel mismatches; OpenAPI and generated TS types remain source‑of‑truth.
- UX is accessible, keyboard‑navigable, and screen‑reader friendly.
- Tests cover core flows (backend aggregations, client composition, widgets, a11y basics) and pass consistently.

---

## Phase 0 — Foundations & Flags

Purpose: Establish feature flag, routing guardrails, typing pipeline, and measurement.

Agent Implementation Prompt
```
Task: Establish Personal Dashboard foundations without shipping UI.

Lean constraints:
- Do not introduce duplicate utilities or ad-hoc field mapping.
- Use existing flags/config patterns; no dead code or feature drift.
- No shortcuts; keep scope minimal and reversible.

Steps:
1) Backend feature flag
   - File: backend/config/settings.py (or settings module that holds FEATURES)
   - Important: this repo defines FEATURES in two places; either consolidate to a single FEATURES dict or add the flag in both blocks to avoid overwrite.
   - Add `FEATURES['PERSONAL_DASHBOARD'] = os.getenv('PERSONAL_DASHBOARD', 'true').lower() == 'true'` (default True in dev).
   - Ensure flag is logged once at startup (DEBUG-safe) alongside existing flags via the JSON logger.

2) OpenAPI discipline
   - Confirm `drf-spectacular` is configured.
   - Plan to regenerate schema after adding the personal endpoint (Phase 3).

3) Frontend feature gate
   - File: frontend/src/lib/flags.ts
   - Add `PERSONAL_DASHBOARD` to `FlagName` and `ENV_KEYS` (env key: `VITE_PERSONAL_DASHBOARD`).
   - Gate both the sidebar item and the route by this flag. When disabled, `/my-work` should redirect to `/dashboard` to avoid 404s.
   - Resolve via `getFlag('PERSONAL_DASHBOARD', true)`. Optionally read `/api/capabilities/` and expose `personalDashboard: true` later (see Phase 10); do NOT add a new `/api/config/features` route.

4) Monitoring hooks
   - File: frontend/src/utils/monitoring.tsx
   - Ensure `trackPerformanceEvent` exists; add `trackPerformanceEvent('personal_dashboard_mount_ms', value)` on mount (dev console + Sentry breadcrumb).

5) Shared utilities (ownership boundaries)
   - Do NOT fork or duplicate existing utilities. Personal module reuses:
     - Backend: `core.week_utils`, `core.etag` mixins, existing assignment/hour helpers, deliverables services, and caching patterns.
     - Frontend: shared Layout, theme tokens, CompactHeatStrip, UpcomingPreDeliverablesWidget, apiClient/openapi types.
   - If personal needs logic similar to team dashboard and it will be reused, extract that logic into `backend/core/aggregates.py` (or `core/services/aggregates.py`) and call it from both places; otherwise keep personal aggregation local to reduce regression risk.

Acceptance criteria:
- Flag present (backend + frontend) and accessible from UI code.
- No UI changes yet; build/test unaffected.
```

---

## Phase 1 — Routing & Page Shell

Purpose: Add a dedicated route and page shell with skeletons, behind the flag.

Agent Implementation Prompt
```
Task: Add Personal Dashboard route and empty page shell with skeletons.

Lean constraints:
- Follow existing router patterns (createBrowserRouter + lazy routes).
- No inlined business logic; no duplication of layout.

Files to add:
1) frontend/src/pages/Personal/PersonalDashboard.tsx
   - Export default component that renders Layout, a page header ("My Work"), and section placeholders: My Summary, My Projects, My Deliverables, My Pre-Deliverables, My Schedule.
   - Render lightweight skeletons for each section while data not loaded.

Files to edit:
2) frontend/src/main.tsx
   - Add lazy route: `const PersonalDashboard = React.lazy(() => import('./pages/Personal/PersonalDashboard'))`.
   - Route: `{ path: 'my-work', element: getFlag('PERSONAL_DASHBOARD', true) ? <RequireAuth><PersonalDashboard /></RequireAuth> : <RequireAuth><Navigate to="/dashboard" replace /></RequireAuth> }`.

3) frontend/src/components/layout/Sidebar.tsx
   - Under primary menu, add: { path: '/my-work', icon: 'dashboard', label: 'My Work', description: 'Your assignments & milestones' }.
   - Gate visibility by `PERSONAL_DASHBOARD` flag (and later capabilities; see Phase 10).

4) Prefetchers
   - File: frontend/src/routes/prefetch.ts
     - Add importer for `/my-work` to warm the chunk on hover (respect existing connection heuristics and delay).
   - File: frontend/src/routes/prefetchData.ts
     - Optionally prefetch lightweight data for `/my-work` (e.g., a small horizon assignments/pre-items summary) behind the same prefetch flag.

Acceptance criteria:
- Navigating to `/my-work` renders the skeleton page under Layout.
- Sidebar shows "My Work" when flag is on; keyboard navigation works.
- No API calls yet.
```

---

## Phase 2 — Client Data Composition (Existing APIs)

Purpose: Wire the page from current endpoints to deliver value quickly and validate UX, without changing server data shapes.

Agent Implementation Prompt
```
Task: Compose Personal Dashboard data using existing endpoints to render first useful UI.

Lean constraints:
- Reuse typed client (apiClient) and services in frontend/src/services/api.ts.
- No ad-hoc fetch utilities; no duplicate DTOs.
- Keep computation light; memoize derived data; render then hydrate.

Files to edit:
1) frontend/src/services/api.ts
   - Add small helpers under a new `personalApi` namespace (client-only composition, no new endpoints):
     - `getMyAssignments(personId: number)` -> proxy to `assignmentsApi.byPerson(personId)`.
     - `getMyPreItems(days=14)` -> proxy to `apiClient.GET('/deliverables/pre_deliverable_items/')` with `mine_only=1` and `start=today`, `end=today+days` (typed via OpenAPI client).
     - `getMyDeliverablesForMyProjects(personId: number)` ->
       1) load `assignmentsApi.byPerson(personId)`;
       2) derive unique projectIds from assignments;
       3) call `/api/deliverables/bulk/?project_ids=…` and flatten to deliverables;
       4) compute per-project nearest upcoming deliverable (min future date).

2) frontend/src/pages/Personal/PersonalDashboard.tsx
   - Use `useAuth()` to obtain `auth.person?.id` (required); show empty-state if not linked.
   - Parallel load:
     - myAssignments (byPerson)
     - myPreItems (`/deliverables/pre_deliverable_items/?mine_only=1&start=YYYY-MM-DD&end=YYYY-MM-DD`, default 14 days)
     - myDeliverables (use deliverables/bulk path derived from my assignment projectIds; DO NOT rely on `mine_only` for deliverables).
   - Derivations:
     - Current-week hours & 4-week average from myAssignments.weekly_hours (use Sunday keys via utils/weeks).
     - Nearest deliverable per project (min upcoming date) from myDeliverables list.
     - Group pre-items: overdue, due-today, due-soon.
     - Data shape adapter for pre-items: prefer `typeName` for labels; map `typeName` -> `preDeliverableType` only if a component requires that prop.
   - Render Sections (minimal first):
     - My Summary (utilization %, available hours, next due counts)
     - My Pre-Deliverables (reuse component in Phase 4; pass mapped pre-item fields or update component to accept `typeName`)
     - My Deliverables (list next 5)
     - My Projects (list top 5 active with next milestone)
     - My Schedule (heat strip from weekly_hours 8–12w)

3) frontend/src/components/skeletons
   - Add `PersonalDashboardSkeleton.tsx` if needed, or reuse existing simple placeholders.

Acceptance criteria:
- `/my-work` shows live data for a user linked to a Person.
- No server changes required; payloads small; UI stays responsive.
- Sunday-only week keys used for derivations.
 - If `auth.person` is null, render an explanatory empty state and avoid calling personal endpoints.
```

---

## Phase 3 — Backend Aggregated Endpoint (Performance & Consistency)

Purpose: Provide a single, standards-compliant, cached endpoint returning the Personal Dashboard snapshot to reduce client work and ensure consistency.

Agent Implementation Prompt
```
Task: Add `/api/personal/work/` endpoint that aggregates personal user-specific work data.

Lean constraints:
- Serializer-driven camelCase mapping; no hand-built dicts in views beyond small aggregates.
- ETag + Last-Modified; short-TTL cache opt-in via FEATURES.
- No band-aids: strong typing, minimal queries, `select_related/prefetch_related`.

Files to edit/add:
0) App scaffolding (new module)
   - Create a new Django app module `backend/personal/` with files:
     - `__init__.py`, `apps.py` (AppConfig name 'personal'), `urls.py`, `views.py`, `serializers.py`, `tests.py`.
   - Register `'personal'` in `INSTALLED_APPS` in `backend/config/settings.py`.
   - In `backend/config/urls.py`, include `path('api/personal/', include('personal.urls'))`.

1) backend/personal/serializers.py
   - Add `PersonalWorkSerializer` with fields:
     summary: { personId, currentWeekKey, utilizationPercent, allocatedHours, availableHours }
     alerts: { overallocatedNextWeek: bool, underutilizedNext4Weeks: bool, overduePreItems: int }
     projects: Array<{ id, name, client, nextDeliverableDate|null }>
     deliverables: Array<{ id, project, projectName, title, date, isCompleted }>
     preItems: reuse `PreDeliverableItemSerializer` (already camelCase via model serializer)
     schedule: { weekKeys: string[], weekTotals: { [weekKey]: number }, weeklyCapacity: number }

2) backend/personal/views.py
   - Add `class PersonalWorkView(APIView)` (IsAuthenticated).
   - Fetch linked Person via accounts.UserProfile; if absent, return 404 with friendly message.
   - Compute:
     - Current and 8–12 week Sunday keys (use `core.week_utils.sunday_of_week`).
     - Sum weekly_hours across assignments in a single pass (prefetch person.assignments). Reuse shared aggregation helpers if available; otherwise extract into `core` so both team and personal endpoints share them (no duplication).
     - Next deliverables for that person: either via assignments->project->deliverables filtered by date or reuse deliverables join to assignments. Reuse any existing deliverables aggregation helpers or extract them into `core`.
     - Pre-items via `PreDeliverableService.get_upcoming_for_user` (existing).
    - Permissions for pre-item completion: in `deliverables.PreDeliverableItemViewSet`, set `permission_classes = [permissions.IsAuthenticated]` and enforce in `complete` and `bulk_complete` that only staff/managers OR the authenticated user linked to a Person assigned to the parent deliverable may complete items; otherwise return 403. Keep list filters gated by `mine_only` for personal views.
    - Caching and ETag (aggregate endpoint):
      - Short TTL cache key: `personal_dash_v1:{person_id}` (controlled by FEATURES['SHORT_TTL_AGGREGATES']).
      - Compute ETag manually (do not use `ETagConditionalMixin`) as MD5 of a stable string including max(updated_at) across the person’s assignments, their projects’ deliverables, the user’s pre-items, and record counts; return 304 when `If-None-Match` matches.

3) backend/personal/urls.py
   - Add `from .views import PersonalWorkView` and define `urlpatterns = [ path('work/', PersonalWorkView.as_view(), name='personal-work') ]`.

4) backend/openapi.json (generated)
   - Regenerate with `spectacular`; commit the updated `backend/openapi.json` (repo tracks backend/openapi.json).

5) frontend/src/api/schema.src.json and frontend/src/api/schema.ts (generated)
   - Refresh source JSON from `backend/openapi.json`, then regenerate TS types via openapi-typescript; commit both updated artifacts.
   - Ensure the new operationId is distinct (e.g., `personal_work_retrieve`) to avoid clashing with the existing team dashboard.

Acceptance criteria:
- GET `/api/personal/work/` returns a compact JSON matching serializer.
 - No duplicated aggregation code; shared functions live in `core` and are invoked by both team dashboard and personal endpoints as appropriate.
- Response includes `ETag` and optional `Last-Modified`; 304 served when unchanged.
- Query count is minimal; no N+1; passes unit tests.
```

---

## Phase 4 — UI Sections & Components (Finalize)

Purpose: Replace placeholders with focused, testable components using the aggregated endpoint when available (fallback to client composition from Phase 2).

Agent Implementation Prompt
```
Task: Implement Personal Dashboard sections with lean, accessible components.

Lean constraints:
- Keep components small, memoized, and typed.
- No inline business logic; put derivations into tiny pure helpers.
 - Reuse existing shared UI (Layout, tokens, CompactHeatStrip, widget components). Do NOT create personal‑only copies; extract small generic helpers if needed to shared folders.

Files to add:
1) frontend/src/components/personal/MySummaryCard.tsx
   - Props: { summary, alerts }
   - Show utilization, allocated vs capacity, and key alerts with clear semantics.

2) frontend/src/components/personal/MyProjectsCard.tsx
   - Props: { projects }
   - List top N projects with next deliverable; link to project detail; aria labels.

3) frontend/src/components/personal/MyDeliverablesCard.tsx
   - Props: { deliverables }
   - Show next N deliverables with date/status; emphasize soon/overdue styles.

4) frontend/src/components/personal/MyScheduleStrip.tsx
   - Props: { weekKeys, weeklyCapacity, weekTotals }
   - Reuse/compose `CompactHeatStrip` behavior; label cells; respect reduced motion.

Files to edit:
5) frontend/src/components/dashboard/UpcomingPreDeliverablesWidget.tsx
   - Reuse within PersonalDashboard; prefer `typeName` from the serializer for labels. If not updating the component, adapt data upstream by mapping `typeName` -> `preDeliverableType` so titles render correctly.

6) frontend/src/pages/Personal/PersonalDashboard.tsx
   - If `personalApi.getWork()` exists (Phase 3), use it; else fallback to composed data.
   - Order: Summary (top), Pre-Items, Deliverables, Projects, Schedule.

Acceptance criteria:
- All sections render with real data; no layout jank on first paint.
- Keyboard, focus order, and aria labels verified.
 - No duplicated UI components; shared components are reused or gently extended via props.
```

---

## Phase 5 — Preferences & Quick Actions

Purpose: Personalize experience and add actionable shortcuts without introducing persistence complexity.

Agent Implementation Prompt
```
Task: Add user-local preferences and quick actions.

Lean constraints:
- Store preferences locally first (localStorage via existing settings pattern). No new backend tables.
- Keep actions idempotent; guard by capability checks.

Files to edit/add:
1) frontend/src/pages/Personal/PersonalDashboard.tsx
   - Read/write preferences; default horizonWeeks=8.
   - Persist preferences in `localStorage` under a dedicated namespace (e.g., `personalDashboard.horizonWeeks`, `personalDashboard.sectionOrder`) to avoid coupling changes in the auth store.
   - Quick actions row: "Open Assignments (me)", "Open Calendar (mine)", "Complete due-today pre-items".
   - For bulk complete, call `POST /api/deliverables/pre_deliverable_items/bulk_complete/` with due-today ids (best-effort; show toast results). Gate the “complete” action in UI by capability/role to align with server permissions if overrides are not yet in place.

Acceptance criteria:
- Preferences persist across reloads; no server dependency.
- Quick actions operate and report success/failure.
```

---

## Phase 6 — Accessibility, UX Polish, and Navigation Feedback

Agent Implementation Prompt
```
Task: Validate and polish UX and accessibility for Personal Dashboard.

Lean constraints:
- Respect prefers-reduced-motion; no flashing/animated distractions.
- Announce loading and content updates via aria-live where appropriate.

Steps:
1) Ensure skeletons use sufficient contrast; add `aria-busy` while loading.
2) Verify focus management on navigation (focus main heading on mount), and ensure API calls are gated until auth hydration completes to avoid transient 401s.
3) Add top progress bar (if NAV_PROGRESS flag is on) to cover this route as well.
4) Ensure PersonalDashboard is rendered under the existing ErrorBoundary so unexpected errors surface gracefully without breaking navigation.

Acceptance criteria:
- Axe/Lighthouse a11y checks pass; no new violations.
- Progress indicator visible within ~150ms with throttled CPU.
```

---

## Phase 7 — Backend Testing (Unit & Contract)

Agent Implementation Prompt
```
Task: Add backend tests for Personal Dashboard endpoint and related queries.

Lean constraints:
- No heavy fixtures; seed minimal data in tests.
- Assert query counts for hot paths when feasible.

Files to add/edit:
1) backend/personal/tests.py
   - Test: unauthenticated -> 401.
   - Test: user without linked Person -> 404.
   - Test: happy path returns summary, projects, deliverables, preItems, schedule with correct keys (camelCase).
   - Test: ETag 304 behavior.
   - Test: permissions for pre-item completion (assigned user allowed; non-assigned returns 403) when `complete`/`bulk_complete` overrides are enabled.
   - Optional: assert queries via Django’s assertNumQueries for aggregation.

2) backend/deliverables/tests/test_pre_items.py (augment)
   - Ensure `get_upcoming_for_user` respects days_ahead and person linkage.
   - Assert `calendar_with_pre_items` applies `mine_only` to pre-items only (documented behavior), not deliverables.

Acceptance criteria:
- Tests pass locally; coverage hits new serializer & view.
 - Shared aggregate helpers are covered once in `core` and exercised via both endpoints (no forked logic).
```

---

## Phase 8 — Frontend Testing (Components & Integration)

Agent Implementation Prompt
```
Task: Add focused component and integration tests for Personal Dashboard.

Lean constraints:
- Use React Testing Library patterns already present.
- Mock API via existing test utilities; no network.

Files to add:
1) frontend/src/pages/Personal/__tests__/personalDashboard.integration.test.tsx
   - Render page with mocked services returning data.
   - Assert skeleton -> data swap; sections present; counts correct.

2) frontend/src/components/personal/__tests__/cards.test.tsx
   - Unit test each card with minimal props; a11y roles/labels present.
   - Ensure pre-item card renders correct label when fed `typeName` (or after adapter maps to `preDeliverableType`).
   - Verify route gating: when `PERSONAL_DASHBOARD` is false, navigating to `/my-work` redirects as expected (e.g., to `/dashboard`).
   - Verify empty-state: when `auth.person` is null, the page renders an explanatory state and makes no personal-data API calls.

Acceptance criteria:
- Tests run green; minimal, stable snapshots if used.
```

---

## Phase 9 — Performance & Telemetry

Agent Implementation Prompt
```
Task: Measure and tune Personal Dashboard performance.

Steps:
1) Add timing in PersonalDashboard mount to `trackPerformanceEvent('personal_dashboard_mount_ms', value)`.
2) Verify react-query cache settings (staleTime ~30s) to avoid refetch storms.
3) Confirm ETag/304 on aggregated endpoint; compare payload vs client-composed mode.
4) If both endpoints (team and personal) share core aggregates, profile them side‑by‑side to ensure consistent performance characteristics and no unintentional divergence.

Acceptance criteria:
- P95 mount under target on dev hardware; no excessive re-renders.
- Confirm second navigation is faster (prefetch + cache).
```

---

## Phase 10 — Rollout & Documentation

Agent Implementation Prompt
```
Task: Finalize rollout under feature flag and document the addition.

Steps:
1) Keep `PERSONAL_DASHBOARD` flag default true in dev; allow disabling for staging verification.
2) README/docs
   - Update README.md: add "My Work" section with a short tour.
   - Add docs/pre-deliverable-api-reference.md cross-link if users want to manage pre-items.
3) OpenAPI & Types
   - Regenerate backend schema to `backend/openapi.json` using drf-spectacular; copy/update `frontend/src/api/schema.src.json` and regenerate `frontend/src/api/schema.ts`; commit.
4) Capabilities (optional)
   - Extend `/api/capabilities/` to include `{ personalDashboard: true }` so clients can display the menu item without env flags in future. In the sidebar, prefer capabilities when available, falling back to the env flag.

Acceptance criteria:
- Documentation reflects new route and purpose.
- Feature can be toggled without deploy-time code edits.
```

---

## Risk Management & Guardrails
- Naming discipline: all new backend fields must be exposed via serializers; clients consume generated types only.
- Week policy: Use Sunday-only week keys for all derivations (no Monday fallbacks).
- No shortcuts: Avoid client-side over-aggregation when a clean server aggregate is warranted (Phase 3).
- Performance: Prefer small, frequent aggregates with caching over large, bespoke client loops.
- No duplication across personal and team dashboard:
  - Factor shared aggregation/business rules into `backend/core` (services/helpers) and import them on both sides.
  - Share frontend UI building blocks and API client; no personal‑only clones of shared components.
- A11y: Test keyboard flows and aria semantics as part of definition of done.
 - ETag strategy: For aggregated list/snapshot endpoints, compute ETag manually using stable inputs and return 304 on match; reserve `ETagConditionalMixin` for detail views.

---

## Verification Checklist (Agent-Run)
- Backend
  - Run unit tests for team dashboard + personal + deliverables + assignments.
  - Manually hit `/api/personal/work/` and verify ETag/304 cycle.
  - Verify `/api/deliverables/pre_deliverable_items/?mine_only=1&start=YYYY-MM-DD&end=YYYY-MM-DD` returns the current user’s items with expected fields (e.g., `typeName`).
- Frontend
  - Navigate to `/my-work`; confirm skeleton → data, no console errors.
  - Toggle network throttling; ensure progress and skeleton feedback.
  - Verify sidebar item focus states and aria-labels.
- Contract
  - Regenerate OpenAPI + TS types; ensure no drift.
  - Spot check camelCase keys match frontend models.

---

## Future Enhancements (Out of Scope, Pre-Designed)
- Add trend spark-lines per person (last 8 weeks) and anomaly flags.
- Allow server-backed preferences when Accounts preferences endpoint is generalized.
- Add digest email of “My Work” with pre-item reminders (feature-flagged) leveraging existing notification preferences.

```
Principles Recap (apply throughout):
- Lean code only; delete duplication; keep helpers tiny and pure.
- No band-aids: fix at the right layer (serializer, service, or query).
- Pair backend/TS types via OpenAPI; never hand-type client models.
- Optimize for first paint; hydrate progressively; respect a11y.
```
3) backend/core/tests/test_aggregates_shared.py (new)
   - If shared aggregation helpers are extracted to `core`, add unit tests for them and import from both personal and dashboard tests to ensure the same logic powers both endpoints.
