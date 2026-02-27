# API Call Consolidation Plan (Runtime-Verified)

## Baseline and Targets
Baseline was captured from runtime probing on February 24, 2026 using authenticated Playwright page loads against the local dev server.  
Current counts below are measured API calls per page load. Goal counts are budgets after this plan is completed.
For clarity:
1. Baseline table values are for hotspot ranking and were collected in a development runtime (React StrictMode enabled).
2. CI enforcement budgets must run in one canonical mode: production frontend build (`npm run build` + preview/server) against the same backend dataset.

| Page Route | Current Calls | Goal Calls |
|---|---:|---:|
| `/my-work` | 4 | 3 |
| `/dashboard` | 17 | 8 |
| `/people` | 11 | 6 |
| `/projects` | 15 | 9 |
| `/assignments` | 21 | 7 |
| `/project-assignments` | 25 | 8 |
| `/departments` | 7 | 5 |
| `/departments/manager` | 12 | 8 |
| `/departments/hierarchy` | 8 | 5 |
| `/departments/reports` | 36 | 8 |
| `/deliverables/calendar` | 5 | 4 |
| `/deliverables/dashboard` | 19 | 6 |
| `/settings` | 7 | 5 |
| `/skills` | 12 | 6 |
| `/performance` | 2 | 2 |
| `/reports/role-capacity` | 11 | 6 |
| `/reports/forecast` | 10 | 6 |
| `/reports/person-experience` | 3 | 3 |

Total baseline calls across these routes: `225`  
Total goal calls across these routes: `105`  
Net reduction target: `-120` calls (`~53%`).

## Primary Hotspots To Fix
1. `/departments/reports` fan-out to many department-specific dashboard calls.
2. `/assignments` and `/project-assignments` repeated phase-by-phase auto-hours/settings fetches.
3. `/deliverables/dashboard` N detail fetches (`GET /deliverables/:id/`) for notes.
4. `/projects` and project details fan-out project-role lookups by department.
5. Repeated page boot calls caused by imperative effects and uncached shared reference data.

## Design Principles
1. Prefer page-level snapshot endpoints for pages that currently orchestrate 4+ backend resources.
2. For cross-page reference data, fetch once and cache with scope-safe keys only (`departments`, `roles`, `verticals`, `capabilities`); never seed unscoped keys from scoped payloads.
3. Add bulk endpoints instead of issuing loops of per-id requests.
4. Keep existing endpoints for compatibility and migrate pages incrementally behind feature flags.
5. Enforce call budgets in automated runtime tests.

## Scope and Compatibility Contract
1. Every new endpoint must support the same filter dimensions used by the page it replaces (as applicable): `vertical`, `department`, `include_children`, `include_inactive`, `status_in`, tokenized search, and paging fields.
2. Backend cache keys and frontend query keys must include the same scope dimensions to prevent cross-scope cache pollution.
3. Scope dimensions are mandatory and explicit: tenant/org context, auth scope, and user identity where data is user-personalized.
4. Maintain one canonical key matrix in-repo for each consolidated endpoint and enforce key normalization rules (sorted/deduped `include` values, sorted/deduped ID lists, and canonical default handling).
5. New endpoints must preserve permission parity with current sources (no privilege widening).
6. Existing endpoints remain available until parity and budget tests pass in CI.
7. Heavy payloads must be request-scoped with `include` flags, optional IDs, and bounded response size.
8. Overview endpoints must provide structured partial-failure reporting using one standard shape only: `partialFailures` + `errorsByScope`.
9. OpenAPI docs must explicitly document compatibility behavior, fallback behavior, deprecation timeline, and `contractVersion` policy.
10. Permission parity applies at field level, not only endpoint level (for example: admin/manager-only data must never be embedded into auth-only snapshots).
11. Settings bootstrap endpoints must return server-authorized `visibleSections` only; requesting unauthorized section payloads must return `403`.
12. All new aggregate/snapshot endpoints must declare explicit throttles and request-rate budgets.
13. ID-list query params must have strict limits (`template_ids`, `department_ids`, etc.) and reject overflow with `400`; provide POST-body alternatives for large filter payloads and treat POST as primary for large sets.
14. Client and server caches must be identity-safe: auth-scoped keys where needed, and explicit cache clear on login/logout/identity change (React Query cache, in-memory API caches, and role caches).
15. Tokenized/free-text search aggregates must not use broad shared cache keys; either bypass caching or use strict TTL + capped LRU.
16. `errorsByScope`/partial-failure diagnostics must be sanitized and non-sensitive (no stack traces, SQL, or internal exception text).
17. New snapshot responses must include `contractVersion` for backward-compatible evolution.
18. Server aggregate cache keys must include an authz scope marker (`authz_scope_hash` and user id for personal views) in addition to filter dimensions.
19. Snapshot/bootstrap bundles that include privileged data must be explicitly requested by include flag; unauthorized requests for that include must return `403` and not silent omission.
20. Aggregate endpoints must define a global request deadline, per-subquery timeout, and cancellation propagation for all downstream calls.
21. Aggregate cache strategy must prevent stampedes using single-flight fills, stale-while-revalidate, and jittered TTLs for hot keys.

## Quantified Guardrails (Required Values)
These values are mandatory unless explicitly superseded by a later ADR.

1. Request deadlines:
   - Aggregate endpoint global deadline: `4000ms`.
   - Per-subquery timeout inside aggregates: `1500ms`.
   - Downstream cancellation must trigger immediately when the global deadline is hit.
2. Cache behavior:
   - Aggregate base TTL: `30s`.
   - Jitter: `+/-20%`.
   - Stale-while-revalidate window: `60s`.
   - Single-flight lock timeout: `2000ms`.
3. ID/include limits (reject overflow with `400`):
   - `template_ids`: max `200`.
   - `department_ids`: max `200`.
   - `project_ids`: max `200`.
   - `include` token count: max `10`.
4. Payload-size caps (compressed transfer excluded; validate JSON body size):
   - `GET /api/ui/bootstrap/`: `<=300KB`.
   - `GET /api/ui/assignments-page/` without `auto_hours`: `<=1200KB`.
   - `GET /api/ui/assignments-page/` with `auto_hours`: `<=2000KB`.
   - `GET /api/reports/departments/overview/`: `<=1500KB`.
   - `GET /api/deliverables/calendar_with_pre_items/` with notes preview/leads: `<=1500KB`.
5. Latency SLOs:
   - p95 `<=1200ms` for lightweight consolidated endpoints (`/api/ui/bootstrap/`, `/api/projects/project-roles/bulk/`).
   - p95 `<=1800ms` for heavy consolidated endpoints (`/api/ui/assignments-page/`, `/api/reports/departments/overview/`, `/api/deliverables/calendar_with_pre_items/` with include flags).
   - p99 `<=2500ms` for all consolidated endpoints.
6. Automatic rollback thresholds:
   - `5xx` rate `>2%` for `15m`, or
   - timeout rate `>5%` for `15m`, or
   - p95 exceeds target by `>20%` for `30m`.
   Any threshold breach disables the affected workstream flag automatically.

## Workstream 0: Identity and Cache Safety Foundation
Status: `Complete` (verified on 2026-02-24)

### Objective
Prevent cross-user cache reuse and make consolidated snapshots safe under login/logout and account switching.

### Backend
1. Add shared aggregate cache-key helper enforcing: endpoint + filter scope + authz scope (`role scope`, `user scope` when required).
2. Apply helper to all new snapshot/aggregate endpoints before rollout flags are enabled.

### Frontend
1. Add a single identity-transition cache reset utility and invoke it on logout/login/identity change.
2. Reset all relevant client caches on identity transition:
   - React Query cache (`queryClient.clear()` or equivalent scoped reset)
   - in-memory `fetchApiCached` stores
   - project-role in-memory cache
3. Add strict seed rules: snapshot/bootstrap hooks may seed only query keys that exactly match the key matrix scope dimensions.

### Verification gate
1. Add auth-cache isolation tests that login as user A, load consolidated payloads, logout/login as user B, and verify no reused protected payloads.
2. Block rollout of later workstreams until this gate is green in CI.

## Workstream A: Shared Bootstrap and Reference Data De-duplication
Status: `Complete` (verified on 2026-02-24)

### Objective
Eliminate repeated calls for global reference resources and mount-time duplicates without cross-scope cache corruption.

### Backend
1. Add `GET /api/ui/bootstrap/` returning a single payload for:
   - `verticals`
   - `capabilities`
   - `departmentsAll`
   - `rolesAll`
2. Add `include` query param (`include=verticals,capabilities,departments,roles`) so pages can request only needed sections.
3. Add compatible filters where relevant (`vertical`, `include_inactive`) and include these in server cache keys.
4. Enforce explicit throttle class and per-user request budget for bootstrap endpoint.

### Frontend
1. Add `useUiBootstrap` hook that seeds exact existing query keys (including scoped variants) from the canonical key matrix, not generic keys only.
2. Convert pages with imperative `loadX()` effects to consume bootstrap/query cache first:
   - `Dashboard`
   - `SkillsDashboard`
   - `TeamForecast`
   - `RoleCapacityCard`
   - `PeopleList`
3. Use `useDepartments`/`rolesApi.listAll` via React Query instead of repeated local effect fetches.
4. Keep global `refetchOnMount: true` unchanged; add per-query `refetchOnMount: false` overrides only when bootstrapped data is verified fresh and invalidation paths are wired.
5. Ensure bootstrap cache entries are isolated by auth identity and cleared on logout/login transitions.

### Expected impact
Directly reduces repeated `departments`, `roles`, `verticals`, and `capabilities` calls across most pages.

## Workstream B: Assignments and Project-Assignments Bulk Consolidation
Status: `Complete` (verified on 2026-02-24)

### Objective
Collapse per-phase and repeated settings requests into one scoped bulk call.

### Backend
1. Extend `GET /api/core/project-template-settings/` with `phases=sd,dd,ifp,ifc` returning:
   - `settingsByPhase`
   - `weekLimits`
2. Extend `GET /api/ui/assignments-page/` response with `autoHoursBundle` only when explicitly requested via include flag (`include=assignment,project,auto_hours`):
   - `phaseMapping`
   - `templates` (`id`, `name`, `phaseKeys`, `weeksByPhase`, `excludedRoleIds`, `excludedDepartmentIds`)
   - `defaultSettingsByPhase`
   - optional `templateSettingsByPhase` for requested template IDs only
   - `weekLimitsByPhase`
   - `bundleComplete` + `missingTemplateIds`
3. Add request scoping params for bundle size control (`auto_hours_phases`, `template_ids`) and include `contractVersion` + `bundleVersion` + `etag` metadata.
4. Keep existing single-phase behavior for backward compatibility.
5. Enforce permission parity for bundle content: requesting `auto_hours` include without required permission returns `403`; no privileged partial slices in auth-only payloads.
6. Add `template_ids` cardinality limit with `400` on overflow and POST-body alternative for large ID sets.

### Frontend
1. Refactor:
   - `frontend/src/pages/Assignments/AssignmentGrid.tsx`
   - `frontend/src/pages/Assignments/ProjectAssignmentsGrid.tsx`
2. Replace multiple calls to:
   - `/core/project-template-settings/?phase=*`
   - `/core/deliverable_phase_mapping/`
   - `/core/project-templates/`
   with one bootstrap/snapshot fetch scoped to visible phases/templates.
3. Ensure snapshot is fetched once per filter state + include set and shared by both assignment views.
4. Keep lazy per-template/per-phase fallback if bundle is missing or incomplete (`bundleComplete=false`).
5. If `auto_hours` include is rejected with `403`, disable bundle path for the session and continue legacy read path.

### Expected impact
- `/assignments`: `21 -> 7`
- `/project-assignments`: `25 -> 8`

## Workstream C: Department Reports Fan-Out Removal
Status: `Complete` (verified on 2026-02-27)

### Objective
Replace per-department dashboard loops with one aggregate report endpoint while preserving graceful degradation.

### Backend
1. Add `GET /api/reports/departments/overview/` with params:
   - `weeks`
   - `vertical`
   - `department`
   - `include_children`
   - `include_inactive`
   - `status_in`
   - `search`
2. Return in one payload:
   - department list
   - people counts per department
   - skills aggregates per department
   - dashboard summary metrics per department
   - analytics series used by report charts
   - `partialFailures` and `errorsByScope` for degraded results (scope keys like `department:<id>`)
3. Add explicit throttle class and bounded timeout for sub-queries used by this aggregation endpoint.
4. Add endpoint-level request deadline and propagate cancellation to all sub-queries to avoid hung fan-out under load.
5. Apply anti-stampede controls for overview cache fills (single-flight + stale-while-revalidate + jittered TTL).

### Frontend
1. Refactor `frontend/src/pages/Departments/ReportsView.tsx` to consume one overview payload.
2. Remove internal loop calling `dashboardApi.getDashboard(...)` for each department.
3. If overview fails (or is partial), fall back to the existing per-department path for missing departments.
4. Bound fallback fan-out with explicit caps:
   - `maxConcurrency=4`
   - `maxRetriesPerDepartment=1`
   - `maxFallbackDepartmentsPerRender=10`
   - circuit break fallback for `60s` after `3` consecutive aggregate failures

### Expected impact
- `/departments/reports`: `36 -> 8`

### Verification
1. Backend and frontend code paths rescanned for endpoint, fallback caps, and circuit-break wiring.
2. Containers restarted (`workload-tracker-backend`, `workload-tracker-frontend`) and health rechecked.
3. Migration state verified with `python manage.py migrate --check` (no pending migrations).
4. Live authenticated endpoint checks passed for:
   - `GET /api/reports/departments/overview/?weeks=4`
   - `GET /api/deliverables/calendar_with_pre_items/?include_notes=preview&include_project_leads=1`
5. Automated checks passed:
   - `python manage.py test reports.tests deliverables.tests.test_calendar`
   - `npm --prefix frontend run build`
6. Backend hardening completed and verified in `backend/reports/views.py`:
   - endpoint-level deadline budget (`REPORTS_DEPARTMENTS_OVERVIEW_DEADLINE_MS`)
   - bounded sub-query timeout wiring (`REPORTS_DEPARTMENTS_OVERVIEW_SUBQUERY_TIMEOUT_MS`)
   - anti-stampede cache controls (`fresh/stale/lock`) with jittered TTL and stale fallback

## Workstream D: Deliverables Dashboard N+1 Elimination
Status: `Complete` (verified on 2026-02-27)

### Objective
Remove per-deliverable detail lookups and consolidate project lead mapping data without inflating calendar payloads.

### Backend
1. Extend `GET /api/deliverables/calendar_with_pre_items/` to optionally include:
   - `notesPreview` (sanitized, plain text, truncated)
   - `departmentLeadsByProject` (aggregated)
2. Keep optional include flags to control payload size:
   - `include_notes=preview|full` (default none)
   - `include_project_leads=1`
3. Enforce payload guardrails (response-size cap and predictable truncation behavior).
4. Restrict `include_notes=full` to privileged users only (or remove from dashboard path); default dashboard path remains preview-only.

### Frontend
1. Refactor `frontend/src/pages/Deliverables/DeliverablesDashboard.tsx`:
   - Remove looped `deliverablesApi.get(id)` calls when notes preview/full notes are included.
   - Remove assignment paging query if `departmentLeadsByProject` is included.
2. Keep fallback to existing detail/assignment calls if include fields are not present.
3. Include `include_notes` and `include_project_leads` in query keys to avoid cross-variant cache pollution.

### Expected impact
- `/deliverables/dashboard`: `19 -> 6`

### Verification
1. Payload guardrails completed and verified in `backend/deliverables/views.py`:
   - response-size cap (`DELIVERABLES_CALENDAR_MAX_BYTES`)
   - deterministic truncation order and metadata
   - predictable fallback truncation behavior under hard caps
2. Automated checks passed:
   - `python manage.py test deliverables.tests.test_calendar`
3. Live authenticated endpoint check passed:
   - `GET /api/deliverables/calendar_with_pre_items/?start=2025-09-01&end=2025-09-30&include_notes=preview&include_project_leads=1`

## Workstream E: Projects Page Role and Assignment Fan-Out
Status: `Complete` (verified on 2026-02-27)

### Objective
Replace per-department role lookup calls with bulk role fetch without changing role behavior.

### Backend
1. Add primary `POST /api/projects/project-roles/bulk/` (`department_ids[]`, `include_inactive`); keep `GET` with CSV ids as compatibility path for small sets only.
2. Return deterministic `rolesByDepartment` map (include empty arrays for departments with no roles).
3. Preserve existing per-department sort behavior.
4. Add optional include to project search/snapshot payload for role map when project departments are known.
5. Enforce `department_ids` max length and query-length guard on GET compatibility path; overflow returns `400`.

### Frontend
1. Refactor:
   - `frontend/src/pages/Projects/list/hooks/useProjectAssignments.ts`
   - `frontend/src/pages/Projects/list/components/ProjectDetailsPanel.tsx`
2. Replace `listProjectRoles(deptId)` loops with one bulk call.
3. Prime existing roles cache from bulk result to preserve downstream compatibility.
4. Keep cache/query keys scoped by `department_ids + include_inactive + sort` semantics.
5. Keep fallback single-department lookups on bulk endpoint error.

### Expected impact
- `/projects`: `15 -> 9`

### Verification
1. Backend endpoint + routing verified:
   - `POST /api/projects/project-roles/bulk/` implemented as primary path.
   - `GET /api/projects/project-roles/bulk/?department_ids=...` implemented as CSV compatibility path with guardrails.
2. Deterministic `rolesByDepartment` response with empty-array departments verified in tests.
3. Frontend role fan-out loops replaced with one bulk call plus fallback in:
   - `frontend/src/pages/Projects/list/hooks/useProjectAssignments.ts`
   - `frontend/src/pages/Projects/list/components/ProjectDetailsPanel.tsx`
4. Automated checks passed:
   - `python manage.py test projects.tests.test_roles_api projects.tests.test_roles_list_filters`
   - `npm --prefix frontend run build`
5. Optional role-map include completed for project search payload:
   - `POST /api/projects/search/` now accepts `include=role_map`
   - response includes `rolesByDepartment` for departments found in the current page's staffing scope
6. Frontend role cache priming and reuse completed:
   - `frontend/src/hooks/useProjects.ts` primes from `rolesByDepartment`
   - `frontend/src/roles/api.ts` reuses primed single-department cache for bulk lookups
7. Live authenticated endpoint check passed:
   - `POST /api/projects/search/` with `{ "page_size": 25, "include": "role_map" }`
8. GET compatibility guardrails are now explicitly covered by tests:
   - max-ids overflow returns `400`
   - query-length overflow returns `400` with POST guidance

## Workstream F: Reports Role Capacity and Forecast Bootstrap
Status: `Complete` (verified on 2026-02-26)

### Objective
Reduce duplicate report setup calls by bundling reference + primary dataset while preserving current permissions.

### Backend
1. Add `GET /api/reports/role-capacity/bootstrap/` returning:
   - `roles`
   - `departments`
   - initial `timeline`
2. Add `GET /api/reports/forecast/bootstrap/` returning:
   - `departments`
   - `projects`
   - initial `workloadForecast`
3. Enforce permission parity:
   - role-capacity bootstrap: authenticated users only
   - forecast bootstrap: admin-only (same as current forecast source)
4. Unauthorized access to bootstrap endpoints must return explicit `403` (not partial success with hidden privileged slices).

### Frontend
1. Refactor:
   - `frontend/src/components/analytics/RoleCapacityCard.tsx`
   - `frontend/src/components/dashboard/RoleCapacitySummary.tsx`
   - `frontend/src/pages/Reports/TeamForecast.tsx`
2. Stop issuing separate startup calls for roles/departments/primary series when bootstrap is available.
3. Keep existing endpoint fallback for incremental rollout.

### Expected impact
- `/reports/role-capacity`: `11 -> 6`
- `/reports/forecast`: `10 -> 6`

### Verification
1. Backend endpoints + permissions verified:
   - `GET /api/reports/role-capacity/bootstrap/` (authenticated)
   - `GET /api/reports/forecast/bootstrap/` (admin-only with explicit `403` for non-admin users)
2. Frontend startup bootstrap path integrated with fallback in:
   - `frontend/src/components/analytics/RoleCapacityCard.tsx`
   - `frontend/src/components/dashboard/RoleCapacitySummary.tsx`
   - `frontend/src/pages/Reports/TeamForecast.tsx`
3. Environment and runtime checks:
   - Restarted `workload-tracker-backend` and `workload-tracker-frontend` containers.
   - `python manage.py migrate --noinput` -> no unapplied migrations.
   - Live authenticated API smoke test:
     - role-capacity bootstrap (admin token): `200`
     - forecast bootstrap (admin token): `200`
     - forecast bootstrap (non-admin token): `403`
4. Automated checks passed:
   - `python manage.py test reports.tests projects.tests.test_roles_api projects.tests.test_roles_list_filters`
   - `npm --prefix frontend run build`

## Workstream G: People, Skills, Settings Consolidation
### Objective
Consolidate startup resources while preserving current pagination/search behavior and settings section gating.

### Backend
1. Add `GET /api/ui/people-page/` with:
   - roles
   - filters metadata
   - initial people search payload (page + page_size + filters)
   - selected person skills summary (optional)
2. Add `GET /api/ui/skills-page/` with:
   - people
   - departments
   - skill tags
   - person skills
3. Add `GET /api/ui/settings-page/` with minimal shell data:
   - capabilities
   - visible section metadata
   - optional section payload via `section=<id>` include
4. Add strict include/paging controls and per-section payload caps for `people-page` and `skills-page` snapshots.
5. Enforce server-side section authorization on `settings-page`; never return payload for sections outside `visibleSections`.

### Frontend
1. Refactor:
   - `frontend/src/pages/People/PeopleList.tsx`
   - `frontend/src/pages/Skills/SkillsDashboard.tsx`
   - `frontend/src/pages/Settings/Settings.tsx` and section loaders
2. Keep People search/pagination semantics from `usePeopleSearch` (do not force unpaged snapshots).
3. Keep Settings section-level lazy loading for non-active sections.
4. Keep snapshot fetch minimal by default; load optional heavy sections only when active/visible.

### Expected impact
- `/people`: `11 -> 6`
- `/skills`: `12 -> 6`
- `/settings`: `7 -> 5`

## Workstream H: Moderate Pages
### Objective
Apply scoped, explicit consolidation where pages are already near budget.

### Changes
1. `/dashboard`:
   - Add explicit dashboard snapshot contract (`summary + by-client + role-capacity + project counts`) and keep legacy query path as fallback.
   - Target `17 -> 8`.
2. `/departments`, `/departments/hierarchy`, `/departments/manager`:
   - Reuse shared departments/people caches with explicit scoped keys; add small snapshots where needed with the same fallback contract style.
   - Targets:
     - `/departments`: `7 -> 5`
     - `/departments/hierarchy`: `8 -> 5`
     - `/departments/manager`: `12 -> 8`
3. `/deliverables/calendar`:
   - Keep existing endpoint, only reduce bootstrap duplication.
   - Target `5 -> 4`.
4. `/my-work`:
   - Keep lean, rely on shared bootstrap cache.
   - Target `4 -> 3`.

## Workstream I: Pages Kept As-Is
### Reason
Current call volume is already low and bulk consolidation is unlikely to produce material gains.

### Routes
1. `/performance` stays at `2`.
2. `/reports/person-experience` stays at `3`.

## AI Agent Implementation Playbook
This section is optimized for autonomous coding agents and is part of the required execution contract.

### File Map by Workstream (Primary Edit Targets)
| Workstream | Backend Primary Files | Frontend Primary Files | Primary Test Targets | Notes / Guardrails |
|---|---|---|---|---|
| 0 | `backend/config/settings.py`<br>`backend/config/urls.py`<br>`backend/assignments/views.py`<br>`backend/reports/views.py`<br>`backend/deliverables/views.py`<br>`backend/projects/views_roles.py`<br>`backend/core/cache_keys.py` (new) | `frontend/src/store/auth.ts`<br>`frontend/src/services/api.ts`<br>`frontend/src/lib/queryClient.ts`<br>`frontend/src/roles/api.ts`<br>`frontend/src/lib/identityCacheReset.ts` (new) | `backend/core/tests/` (new auth cache isolation tests)<br>`frontend/tests/e2e/05_auth_refresh_reload.spec.ts` | Must clear React Query cache + in-memory API cache + role cache on identity transition. |
| A | `backend/core/views.py`<br>`backend/config/urls.py` | `frontend/src/hooks/useUiBootstrap.ts` (new)<br>`frontend/src/pages/Dashboard.tsx`<br>`frontend/src/pages/Skills/SkillsDashboard.tsx`<br>`frontend/src/pages/Reports/TeamForecast.tsx`<br>`frontend/src/components/analytics/RoleCapacityCard.tsx`<br>`frontend/src/pages/People/PeopleList.tsx` | `frontend/tests/e2e/02_people.spec.ts` | Seed only canonical scoped query keys from the key matrix. |
| B | `backend/assignments/views.py`<br>`backend/core/views.py` | `frontend/src/pages/Assignments/AssignmentGrid.tsx`<br>`frontend/src/pages/Assignments/ProjectAssignmentsGrid.tsx`<br>`frontend/src/pages/Assignments/hooks/useAssignmentsPageSnapshot.ts`<br>`frontend/src/services/assignmentsPageSnapshotApi.ts` | `backend/assignments/tests/test_snapshots.py` | `auto_hours` include must be explicitly gated and return `403` when unauthorized. |
| C | `backend/reports/views.py`<br>`backend/reports/urls.py` | `frontend/src/pages/Departments/ReportsView.tsx` | `backend/reports/tests.py`<br>`frontend/tests/e2e/departments-reports-accordion.spec.ts` | Overview endpoint must emit `partialFailures` + `errorsByScope` only. |
| D | `backend/deliverables/views.py` | `frontend/src/pages/Deliverables/DeliverablesDashboard.tsx`<br>`frontend/src/hooks/useDeliverablesCalendar.ts` | `backend/deliverables/tests/test_calendar.py`<br>`backend/deliverables/tests/test_calendar_union_mine_only.py` | Keep compatibility path; only include payload grows when include flags are set. |
| E | `backend/projects/views_roles.py`<br>`backend/projects/urls_roles.py`<br>`backend/projects/roles_serializers.py` | `frontend/src/roles/api.ts`<br>`frontend/src/pages/Projects/list/hooks/useProjectAssignments.ts`<br>`frontend/src/pages/Projects/list/components/ProjectDetailsPanel.tsx` | `backend/projects/tests/test_roles_api.py`<br>`backend/projects/tests/test_roles_list_filters.py` | Authoritative backend file is `backend/projects/views_roles.py` (not `backend/projects/views/roles.py`). |
| F | `backend/reports/views.py`<br>`backend/reports/urls.py` | `frontend/src/components/analytics/RoleCapacityCard.tsx`<br>`frontend/src/components/dashboard/RoleCapacitySummary.tsx`<br>`frontend/src/pages/Reports/TeamForecast.tsx` | `frontend/tests/e2e/role-capacity.spec.ts`<br>`frontend/tests/e2e/team-forecast.spec.ts` | Preserve current auth rules (`forecast` remains admin-only). |
| G | `backend/core/views.py`<br>`backend/config/urls.py` | `frontend/src/pages/People/PeopleList.tsx`<br>`frontend/src/pages/Skills/SkillsDashboard.tsx`<br>`frontend/src/pages/Settings/Settings.tsx` | `frontend/tests/e2e/02_people.spec.ts`<br>`frontend/tests/e2e/06_people_pagination.spec.ts` | Preserve paging/search semantics and settings section authorization behavior. |
| H | `backend/dashboard/views.py`<br>`backend/departments/views.py` | `frontend/src/pages/Dashboard.tsx`<br>`frontend/src/pages/Departments/DepartmentsList.tsx`<br>`frontend/src/pages/Departments/HierarchyView.tsx`<br>`frontend/src/pages/Departments/ManagerDashboard.tsx`<br>`frontend/src/pages/Deliverables/Calendar.tsx`<br>`frontend/src/pages/Personal/PersonalDashboard.tsx` | `frontend/tests/e2e/dashboard-responsive.spec.ts` | Apply only scoped improvements with measurable route-budget impact. |
| I | none (budget verification only) | none (budget verification only) | `frontend/tests/e2e/person-experience.spec.ts` | No functional refactor permitted in this workstream. |

### Generated and Non-Authoritative Files (Agent Guardrail)
1. Do not hand-edit generated artifacts:
   - `backend/openapi.json`
   - `frontend/src/api/schema.ts`
   Regenerate via commands only.
2. Do not implement project-role changes in `backend/projects/views/roles.py` unless URL imports are explicitly moved there.
3. Do not modify unrelated dirty-worktree files outside the selected workstream.

### Concrete Endpoint Contracts (Implementation Examples)
Standard error envelope for new consolidated endpoints:
```json
{
  "detail": "forbidden",
  "code": "forbidden",
  "contractVersion": "2026-02-24"
}
```
Status-specific expectations:
1. `400`: invalid filters, overflow list params, malformed include values.
2. `403`: unauthorized include bundle/section.
3. `429`: throttle exceeded.

`GET /api/ui/bootstrap/?include=departments,roles&vertical=3&include_inactive=0`
```json
{
  "contractVersion": "2026-02-24",
  "requestedInclude": ["departments", "roles"],
  "departmentsAll": [{"id": 1, "name": "Engineering", "vertical": 3, "is_active": true}],
  "rolesAll": [{"id": 41, "department_id": 1, "name": "Engineer", "is_active": true}]
}
```

`GET /api/ui/assignments-page/?include=assignment,project,auto_hours&auto_hours_phases=sd,dd&template_ids=10,12`
```json
{
  "contractVersion": "2026-02-24",
  "bundleVersion": "v1",
  "assignmentGridSnapshot": {"weekKeys": ["2026-03-01"]},
  "projectGridSnapshot": {"weekKeys": ["2026-03-01"]},
  "autoHoursBundle": {
    "bundleComplete": true,
    "missingTemplateIds": [],
    "phaseMapping": {"sd": "schematic_design"},
    "templates": [{"id": 10, "name": "Std Template", "phaseKeys": ["sd"]}],
    "defaultSettingsByPhase": {"sd": {"defaultPercent": 35}},
    "templateSettingsByPhase": {"10": {"sd": {"defaultPercent": 40}}},
    "weekLimitsByPhase": {"sd": {"min": 0, "max": 60}}
  }
}
```

`GET /api/reports/departments/overview/?weeks=12&vertical=3&include_children=1`
```json
{
  "contractVersion": "2026-02-24",
  "partialFailures": false,
  "errorsByScope": {},
  "departments": [{"id": 1, "name": "Engineering"}],
  "overviewByDepartment": {"1": {"peopleCount": 23, "skillsSummary": {"python": 12}}},
  "analyticsSeries": {"utilization": [{"week": "2026-03-01", "value": 0.82}]}
}
```

`POST /api/projects/project-roles/bulk/`
Request:
```json
{
  "department_ids": [1, 2, 5],
  "include_inactive": false
}
```
Response:
```json
{
  "contractVersion": "2026-02-24",
  "rolesByDepartment": {
    "1": [{"id": 10, "name": "Engineer", "is_active": true, "sort_order": 10}],
    "2": [],
    "5": [{"id": 12, "name": "Designer", "is_active": true, "sort_order": 20}]
  }
}
```

`GET /api/deliverables/calendar_with_pre_items/?include_notes=preview&include_project_leads=1`
Compatibility rule:
1. Legacy request shape remains supported.
2. Include-driven response uses envelope mode:
```json
{
  "contractVersion": "2026-02-24",
  "items": [{"itemType": "deliverable", "id": 1001, "notesPreview": "Kickoff prep...", "projectId": 77}],
  "departmentLeadsByProject": {"77": [{"personId": 9, "name": "A. Lead"}]}
}
```

`GET /api/reports/role-capacity/bootstrap/`
```json
{
  "contractVersion": "2026-02-24",
  "roles": [{"id": 10, "name": "Engineer"}],
  "departments": [{"id": 1, "name": "Engineering"}],
  "timeline": [{"week": "2026-03-01", "capacity": 320, "assigned": 280}]
}
```

`GET /api/reports/forecast/bootstrap/`
```json
{
  "contractVersion": "2026-02-24",
  "departments": [{"id": 1, "name": "Engineering"}],
  "projects": [{"id": 77, "name": "Project Atlas"}],
  "workloadForecast": [{"week": "2026-03-01", "hours": 420}]
}
```

`GET /api/ui/people-page/?page=1&page_size=50&include=filters,people`
```json
{
  "contractVersion": "2026-02-24",
  "filters": {"departments": [{"id": 1, "name": "Engineering"}], "roles": [{"id": 10, "name": "Engineer"}]},
  "people": {"count": 214, "results": [{"id": 2, "name": "Taylor"}]}
}
```

`GET /api/ui/settings-page/?section=department-project-roles`
```json
{
  "contractVersion": "2026-02-24",
  "visibleSections": ["department-project-roles", "roles", "integrations"],
  "sectionData": {"department-project-roles": {"departments": [{"id": 1, "name": "Engineering"}]}}
}
```

### Feature Flag Implementation Map (Exact Locations)
All new consolidation flags default to `false`.

Backend locations:
1. Add keys in `backend/config/settings.py` inside `FEATURES`.
2. Expose capability booleans in `backend/config/urls.py` (`/api/capabilities/` payload).
3. Add defaults to `.env.example`, `.env.production.template`, and `unraid/.env.unraid.example`.

Frontend locations:
1. Add runtime env mapping in `frontend/src/lib/flags.ts` (`VITE_FF_*`).
2. Add typed wrappers in `frontend/src/config/flags.ts` if needed by route components.

Required flag keys:
1. Backend env: `FF_CONSOLIDATION_FOUNDATION`, `FF_UI_BOOTSTRAP`, `FF_ASSIGNMENTS_AUTO_HOURS_BUNDLE`, `FF_DEPARTMENTS_OVERVIEW`, `FF_DELIVERABLES_DASHBOARD_BUNDLE`, `FF_PROJECT_ROLES_BULK`, `FF_REPORTS_BOOTSTRAP`, `FF_PEOPLE_SKILLS_SETTINGS_SNAPSHOTS`, `FF_MODERATE_PAGES_SNAPSHOTS`.
2. Frontend env: `VITE_FF_CONSOLIDATION_FOUNDATION`, `VITE_FF_UI_BOOTSTRAP`, `VITE_FF_ASSIGNMENTS_AUTO_HOURS_BUNDLE`, `VITE_FF_DEPARTMENTS_OVERVIEW`, `VITE_FF_DELIVERABLES_DASHBOARD_BUNDLE`, `VITE_FF_PROJECT_ROLES_BULK`, `VITE_FF_REPORTS_BOOTSTRAP`, `VITE_FF_PEOPLE_SKILLS_SETTINGS_SNAPSHOTS`, `VITE_FF_MODERATE_PAGES_SNAPSHOTS`.
3. Execution matrix aliases map directly:
   - `ff_ui_bootstrap` -> `FF_UI_BOOTSTRAP` / `VITE_FF_UI_BOOTSTRAP`
   - `ff_assignments_auto_hours_bundle` -> `FF_ASSIGNMENTS_AUTO_HOURS_BUNDLE` / `VITE_FF_ASSIGNMENTS_AUTO_HOURS_BUNDLE`
   - use this pattern for all workstream flags.

### Prompt Slicing Contract (for AI Coding Sessions)
1. One prompt implements one workstream only.
2. Workstream 0 must be completed first; no exceptions.
3. Each prompt response must include:
   - changed files list,
   - migration changes (`yes/no`),
   - exact commands run,
   - test results summary,
   - route-budget delta for affected routes,
   - rollback flag names validated.
4. Section completion checkoff requirement (mandatory before marking any workstream/section complete):
   - implement the planned changes for that section,
   - rescan the codebase and verify expected files/contracts/paths were actually updated,
   - restart any affected Docker containers/services,
   - run required migrations (if any),
   - run a live runtime test for that section’s primary route/endpoint behavior,
   - only then mark that section as `Complete` in this plan.

Prompt template:
```text
Implement Workstream <ID> from PLAN_API_CALL_CONSOLIDATION.md only.
Do not modify unrelated files.
Follow the file map and endpoint examples exactly.
Run required gate commands for this workstream.
Return: (1) files changed, (2) commands + results, (3) call-budget before/after, (4) risks/fallback notes.
```

### Out of Scope (Agent Must Not Do)
1. No broad refactors outside the selected workstream.
2. No endpoint removals during consolidation rollout.
3. No unbounded schema redesigns unrelated to call consolidation.
4. No manual edits to generated OpenAPI artifacts.
5. No default-on feature flags before pre-canary gate passes.

## Execution Matrix
This matrix is required before kickoff for each workstream and is used for planning, sequencing, and release readiness.

| Workstream | Owner Role(s) | Estimate (eng-weeks) | Depends On | Feature Flag | Rollback Trigger Threshold | Target Date | Impact Confidence |
|---|---|---:|---|---|---|---|---|
| 0 | Platform API Lead + Frontend Infra Lead | 1-2 | Scope contract lock | `ff_consolidation_foundation` | error/timeout/p95 breach for 15m window | 2026-03-06 | High |
| A | Frontend Platform Lead + Core API Lead | 2-3 | 0 | `ff_ui_bootstrap` | error/timeout/p95 breach for 30m window | 2026-03-24 | High |
| B | Assignments Backend Lead + Assignments UI Lead | 3-4 | 0, A | `ff_assignments_auto_hours_bundle` | error/timeout/p95 breach for 30m window | 2026-04-14 | High |
| C | Reports Backend Lead + Reports UI Lead | 3-4 | 0 | `ff_departments_overview` | error/timeout/p95 breach for 15m window | 2026-04-10 | High |
| D | Deliverables Fullstack Lead | 2-3 | 0 | `ff_deliverables_dashboard_bundle` | error/timeout/p95 breach for 30m window | 2026-04-11 | Medium |
| E | Projects Backend Lead + Projects UI Lead | 2 | 0 | `ff_project_roles_bulk` | error/timeout/p95 breach for 30m window | 2026-03-24 | High |
| F | Analytics Fullstack Lead | 2-3 | 0, A | `ff_reports_bootstrap` | error/timeout/p95 breach for 30m window | 2026-04-28 | Medium |
| G | People/Settings Fullstack Lead | 3-4 | 0, A | `ff_people_skills_settings_snapshots` | error/timeout/p95 breach for 30m window | 2026-05-01 | Medium |
| H | Frontend Platform Lead + Domain Owners | 2-3 | 0, A | `ff_moderate_pages_snapshots` | error/timeout/p95 breach for 30m window | 2026-05-05 | Medium |
| I | QA/Performance Lead | 0.5 | none | `n/a` | `n/a` | 2026-05-06 | High |

Confidence scale:
1. High: expected call reduction path is direct and already validated by hotspot traces.
2. Medium: expected reduction depends on include usage patterns or payload variance.
3. Low: uncertain impact; requires probe confirmation before committing budget deltas.
4. Target dates are planned completion milestones and assume no critical-path incidents.

## Dependency and Parallelization Map
1. Hard prerequisites:
   - Scope/compatibility contract lock.
   - Workstream 0 CI gate.
   - Canonical production-build baseline committed.
2. Parallel Wave 1:
   - Workstream A and Workstream E can run in parallel after Workstream 0.
3. Parallel Wave 2:
   - Workstream B depends on A.
   - Workstreams C and D run in parallel after Workstream 0.
4. Parallel Wave 3:
   - Workstreams F, G, and H run in parallel after A.
5. Closeout:
   - Workstream I verification (no-change budget confirmation) and legacy endpoint sunset decisions.

Critical path:
1. Contract lock -> Workstream 0 -> baseline capture -> A -> B -> final budget tuning and rollout sign-off.

## Milestone Calendar (Prefilled)
1. Contract + execution matrix lock: 2026-02-27.
2. Workstream 0 CI gate green: 2026-03-06.
3. Canonical production-build baseline committed: 2026-03-10.
4. Parallel Wave 1 complete (A + E): 2026-03-24.
5. Parallel Wave 2 complete (B + C + D): 2026-04-14.
6. Parallel Wave 3 complete (F + G + H): 2026-05-05.
7. Workstream I verification complete: 2026-05-06.
8. Pre-canary gate complete: 2026-05-08.
9. Canary enable target (sampled production traffic): 2026-05-12.
10. Pre-production gate complete: 2026-05-22.
11. Production default-on target: 2026-05-29.
12. Legacy endpoint sunset review checkpoint: 2026-06-12.

## Per-Workstream Exit Criteria (Definition of Done)
1. Workstream 0:
   - Auth/cache isolation tests pass in CI.
   - Identity-transition cache reset is wired for login/logout/user switch.
   - Authz-scoped cache-key helper is used by all new aggregate endpoints.
2. Workstream A:
   - `ui/bootstrap` includes and scope filters are parity-tested.
   - `useUiBootstrap` seeds only key-matrix-approved keys.
   - Targeted pages remove duplicate bootstrap fetches.
3. Workstream B:
   - Assignments views consume include-gated bundle path.
   - Unauthorized `auto_hours` include returns `403` and fallback path remains functional.
   - Template-id limit, POST alternative, and overflow `400` behavior are tested.
4. Workstream C:
   - Departments overview powers primary render path.
   - `partialFailures` + `errorsByScope` contract is stable and sanitized.
   - Fallback caps/circuit-break behavior is validated.
5. Workstream D:
   - Deliverables dashboard removes N detail loops when include payload is present.
   - Notes payload policy (preview/full) enforces role restrictions.
   - Response-size guardrails are tested.
6. Workstream E:
   - Projects role lookups use bulk endpoint path by default.
   - GET compatibility path remains for small sets and is guarded.
   - Downstream roles cache remains behavior-compatible.
7. Workstream F:
   - Role-capacity and forecast pages use bootstrap startup path.
   - Admin/auth permission parity is tested with explicit `403`.
   - Legacy startup fetch path remains valid behind flags.
8. Workstream G:
   - People/skills/settings snapshots preserve pagination and lazy-loading semantics.
   - Settings section authz is server-enforced per `visibleSections`.
   - Snapshot payload caps and include controls are tested.
9. Workstream H:
   - Moderate pages adopt scoped snapshots/caches only where ROI is measurable.
   - Route budgets improve without correctness regressions.
   - Legacy fallbacks remain available behind flags.
10. Workstream I:
   - No code path changes increase route calls.
   - Baseline and post-change probes confirm targets remain stable.

## Risk Register (Top Two Risks Per Workstream)
| Workstream | Risk 1 | Mitigation 1 | Risk 2 | Mitigation 2 |
|---|---|---|---|---|
| 0 | Cross-user cache reuse after identity switch | Centralized reset utility + CI auth isolation tests | Incomplete authz key dimensions | Shared cache-key helper + key-matrix parity tests |
| A | Bootstrap overfetch increases payload cost | Include gating + payload-size budgets | Key seeding pollutes cross-scope cache | Strict scoped seeding rules + matrix tests |
| B | Unauthorized auto-hours leakage via bundle | Include permission gate with explicit `403` | Large template filters cause abuse/timeouts | ID caps + POST body path + throttle tests |
| C | Aggregate endpoint timeout under fan-out | Global deadline + subquery timeouts + cancellation | Fallback storm recreates original fan-out | Concurrency/retry caps + circuit-break tests |
| D | Notes include leaks sensitive text fields | Sanitized preview + field allowlist tests | Payload inflation on large calendars | Response-size cap + truncation policy |
| E | Bulk roles response diverges from single-role behavior | Parity tests on sort/content semantics | Oversized GET query breaks infra limits | POST-primary path + GET guard + `400` overflow |
| F | Forecast bootstrap widens admin-only access | Explicit permission tests + `403` contract | Bootstrap staleness degrades report trust | TTL policy + invalidation on report filter changes |
| G | Settings snapshot leaks hidden section data | Server-side `visibleSections` enforcement + tests | People snapshot breaks pagination semantics | Preserve `usePeopleSearch` behavior + parity tests |
| H | Moderate-page snapshots add complexity without ROI | Require measurable budget delta per page | Shared cache reuse causes variant mixing | Scoped keys including include/filter dimensions |
| I | No-op pages unintentionally regress in shared changes | Include in budget CI probes | Deferred cleanup leaves hidden debt | Track and review quarterly with owner assignment |

## Implementation Sequence
1. Lock scope contract, key-matrix contract, and canonical measurement runtime policy.
2. Assign owners/dates/flags in the execution matrix for all workstreams.
3. Implement Workstream 0 (identity/cache safety foundation) and pass its CI gate.
4. Capture and commit canonical production-build baseline metrics (replace dev-only baseline for budget enforcement).
5. Execute Parallel Wave 1: Workstreams A and E.
6. Execute Parallel Wave 2: Workstreams B, C, and D (B starts after A).
7. Execute Parallel Wave 3: Workstreams F, G, and H.
8. Validate Workstream I no-change routes and confirm budget stability.
9. Define and approve legacy endpoint deprecation milestones (owner, target date, and removal gate) for each replaced endpoint before enabling production-default flags.

## Rollout and Rollback Strategy
1. Ship each workstream behind route-level feature flags (new endpoint path + legacy fallback path); defaults stay OFF until tests are updated for dual-mode behavior.
2. During rollout, dual-read verification is limited to staging/canary and sampled requests; production default is single-read + fallback only.
3. Keep existing endpoints and UI code paths until parity and budget checks pass for two consecutive CI runs.
4. Rollback is immediate by feature-flag disable only (no schema rollback required).
5. Degraded-mode policy must prevent fallback storms with explicit caps (`maxConcurrency=4`, `maxRetries=1`, `maxFallbackCallsPerRender=10`, circuit-break `60s` after `3` consecutive failures).
6. Define automatic rollback triggers per workstream: disable flag when canary/production error rate, timeout rate, or p95 latency exceed threshold for a fixed window.
7. Require documented legacy endpoint sunset dates with explicit extension-approval process to prevent indefinite dual-path operation.

## Verification and Enforcement
Gate model:
1. Pre-merge gate (required on every PR touching consolidated paths):
   - contract/schema checks, key-matrix parity checks, auth/permission tests, and overflow/limit tests.
2. Pre-canary gate (required before enabling any flag in staging/canary):
   - canonical route budget checks, degraded-path/circuit-break checks, and authz fuzz/tampering checks.
3. Pre-production gate (required before default-on in production):
   - two consecutive green CI runs, canary SLO conformance, rollback trigger validation, and rollback drill proof.

Canonical gate commands and pass criteria:
1. Pre-merge commands (all must exit `0`):
   - `cd backend && python manage.py test assignments.tests projects.tests deliverables.tests reports.tests core.tests config.tests`
   - `cd frontend && npm run test:run`
   - `cd frontend && npm run build`
   - `cd backend && python manage.py spectacular --file openapi.json --format openapi-json`
   - `cd frontend && npm run openapi:regen`
   - `git diff --exit-code backend/openapi.json frontend/src/api/schema.ts`
2. Pre-merge pass criteria:
   - no failing tests,
   - OpenAPI artifacts regenerated and staged when backend API changes exist,
   - no key-matrix parity test failures,
   - no permission-parity test failures.
3. Pre-canary commands (all must exit `0`; add scripts if missing):
   - `cd frontend && node scripts/probe-api-call-budgets.mjs --mode=production --output tests/perf/latest.json`
   - `cd frontend && node scripts/assert-api-call-budgets.mjs --budgets tests/perf/api-call-budgets.json --actual tests/perf/latest.json`
   - `cd frontend && npm run e2e -- tests/e2e/01_login.spec.ts tests/e2e/02_people.spec.ts tests/e2e/03_projects.spec.ts tests/e2e/assignments-mobile.spec.ts tests/e2e/project-assignments-mobile.spec.ts tests/e2e/departments-reports-accordion.spec.ts tests/e2e/role-capacity.spec.ts tests/e2e/team-forecast.spec.ts`
4. Pre-canary pass criteria:
   - every affected route is under call budget,
   - degraded-path tests prove fallback caps/circuit-break behavior,
   - authz fuzz/tampering suite passes with fail-closed outcomes (`400`/`403`),
   - no SLO breach for affected endpoints in canary test window.
5. Pre-production commands (two consecutive green runs required):
   - rerun all pre-canary commands twice against production-build runtime,
   - execute rollback drill by toggling each enabled workstream flag OFF then ON in staging/canary.
6. Pre-production pass criteria:
   - two consecutive green CI runs with unchanged budgets,
   - rollback drill demonstrates immediate safe fallback,
   - no rollback-trigger threshold breach in canary observation window.

1. Add runtime probe script under `frontend/scripts/` to collect calls per route in canonical production-build mode.
2. Add API call budget file committed in repo (`frontend/tests/perf/api-call-budgets.json`) with explicit measurement mode metadata and baseline timestamp.
3. Add CI Playwright test that fails when route budgets are exceeded in canonical runtime mode (`production-build`); keep `dev-strictmode` as diagnostic only.
4. Validate both:
   - Fresh page load budgets.
   - In-app route transition budgets.
5. Add response-parity tests for filters, pagination, and role/notes correctness between legacy and new endpoints.
6. Add permission-parity tests for all bootstrap endpoints (especially admin-only report data), including explicit include-driven `403` behavior for privileged bundles.
7. Add payload-size checks for include-heavy endpoints (deliverables notes, assignments auto-hours bundle).
8. Add permission matrix tests for field-level access (admin/manager/user), including `autoHoursBundle` and `settings-page section=<id>`.
9. Add throttling/abuse tests for all new aggregate endpoints.
10. Add limit tests for ID-list params and verify `400` on overflow.
11. Add auth-cache isolation tests (logout/login as different user must never reuse cached sensitive payloads), including React Query + in-memory cache reset assertions.
12. Add key-matrix tests proving frontend query keys and backend cache keys contain identical scope dimensions.
13. Add OpenAPI + generated TypeScript schema regeneration gate for every new endpoint and `contractVersion` changes.
14. Add degraded-path tests proving fallback concurrency/retry/circuit-break caps prevent fan-out explosions.
15. Add response-shape allowlist tests and redaction tests for snapshot/aggregate endpoints to prevent accidental PII or internal-field leaks.
16. Add authz tampering/fuzz tests for `include`, ID-list params, and filter combinations; unauthorized or malformed combinations must fail closed (`403`/`400`).
17. Add SLO tests for p95/p99 latency and payload-size ceilings on new snapshot/aggregate endpoints, not only call-count budgets.

## Acceptance Criteria
1. Every route in the baseline table meets or beats its goal call budget in the canonical runtime mode.
2. No regression in response correctness for filters, role data, deliverable notes, pagination, or search semantics.
3. No endpoint removals that break existing callers.
4. All new bulk endpoints documented in OpenAPI and covered by integration tests.
5. Permission parity is verified for every new endpoint replacing existing data sources.
6. Legacy fallback paths remain functional until cutover and are validated in CI.
7. Feature-flag rollback path is exercised and documented before final rollout.
8. Aggregated endpoints with partial failures (`departments/overview`, deliverables include payloads) degrade gracefully without blocking full-page render.
9. No privilege widening is introduced at endpoint or field level.
10. Auth/cache isolation is verified across login/logout and user switching.
11. Endpoint throttling, query-size limits, and abuse protections are verified in tests.
12. OpenAPI docs, typed client artifacts, and `contractVersion` are synchronized before enabling each flag in production.
13. Key-matrix parity and scoped cache-seeding rules are verified in CI.
14. Privileged include paths (for example `auto_hours`) return `403` when unauthorized and never leak partial privileged slices.
15. Route and endpoint SLOs are met in canonical runtime mode (p95/p99 latency and payload-size budgets), not only API-call-count goals.
16. Every replaced legacy endpoint has an approved owner/date removal plan, and dual-path extensions require explicit sign-off.
