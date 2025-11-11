# OpenAPI Client Migration Plan (Streamlined — Incremental, Low Risk → High Risk)

This plan migrates frontend API calls to a typed OpenAPI client generated from the backend schema. Steps are ordered from lowest to highest risk and are small, verifiable, and reversible.

Timeline: 3–4 weeks with proper ETag/auth preservation.

Principles:
- Minimal, focused diffs; keep behavior identical.
- Migrate one endpoint at a time with rollback capability.
- Keep `frontend/src/services/api.ts` as the compatibility layer until all call sites are migrated; have it delegate to the typed client per endpoint behind a flag.
- Centralize auth/ETag/error handling; preserve existing 412/If-Match and friendly error mapping.
- Run commands in containers (`docker compose exec <service> …`).
- Use feature flags for safe rollback at critical steps.

---

## Phase -1 — Migration Readiness

### Step -1.1 — Schema status verification
- Prompt: Run `make openapi-schema` and verify schema generation succeeds. Confirm that ViewSet endpoints (People, Projects, Assignments, Deliverables, Departments, Skills, Roles) are present. Identify APIViews and custom actions that still need `@extend_schema` (e.g., accounts/*, dashboard, jobs; People autocomplete/search, Deliverables calendar/staffing_summary, Projects filter_metadata, Assignments check_conflicts, etc.). These will be annotated before their migration steps.
- Testing
  - `make openapi-schema` (should succeed; APIView warnings are acceptable for now)
  - Confirm major ViewSet paths appear in `backend/openapi.json` and Swagger UI

### Step -1.2 — Package version pinning
- Prompt: Pin `openapi-typescript` and `openapi-fetch` to exact, known-good versions (remove ^), then regenerate types and build. Use the current working versions in package.json, just without the range specifiers.
- Testing
  - `docker compose exec frontend npm list openapi-typescript openapi-fetch`
  - `make openapi-client && docker compose exec frontend npm run build`

### Step -1.3 — ETag behavior documentation
- Prompt: Document and test existing ETag behavior end-to-end:
  1) `ETagConditionalMixin` computes MD5 from `updated_at` for detail routes; select list endpoints also return ETag/Last-Modified/304.
  2) Frontend stores ETags keyed by endpoint and injects `If-Match` for PATCH/DELETE.
  3) 412 conflicts show a toast and rollback optimistic updates.
  4) Token refresh flow on 401 and retry.
- Testing
  - Write/execute focused tests on People and Projects detail GET + PATCH/DELETE conflict scenarios.

---

## Phase 0 — Foundation & Client Setup

### Step 0.1 — Verify schema endpoints
- Prompt: Confirm `/api/schema/` and `/api/schema/swagger/` respond correctly and list the major ViewSets. Verify `SCHEMA_PATH_PREFIX` is `/api` (backend) and that the typed client `baseUrl` matches `VITE_API_URL` including `/api`.
- Testing
  - `curl -sSf http://localhost:8000/api/schema/ | head -c 200`
  - Load `/api/schema/swagger/`

### Step 0.2 — Generate initial types
- Prompt: `make openapi-schema && make openapi-client` to generate `frontend/src/api/schema.ts` via `openapi-typescript`.
- Testing
  - `docker compose exec frontend npm run build` (TS type check should pass)

### Step 0.3 — Feature flag system
- Prompt: Add `VITE_OPENAPI_MIGRATION_ENABLED=false` (and optionally per-endpoint flags like `VITE_OPENAPI_PEOPLE=false`). Implement gating in `services/api.ts` only (compat layer delegates to typed client per endpoint). Keep rollout deterministic per user/session; avoid random percentage splits. Update `frontend/src/vite-env.d.ts` to include the new flags. Keep React Query query keys and data shapes unchanged to avoid cache churn when switching implementations.
- Testing
  - Toggling the flag switches the implementation for targeted endpoints

### Step 0.4 — Lean interceptors in typed client
- Prompt: Implement request/response handling in `frontend/src/api/client.ts` to preserve existing behavior, but keep it lean:
  1) Inject Authorization header from `getAccessToken()`.
  2) Capture ETag on successful detail GET and store in a shared `etagStore` keyed by normalized endpoint (canonical trailing slash, no query).
  3) Inject `If-Match` on PATCH/DELETE detail when an ETag exists.
  4) Preserve error semantics: wrap openapi-fetch results so callers get thrown `ApiError` with the same `friendlyErrorMessage()` mapping (extract mapping to a shared util used by both legacy and typed paths). Do not make callers switch to `{ data, error }` handling.
  5) On 401, coalesce and perform a single token refresh using the existing store/auth logic, then retry once.
  6) On 412, show the same toast and allow caller to rollback optimistic updates.
- Notes
  - Do not re-implement caching/coalescing here; React Query and existing helpers already handle it.
  - Force trailing slashes in typed client paths to match DRF (avoid redirects).
  - If you later add `If-None-Match` on GET, you must also handle 304 by surfacing cached data; for now, keep current behavior (no 304 handling).
- Testing
  - Auth header injection, 401 refresh + retry, ETag capture/injection, toast on 412

### Step 0.5 — ETag store lifecycle
- Prompt: Extract `etagStore` to a shared module used by both legacy and typed clients. Clear the store on logout/token reset to prevent stale 412s after identity changes. Normalize keys consistently (trailing slash, no query).
- Testing
  - Verify ETags are cleared on logout
  - Verify detail mutations use the expected `If-Match`

### Step 0.6 — Focused E2E test coverage
- Prompt: Add a small Playwright suite covering 1) login/logout + 401 refresh replay, 2) People/Projects one 412 conflict optimistic rollback, 3) a simple paginated list, 4) trailing-slash correctness on detail routes.
- Testing
  - Tests pass with both legacy and typed implementations via the flag

### Step 0.7 — Bulk response shape policy
- Prompt: Decide and document how to handle `all=true` bulk responses that return raw arrays (not paginated objects) for People/Projects/Departments. Options:
  - Keep legacy implementation for `all=true` during migration and only migrate paginated flows now, or
  - Introduce dedicated bulk endpoints (`/bulk/`) that return arrays and annotate them in schema, or
  - Standardize list responses to always be paginated and adjust backend accordingly.
- Recommendation (low risk): Keep legacy for `all=true` and migrate paginated flows first; revisit dedicated bulk endpoints later.
- Testing
  - Verify UI code paths for `all=true` remain on legacy until dedicated bulk schema exists

---

## Phase 1 — Safe Read‑Only Endpoints (Schema Ready)

### Step 1.1 — Roles list
- Prompt: Migrate `rolesApi.list()` to the typed client. Simple pagination, complete schema.
- Testing
  - Verify list renders identically; pagination works

### Step 1.2 — Departments list
- Prompt: Migrate `departmentsApi.list()` to the typed client. This endpoint supports pagination and `all=true` bulk (no `include_children`).
- Testing
  - Paginated list and `all=true` bulk return match legacy

### Step 1.3 — Dashboard summary (requires schema addition first)
- Prompt: If not already present in schema, add `@extend_schema` to `DashboardView` (params: `weeks`, `department`; response: dashboard payload), then migrate `dashboardApi.getDashboard()`. If it already appears, verify the response component matches the actual shape.
- Testing
  - Regenerate schema/types; verify dashboard loads and parameters are honored

---

## Phase 2 — Complex Read Operations (Schema Ready)

### Step 2.1 — People list
- Prompt: Migrate `peopleApi.list()` preserving `page`, `page_size`, `department`, `include_children`, and `all=true` bulk. Keep behavior and shapes identical.
- Testing
  - Pagination; department filter with/without `include_children`; bulk path

### Step 2.2 — Projects list
- Prompt: Migrate `projectsApi.list()` preserving pagination and `all=true` bulk. Respect existing ETag/Last‑Modified behavior.
- Testing
  - Pagination; bulk path; verify ETag/Last‑Modified headers unchanged

---

## Phase 3 — Parameterized & Derived Reads (Add schema first)

### Step 3.0 — Add `@extend_schema` to custom actions
- Prompt: Before migrating these reads, annotate request/response shapes and query params with explicit types and examples:
  - People: `autocomplete`, `search`, `capacity_heatmap`, `workload_forecast`
  - Projects: `filter_metadata`
  - Deliverables: `calendar`, `staffing_summary` (and `bulk`, `reorder` if migrating now)
  - Assignments: `by_person` (if used in UI)
- Param typing specifics for lists:
  - People list: `department` (integer), `include_children` (enum: 0|1), `all` (boolean)
  - Projects list: `all` (boolean)
  - Departments list: `all` (boolean)
- Include `examples` in `@extend_schema` for derived/aggregated responses to improve type clarity (e.g., filter metadata map, calendar items).
- Testing
  - `make openapi-schema && make openapi-client` cleanly generates types

### Step 3.1 — People search and autocomplete
- Prompt: Migrate `peopleApi.search()` and `peopleApi.autocomplete()` to the typed client after adding schema.
- Testing
  - Verify identical results and limits; handle empty/short queries

### Step 3.2 — Projects filter metadata (requires schema addition)
- Prompt: Add `@extend_schema` to the `filter_metadata` action (query params and response map). Migrate hook/calls that use this endpoint; verify ETag/Last‑Modified paths stay intact. Preserve the existing 30s AbortController timeout when calling from the client.
- Testing
  - Validate returned structure matches legacy; headers present

### Step 3.3 — Deliverables list, calendar, staffing summary (requires schema addition)
- Prompt: Add `@extend_schema` for Deliverables custom actions first (params: `start`, `end`, `weeks`; response arrays). Then migrate the three reads.
- Testing
  - Calendar date ranges; staffing summaries across various windows

---

## Phase 4 — CRUD Mutations (High Risk)

### Step 4.0 — CRUD validation pattern (apply to all)
- Prompt: Before each CRUD migration:
  - Test ETag behavior: detail GET stores ETag; PATCH/DELETE send `If-Match`; 412 conflict shows toast and triggers optimistic rollback.
  - Test optimistic updates and rollback behavior in UI.
  - Test basic concurrent editing (two tabs) for race conditions.

### Step 4.1 — People CRUD
- Prompt: Migrate `peopleApi.get/create/update/delete` to the typed client with full ETag semantics.
- Testing
  - Field coverage; 412 conflicts; rollback; relationships stay intact

### Step 4.2 — Projects CRUD
- Prompt: Migrate `projectsApi.get/create/update/delete` with the same ETag/rollback behavior as People.
- Testing
  - Status transitions; relationships; ETag parity

### Step 4.3 — Assignments CRUD (highest risk)
- Prompt: Before migration, add `ETagConditionalMixin` to `AssignmentViewSet` detail operations to enforce preconditions, then migrate `assignmentsApi.create/update/delete`. Preserve existing `weeklyHours` serialization and grid flows; extensive testing required.
- Testing
  - Grid CRUD; weeklyHours calculations; drag‑and‑drop; bulk flows; ETag/412 behavior

### Step 4.4 — Skills and Deliverables CRUD
- Prompt: Migrate Skills and Deliverables CRUD after verifying schemas. Keep payloads and shapes unchanged.
- Testing
  - Skill creation/tagging; deliverables relationships; deadline logic

---

## Phase 5 — Special Flows (Add schema first where needed)

### Step 5.1 — Assignment conflict checking
- Prompt: Add `@extend_schema` (explicit request and response bodies) for `assignments/check_conflicts`, then migrate `assignmentsApi.checkConflicts()`; test exhaustively (prevents double‑booking).
- Testing
  - Overlap scenarios across weeks/projects; capacity math correctness

### Step 5.2 — Background jobs (status + download + file endpoints)
- Prompt: Add `@extend_schema` to `JobStatusView` and `JobDownloadView` (status JSON and binary download). Use the typed client for status polling; keep low‑level `fetch` for binary download as it is not JSON. For People/Projects export/import endpoints, annotate multipart/file responses and retain low‑level fetch/streaming semantics; do not force JSON parsing on streaming/plain-text responses.
- Testing
  - Polling transitions; file download across browsers

### Step 5.3 — Auth endpoints (optional)
- Prompt: Optionally add `@extend_schema` to accounts endpoints and migrate them. This is not required for the core migration; only do if it adds value.
- Testing
  - Full auth flows; throttles; permissions

---

## Phase 6 — Schema Optimization & Cleanup

### Step 6.1 — Remaining schema decorators
- Prompt: Add `@extend_schema` to any remaining custom actions/APIVIews used by the UI.
- Testing
  - Regenerate schema/types without warnings for migrated endpoints

### Step 6.2 — Components and enums
- Prompt: Promote common shapes to reusable components and enumerate string unions for better TS types. Regenerate types.
- Testing
  - `make openapi-schema && make openapi-client`; TS build passes

### Step 6.3 — Final validation
- Prompt: Re-run full type check and targeted E2E; confirm zero regressions with OpenAPI client fully enabled.

---

## Phase 7 — Cleanup & CI

### Step 7.1 — Retire legacy wrappers
- Prompt: For endpoints fully migrated and stable, thin or remove `services/api.ts` wrappers, delegating to the typed client. Keep shared error/ETag helpers in one place. Remove flags after stability is confirmed.
- Testing
  - Build passes; no dead/unused code; behavior unchanged

### Step 7.2 — CI schema drift guard
- Prompt: In CI, run `make openapi-schema && make openapi-client` and fail if `frontend/src/api/schema.ts` has diffs. Document the regeneration workflow for the team.
- Testing
  - CI blocks stale types; runbook is clear

### Step 7.3 — Post‑rollout monitoring
- Prompt: Enable enhanced monitoring (e.g., Sentry error rate dashboards) for migrated endpoints for 48–72 hours post‑switch. If error rates spike, rollback via feature flags and investigate. Capture breadcrumbs including endpoint path and status codes.
- Testing
  - Validate alerting triggers on error‑rate thresholds; rollback path verified

---

## Testing Strategy

After each step
- `docker compose exec frontend npm run build` (type check)
- Exercise affected screens; verify identical UX and payload shapes

For CRUD steps
- Verify ETag capture and `If-Match` injection; 412 conflicts and optimistic rollback
- Identity changes: ensure ETag store is cleared on logout/token reset
- Trailing slash correctness for detail paths (avoid redirects)
- React Query: confirm query keys remain unchanged across legacy/typed paths
- Abort/timeout parity for endpoints that use timeouts (e.g., filter metadata)

Before phase completion
- Regression pass on related areas
- If adding `If-None-Match` later, verify 304 handling and cache surfacing

---

## Post-Migration: Outstanding Schema Tasks

The following drf-spectacular items remain (or can reappear) and should be closed after rollout stabilization:

- Accounts APIViews: Spectacular still logs "unable to guess serializer" for some function-based views (me, settings_view, link_person, change_password, set_password, list_users, delete_user, admin_audit_logs).
  - Plan:
    - Option A (preferred): Convert these to class-based views (APIView/GenericAPIView) with explicit `serializer_class` per method and `@extend_schema` on methods.
    - Option B: Keep FBVs but attach `@extend_schema` with explicit `request`/`responses` using dedicated serializer classes (avoid large inline serializers).
    - Add minimal serializer classes in `backend/accounts/serializers.py` (e.g., ProfileResponseSerializer, SettingsPatchSerializer, LinkPersonRequestSerializer, ChangePasswordRequestSerializer, UserListItemSerializer, AdminAuditLogItemSerializer) and reference them from the views.
    - Re-run `manage.py spectacular` and ensure errors drop to zero for accounts.

- Deliverables calendar SerializerMethodField type hint warning (get_title):
  - Plan: Annotate the field with `@extend_schema_field(serializers.CharField())` or declare it explicitly as `serializers.CharField(source='get_title')` to provide a concrete schema type.

- Keep free-form list responses fully typed:
  - People capacity_heatmap and workload_forecast have concrete serializers now; keep them in sync with `frontend/src/types/models.ts` (PersonCapacityHeatmapItem, WorkloadForecastItem).

- CI hardening:
  - Fail CI on any Spectacular errors (> 0). Use `.github/workflows/openapi-ci.yml` to verify `backend/openapi.json` and `frontend/src/api/schema.ts` are up-to-date in PRs.

- De-risked rollout cleanup:
  - After flags are stable in prod, remove legacy fetch paths and keep only typed-client code paths. Retain interceptors (auth/ETag/If-Match/401 refresh) as the single source of truth.
