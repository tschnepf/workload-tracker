# Future Projects – Implementation Plan

Goal: Add a first‑class way to create, track, forecast, and convert “Future Projects” separate from real projects, and surface their impact in analytics (toggleable). Keep the real Projects page focused on active/real projects. Enable templates for fast entry with customizable deliverables, roles, and schedule lengths.

Principles
- Lean programming, minimal surface‑area changes, high cohesion, no shortcuts.
- Backend and frontend must stay in lockstep: OpenAPI types are the source of truth.
- Avoid band‑aids; favor reusable services, hooks, and small PRs with clear rollbacks.
- Preserve current behavior by default. Make new features opt‑in where practical.

Editing Rules (for the AI agent)
- Use apply_patch for all file changes and preserve formatting/line endings.
- Avoid bulk regex replacements. Submit minimal, contextual patches.
- Do not insert literal "\r\n"; let the patch handle newlines.
- After edits, run `npm run build` (frontend) and backend tests where present.
- Extract helpers/hooks/services when logic repeats; keep interfaces typed and small.

## Phase 0 — Discovery & Alignment

- Prompt 0.1 — Codebase scan and notes
  - "Scan backend projects/roles apps and analytics endpoints. Confirm how deliverables and assignments are modeled today, where project status lives, and where role capacity analytics are computed. Produce a short baseline note in `docs/dev-notes/future-projects-notes.md` listing: relevant models, serializers, views, and any enums touching project status. No code changes yet."

- Prompt 0.2 — UX/IA alignment
  - "Decide primary UX: a new nav entry ‘Future Projects’ with List and Create/Edit forms, and (optional) Templates section under Settings. Identify entry points to analytics that will ‘Include Future’ (likely Role Capacity cards). Document this in the notes file."

## Phase 1 — Backend Data Modeling (Django)

- Prompt 1.1 — Models and migrations (new app is acceptable; embedding in projects is also acceptable)
  - "Add models to support future projects with clean separation from real Project data:
    - `FutureProject`: id, name, client (string), description/notes, `start_date`, `bd_confidence` (FK or enum), `is_active`, `created_at`, `updated_at`.
    - `FutureProjectDeliverable`: FK to FutureProject, `label`, `offset_weeks` (int), `duration_weeks` (int), `sort_order`.
    - `FutureProjectRoleDemand`: FK to FutureProject, `role` (FK to roles.Role), `quantity` (int), `percent_fte` (decimal 0–100), `notes`.
    - `BDConfidence`: `code` (BD25/BD50/BD75/BD90), `label`, `weight` (0.25/0.5/0.75/0.9), `is_active`, `sort_order` (customizable).
    - Templates: `FutureProjectTemplate` (name, description), with `TemplateDeliverable` and `TemplateRoleDemand` mirroring fields above.
    Use a new app (e.g., `pipeline` or `future_projects`) or extend `projects` if that’s more consistent. Provide migrations and admin registrations."

- Prompt 1.2 — Constants and helpers
  - "Define `FULL_TIME_WEEKLY_HOURS = 36`. Add a helper to compute weekly role hours = `percent_fte / 100 * FULL_TIME_WEEKLY_HOURS * quantity`. Add a schedule expander that, given `start_date` + deliverables (offset/duration), returns week keys and a mask of active weeks."

- Prompt 1.3 — Conversion service
  - "Add a backend service (`convert_future_project_to_project`) that creates a real Project row (status defaults as current system uses), clones deliverables with computed dates, and optionally accepts a mapping `{ roleId -> [personId, ...] }` to create initial assignments. Keep this lean: uniform weekly distribution across active deliverable range is acceptable for v1. Provide transactional safety and return the new project id."

## Phase 2 — Backend API (DRF + OpenAPI)

- Prompt 2.1 — CRUD endpoints
  - "Add DRF ViewSets/serializers for:
    - `/api/future-projects/` (list/create), `/api/future-projects/{id}/` (retrieve/update/delete).
    - Nested endpoints or composite payloads for deliverables and role demands (choose one consistent pattern; prefer separate endpoints for clarity):
      - `/api/future-projects/{id}/deliverables/` CRUD
      - `/api/future-projects/{id}/role-demands/` CRUD
    - `/api/future-projects/templates/` and nested CRUD for template pieces.
    Ensure serializers map camelCase <-> snake_case consistently, matching the rest of the codebase."

- Prompt 2.2 — Forecast endpoints
  - "Add `/api/future-projects/{id}/forecast/` that returns: `{ weekKeys: [YYYY-MM-DD], roles: [{id,name}], series: [{ roleId, hours: number[] }] }`. Compute from start_date, deliverables schedule, and role demand (36h base)."

- Prompt 2.3 — Aggregate future demand
  - "Add `/api/analytics/future-demand/` returning combined weekly role demand across selected future projects. Filters: department (optional via role->people mapping later), `bd_confidence` include list, and `weighting` (boolean) to apply BD weights."

- Prompt 2.4 — Convert action
  - "Add `/api/future-projects/{id}/convert/` POST with body `{ projectFields, roleMappings? }` to create a real project and optional initial assignments. Return created project id."

- Prompt 2.5 — OpenAPI and errors
  - "Annotate endpoints in OpenAPI (drf-spectacular) and regenerate `frontend/src/api/schema.ts`. Use consistent error shapes. Add throttling where needed."

## Phase 3 — Frontend Types & Services

- Prompt 3.1 — Regenerate types and add services
  - "Run `npm run openapi:types`. Implement typed service wrappers: `futureProjectsApi`, `futureTemplatesApi`, `futureForecastApi`. Align naming with existing `services/api.ts` pattern."

- Prompt 3.2 — Domain utilities
  - "Add a small utility to compute pie/stack inputs from forecast responses. Do not duplicate chart logic; reuse patterns used elsewhere (e.g., RoleCapacity series shape)."

## Phase 4 — Frontend UI: Future Projects Pages

- Prompt 4.1 — Routing and nav
  - "Add a ‘Future Projects’ entry in the sidebar. Create routes: List (`/future-projects`) and Form (`/future-projects/:id?`). Use lazy loading and RequireAuth consistent with other pages."

- Prompt 4.2 — List page
  - "Implement a list grid/table showing: name, client, start date, BD confidence, summary of role demand (e.g., total weekly hours), and actions: Edit, Forecast, Convert, Delete. Include filters: BD confidence, text search, and date range."

- Prompt 4.3 — Create/Edit form
  - "Create a form with sections:
    - Core: name, client, start date, BD confidence, notes.
    - Deliverables: list editor with offset weeks + duration weeks; allow add/remove/reorder.
    - Generic Roles: rows with role select, quantity, percent FTE (of 36h), notes; allow add/remove.
    - Template apply: select a saved template to prefill; allow edits after apply.
    Use React Query mutations; show clear validation and non-blocking toasts."

- Prompt 4.4 — Template management (Settings)
  - "Add a simple management UI under Settings: list/create/edit templates with the same structure (deliverables + role demands). Use bulk apply from the creation form."

- Prompt 4.5 — Convert dialog/wizard
  - "Create a Convert dialog from the list row that lets the user:
    - Review core fields for the new Project.
    - Optionally map each generic role to one or more real people (autocomplete), and choose percent split if needed (v1 can assume uniform split across selected people per role).
    - Confirm and run conversion via `/convert/`. On success, deep-link to the new Project."

## Phase 5 — Analytics Integration (Include Future)

- Prompt 5.1 — Role capacity overlay
  - "Add an ‘Include Future’ toggle on RoleCapacityCard. When enabled, fetch `/api/analytics/future-demand/` with the same timeframe; overlay a dashed/secondary ‘futureDemand’ line or stacked area per role. Keep chart semantics accessible."

- Prompt 5.2 — Other analytics entry points
  - "Audit other analytics cards. Where future demand meaningfully adds value (e.g., Assigned Hours Timeline), add a discrete toggle. Keep defaults off to preserve current behavior."

## Phase 6 — Status & Sub‑Status Unification

- Prompt 6.1 — Status model alignment
  - "Ensure the ‘Future’ project status and BD sub‑statuses are represented centrally. If current Project status is a string field, add ‘Future’ as a valid value. Keep BD sub‑status in `BDConfidence` and expose to the UI as selectable chips."

- Prompt 6.2 — Customizable BD sub‑statuses
  - "Allow BDConfidence CRUD in Settings (optional v1). Defaults: BD25/50/75/90 with weights 0.25/0.5/0.75/0.9. If editing is enabled, future-demand weighting should use the configured weights."

## Phase 7 — Backend Tests

- Prompt 7.1 — Model tests
  - "Add tests for schedule expansion (offset/duration to week keys), and role demand hour calculations (percent of 36h * quantity)."

- Prompt 7.2 — API tests
  - "Add tests for CRUD, forecast correctness, aggregate demand, and convert action (project + deliverables created, assignments optional). Verify error paths and permissions."

## Phase 8 — Frontend Tests & Type Safety

- Prompt 8.1 — Type check & unit tests
  - "Run `npm run build` to ensure types pass. Add unit tests for the forecast utility and the Convert dialog mapper (if split into a pure function)."

- Prompt 8.2 — Playwright e2e
  - "Add e2e tests: create a template, create a future project from template, edit deliverables/roles, view forecast, toggle ‘Include Future’ on RoleCapacity and verify additional series appear, run conversion and verify landing on the new Project. Use MSW or test backend fixtures for determinism."

## Phase 9 — Delivery & Rollback

- Prompt 9.1 — Controlled rollout
  - "Deliver in two PRs:
    - PR A: Backend models + CRUD + forecast + frontend List/Form + templates (no analytics wiring).
    - PR B: Analytics overlay + Convert action and UI. This separation eases rollback.
    Document ‘How to verify’ with commands and sample flows."

- Prompt 9.2 — Monitoring
  - "After deploy, validate analytics performance impact with and without ‘Include Future’. Add lightweight throttles/caching if needed."

Acceptance Gates
- Future projects CRUD, templates, and forecast endpoints exist and are typed.
- List and Form pages function; templates apply cleanly and are editable.
- Analytics overlay toggles on/off cleanly and does not alter baseline by default.
- Convert action creates a real Project with deliverables; optional mapping to people works.
- All builds/tests pass; OpenAPI types are current.

---

Checklist Prompts (Quick Re‑feed)
- "Create FutureProject(+ Deliverable/RoleDemand) models, BDConfidence, and migrations; add helpers for 36h base hour calculations and schedule expansion."
- "Add DRF endpoints for CRUD, forecast, aggregate future demand, and convert; document via OpenAPI and regenerate frontend types."
- "Implement services in frontend for future projects, templates, and forecasts; align with existing API patterns."
- "Build Future Projects list and form pages with deliverables and role demand editors; add Settings page for templates."
- "Add ‘Include Future’ toggle to RoleCapacity; overlay future demand series; keep defaults off."
- "Add conversion UI to map generic roles to people; call convert endpoint and deep‑link to new project."
- "Add backend tests (models/services/APIs) and frontend unit/e2e tests with MSW fixtures; validate type checks and builds."
