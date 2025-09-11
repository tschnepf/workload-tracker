# OpenAPI Client Migration Plan (Incremental, Low Risk → High Risk)

This guide contains prescriptive, lean prompts to migrate frontend API calls to a typed OpenAPI client generated from the backend schema. Steps are ordered from lowest to highest risk, split into small, verifiable chunks. Each prompt can be fed to the AI‑Agent.

Principles:
- Use lean programming: minimal, focused diffs; keep behavior identical.
- Migrate one endpoint group at a time; do not refactor unrelated code.
- Keep the current `services/api.ts` until all call sites are migrated; adapt functions to call the typed client during migration to avoid churn.
- Centralize auth/ETag/error handling; preserve existing 412/If‑Match and friendly error mapping.
- Always run commands inside containers (`docker compose exec <service> …`).

---

## Phase 0 — Foundation & Tooling

### Step 0.1 — Verify schema + endpoints
- Prompt: "Ensure `drf-spectacular` is enabled and `/api/schema/` + `/api/schema/swagger/` respond. Do not change permissions; use current defaults."
- Description: Confirm the schema is accessible for generation.
- Testing (AI‑Agent)
  - `docker compose exec backend curl -sSf http://localhost:8000/api/schema/ | head -c 200`

### Step 0.2 — Generate OpenAPI types
- Prompt: "Dump OpenAPI to `backend/openapi.json`, then generate TypeScript types to `frontend/src/api/schema.ts` using `openapi-typescript`. Do not hand‑edit generated files."
- Description: Establish single source of truth for types.
- Commands (Docker)
  - `make openapi-schema`
  - `make openapi-client`
- Testing (AI‑Agent)
  - `docker compose exec frontend npm run -s build` (type check)

### Step 0.3 — Client wrapper + interceptors (minimal)
- Prompt: "Add minimal helpers to `frontend/src/api/client.ts` to inject `Authorization` from store and integrate existing ETag handling: capture ETag on GET, set `If-Match` on PATCH/DELETE when available. Reuse current friendly error mapping for status codes."
- Description: Preserve auth/ETag/error behavior while swapping transport.
- Notes: Keep logic small; do not change call sites yet.

---

## Phase 1 — Low‑Risk Read‑Only (Small Surfaces)

### Step 1.1 — Departments list (paginated)
- Prompt: "Replace `departmentsApi.list()` implementation to call the typed OpenAPI client. Keep its function signature to avoid touching callers."
- Description: Minimal change behind existing facade.
- Testing (AI‑Agent)
  - Type check; open Departments pages; verify list renders.

### Step 1.2 — Roles list (paginated)
- Prompt: "Migrate `rolesApi.list()` to typed client. Preserve return shape for current UI."
- Description: Identical behavior, typed calls.

### Step 1.3 — Dashboard summary
- Prompt: "Migrate `dashboardApi.getDashboard()` to typed client. Keep params and response mapping unchanged."
- Description: Read‑only API with stable shape.

---

## Phase 2 — Read‑Heavy Lists (Paginated)

### Step 2.1 — People list (paginated)
- Prompt: "Switch `peopleApi.list()` to typed client. Preserve query params (`page`, `page_size`, `search`, `department`, `include_children`). Do not change hooks/components."
- Description: Core list, low risk if return matches.
- Testing (AI‑Agent)
  - Navigate People list; paginate; verify department filter works.

### Step 2.2 — Projects list (paginated)
- Prompt: "Migrate `projectsApi.list()` to typed client with identical query params and result shape."
- Description: Similar to People.

---

## Phase 3 — Parameterized & Derived Reads

### Step 3.1 — People typeahead (search + autocomplete)
- Prompt: "Migrate `peopleApi.search()` and `peopleApi.autocomplete()` to typed client. Keep rate limits and min length checks in UI."
- Description: Narrow payloads; stable params.

### Step 3.2 — Projects filter metadata
- Prompt: "Migrate `projectsApi.getFilterMetadata()` to typed client. If schema lacks a component for the response, add `@extend_schema` to backend view with explicit `response` schema."
- Description: Derived data; ensure schema accuracy.

### Step 3.3 — Deliverables calendar
- Prompt: "Migrate `deliverablesApi.calendar(start,end)` to typed client. Backfill schema via `@extend_schema` with query params and response array item."
- Description: Parameterized read.

### Step 3.4 — People capacity + forecast
- Prompt: "Migrate `peopleApi.capacityHeatmap()` and `peopleApi.workloadForecast()`. Annotate backend endpoints with `@extend_schema` for response types if missing."
- Description: Analytics reads.

### Step 3.5 — Deliverables staffing summary
- Prompt: "Migrate `deliverablesApi.staffingSummary(deliverableId, weeks)`; annotate backend response shape via `@extend_schema`."
- Description: Derived read.

---

## Phase 4 — CRUD Mutations (Medium Risk)

### Step 4.1 — People CRUD
- Prompt: "Migrate `peopleApi.get/create/update/delete` to typed client. Inject `If-Match` from ETag store for PATCH/DELETE and handle 412 conflicts as today (toast + rollback)."
- Description: Preserve optimistic updates and cache invalidation.

### Step 4.2 — Projects CRUD
- Prompt: "Migrate `projectsApi.get/create/update/delete` with the same ETag/rollback behavior used for People."
- Description: Same patterns.

### Step 4.3 — Deliverables CRUD
- Prompt: "Migrate `deliverablesApi.get/create/update/delete`. Keep payload/fields unchanged."
- Description: Straightforward CRUD.

### Step 4.4 — Assignments CRUD
- Prompt: "Migrate `assignmentsApi.create/update/delete` to typed client. Maintain serialization for `weeklyHours` and existing optimistic UI behaviors."
- Description: Medium risk due to grid dependencies; migrate last in CRUD group.

### Step 4.5 — Skills CRUD
- Prompt: "Migrate `skillTagsApi` and `personSkillsApi` (list/get/create/update/delete, summary). Ensure enum/string unions are reflected in schema for better TS types."
- Description: Contained feature area.

---

## Phase 5 — Special Flows (Higher Risk)

### Step 5.1 — Assignment `check_conflicts`
- Prompt: "Migrate `assignmentsApi.checkConflicts()` to typed client. Add `@extend_schema` on backend action with explicit request body and response."
- Description: Critical logic; confirm types match existing UI expectations.

### Step 5.2 — Background jobs (status + download)
- Prompt: "Migrate `jobsApi.getStatus()` and `jobsApi.downloadFile()` to typed client. On backend, annotate status endpoint with response schema and mark download endpoint content type `application/octet-stream`."
- Description: File downloads need correct media type.

### Step 5.3 — Auth endpoints (JWT)
- Prompt: "Optionally migrate token obtain/refresh/verify/logout to typed client. Preserve cookie‑mode refresh flow and store interactions; do not alter auth UX."
- Description: Touchy area; only migrate if beneficial.

### Step 5.4 — Export/Import submissions (async)
- Prompt: "Migrate People/Projects export/import endpoints to typed client (request returns `{ jobId }`). Add `@extend_schema` for request/response. Keep current UI polling unchanged."
- Description: Ensure job ID typing.

---

## Phase 6 — Backend Schema Hardening

### Step 6.1 — Annotate custom actions
- Prompt: "Add `@extend_schema` to APIViews/ViewSet actions without clear auto‑schema (filter metadata, staffing summary, calendar, jobs status/download, check_conflicts). Define request, parameters, and response types explicitly."
- Description: Improves client types and future tooling.

### Step 6.2 — Enums & components
- Prompt: "Promote common shapes (e.g., project status enum, pagination response) to named components in `SPECTACULAR_SETTINGS` or via serializer field choices so TS gets string unions."
- Description: Better DX by narrowing types.

### Step 6.3 — Re‑generate schema & types
- Prompt: "Run `make openapi-schema` and `make openapi-client`. Fix any TS compile issues surfaced by stricter types."
- Description: Close the loop.

---

## Phase 7 — Cleanup & Consolidation

### Step 7.1 — Deprecate legacy service functions
- Prompt: "For endpoints fully migrated, remove or thin `services/api.ts` wrappers to delegate to the typed client, keeping shared error/ETag handlers in one place."
- Description: Reduce duplicate pathways.

### Step 7.2 — Documentation & CI
- Prompt: "Document the workflow: `make openapi-schema` → `make openapi-client` and add a CI check to ensure `frontend/src/api/schema.ts` is up‑to‑date (diff against `backend/openapi.json`)."
- Description: Prevent drift.

---

## Testing (AI‑Agent)
- After each migration step:
  - `docker compose exec frontend npm run -s build` (type checks)
  - Exercise the affected screens; verify no behavior changes.
- After backend annotations:
  - `make openapi-schema && make openapi-client`

## Manual UI Checks (You)
- Navigate each modified area and confirm:
  - Lists load and paginate correctly.
  - Department filters still work and include_children behavior matches.
  - Edits are optimistic with rollback on errors; 412 conflicts show toasts.
  - Job flows show progress and downloads work.

---

## Acceptance Criteria
- Frontend calls for migrated areas use the typed OpenAPI client.
- Existing UX/behavior unchanged (auth, ETag/If‑Match, toasts, pagination, filters).
- Backend schema covers custom endpoints; type generation is reproducible via `make`.
- Legacy wrappers are removed or delegated, eliminating duplication.

