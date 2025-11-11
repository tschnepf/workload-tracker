# Workload Tracker Refactor Plan

A focused, actionable plan to improve performance, reduce duplication, raise code quality, and enhance maintainability across the Django backend and React/TypeScript frontend.

## Overview
- Stack: Django REST Framework backend (multiple apps) + React/Vite TypeScript frontend.
- Strengths: Clear app boundaries (people, projects, assignments, deliverables), tests in key apps, OpenAPI client adoption, ETag/conditional requests, backup/restore tooling.
- Main challenges:
  - Performance hotspots from per-row queries and repeated lookups in tight loops.
  - Duplication across utilities (Excel/CSV helpers, error mapping, API layers).
  - Encoding/character issues (mojibake) and historically mixed week-key logic (Sunday vs Monday).
  - Large, tightly coupled UI components that re-render heavily under load.

### Week Policy Standardization (Canonical: Sunday)
- Adopt Sunday-based week keys as the single canonical policy for all server and client logic.
- Transition mode: read both Monday- and Sunday-based keys for compatibility while writing Sunday keys only, then migrate and flip to strict Sunday reads.

---

## Section 1: Performance Review

- Backend N+1 and per-iteration queries
  - `backend/deliverables/services.py: PreDeliverableService.generate_pre_deliverables`
    - Issue: For each type, re-queries items and repeatedly calls `get_effective_settings` (multiple `.get()`s per type).
    - Fix:
      - Preload existing `PreDeliverableItem` for the deliverable into a dict keyed by `pre_deliverable_type_id` to avoid duplicate checks per type.
      - Batch-resolve effective settings: fetch project-specific and global settings once (two small queries), compute in-memory for all types.
      - Consider `select_for_update(of=("pre_items",))` during regenerate to avoid races; keep lock scope minimal and short-lived.
  - `backend/projects/utils/csv_handler.py: export_projects_to_csv`
    - Issue: Calls `queryset.get(id=...)` inside a loop (O(n) extra queries).
    - Fix: Pre-build a map `{id: obj}` from `queryset` or iterate original model instances alongside serializer data.
  - People utilization methods: `backend/people/models.py`
    - Issue: Overlapping Sunday/Monday variants and loopy per-assignment scans.
    - Fix: Standardize on Sunday policy; ensure `get_queryset()` for views uses `prefetch_related('assignments')`; share a single utility for week-key access (supports transition mode ±3 days lookup only during migration window).

- API-level correctness and low-risk bug fixes
  - People export filters: `backend/people/views.py` uses `role__icontains` where `role` is a ForeignKey. This likely errors or yields incorrect results.
    - Fix: Use `role__name__icontains` for text filters or `role_id` for exact ID filters. Add a small test.
  - CSV exporter field naming: ensure consistent camelCase↔snake_case mapping (avoid mixing serializer data and model fields ad hoc). Centralize mapping helpers.
  - Deliverables personal pre-items: avoid relying on undocumented/missing actions. Prefer `GET /api/deliverables/pre_deliverable_items/?mine_only=1&start=YYYY-MM-DD&end=YYYY-MM-DD`. If a convenience route is desired, add it with `@action` and tests.

- Query planning and indexing (DB)
  - Upcoming pre-deliverables for user: filter by `generated_date`, `is_active`, join through assignments.
    - Add/verify indexes:
      - `PreDeliverableItem(generated_date)` and partial index `WHERE is_active = TRUE`.
      - Covering FKs already exist; confirm indexes on `deliverable_id`, `pre_deliverable_type_id`, `deliverable.is_completed` if used in filters.
      - Assignment join paths: ensure indexes on `assignments(person_id, is_active)` and foreign keys to deliverables/projects.
  - Department descendant resolution caching is good; consider materialized path/CTE for very large trees.
  - Weekly hours JSON lookups happen in Python (not SQL); avoid DB-level JSON path scans. Keep JSON small and validated; do not introduce JSON-based indexes.

- Caching, ETag and payload size
  - People list uses `max(updated_at)` for ETag; keep serializer `.only(...)` minimal.
  - Add short-lived cache for heavy aggregates (heatmap/forecast) behind an env-configured TTL; invalidate via model signals.
  - Extend conditional GET (ETag + Last-Modified) to other heavy list endpoints (projects, assignments) to reduce payloads and server work.
  - ETag policy: reserve `ETagConditionalMixin` for detail endpoints; compute ETag manually for aggregate/snapshot endpoints (dashboards, heatmaps) using stable inputs (e.g., max(updated_at), counts, parameters) and return 304 on match.

- Frontend rendering and network
  - Assignment grid `frontend/src/pages/Assignments/AssignmentGrid.tsx`
    - Virtualize rows/columns (e.g., `@tanstack/react-virtual`) for large teams/weeks.
    - Stabilize props and callbacks; move inline closures out of render; memoize heavy derived data (week headers, color classification).
  - Network coalescing
    - Consolidate on the typed `apiClient` and shared `etagStore`; remove duplicate error/refresh logic in legacy fetch utilities.

- Profiling targets
  - Backend: Django Silk or debug toolbar sampling on People list, Assignments grid data, and Deliverables upcoming; run `test_aggregation_performance` management command.
  - DB: `EXPLAIN (ANALYZE, BUFFERS)` on upcoming pre-deliverables and project list with filters.
  - Frontend: Lighthouse + React Profiler on grid interactions.
  - Pre-deliverables upcoming query: consider `.only()`/`.values()` to fetch only needed fields in `get_upcoming_for_user` for leaner payloads.

---

## Section 2: Duplication Analysis

- Excel/CSV helpers
  - `backend/people/utils/excel_handler.py` and `backend/projects/utils/excel_handler.py` duplicate `_write_excel_headers`, `_auto_fit_columns`, `_create_excel_response`.
  - `backend/people/utils/csv_handler.py` and `backend/projects/utils/csv_handler.py` share patterns.
  - Action: Extract reusable helpers into `backend/core/utils/excel.py` and `backend/core/utils/csv.py`; refactor call sites.

- Error mapping and API client logic (frontend)
  - `frontend/src/api/client.ts` and `frontend/src/services/api.ts` both implement `friendlyErrorMessage`, token refresh, and ETag storage.
  - Action: Centralize in `frontend/src/api/errors.ts` and ensure a single HTTP client (`apiClient`) is canonical; migrate services in phases.

- Week computation and utilization logic (backend)
  - Multiple Sunday/Monday variants in `backend/people/models.py` with overlapping responsibilities.
  - Action: Consolidate into a single Sunday-only implementation via helpers in `core/week_utils.py`; maintain a temporary transition layer that reads both key styles.

- Stray/broken files
  - `frontend/src/pages/Assignments/AssignmentGrid.tsx.broken`, `.backup`, `return-section.txt` look like leftovers.
  - Action: Remove or move to `docs/experiments/` with context.

---

## Section 3: Code Quality & Error Reduction

- Encoding and mojibake
  - Replacement characters appear in comments/strings (e.g., "±3 days" mangled).
  - Action: Enforce UTF-8 via `.editorconfig`; one-time cleanup to normalize files; add a CI lint to detect non-UTF-8 sequences.

- Validation constraints
  - `PreDeliverableType.default_days_before` min=1 but effective settings fallback sometimes uses 0. Clarify that 0 means "same day" or disallow it consistently.
  - Action: Choose a single rule and enforce it end-to-end. Recommendation: allow 0 to mean "same day" (align with working-day utils), then:
    - Update `PreDeliverableType.default_days_before` validator to allow 0 (migration),
    - Ensure all serializers and services treat 0 consistently,
    - Or, if keeping ≥1, coerce values <1 to 1 at validation boundaries.

- Weekly hours integrity (Sunday canonical)
  - Add validation utility to assert weekly_hours keys are valid ISO dates that fall on Sunday; warn or auto-correct during transition window.
  - Add a management command to report and optionally fix non-Sunday keys.
  - Validate JSON shape: keys must be ISO date strings; values numeric ≥ 0; reject invalid payloads early.

- Bulk write safety
  - Moving to `bulk_update` for global settings may bypass signals; confirm no listeners rely on `save()` side effects.
  - Move any business-critical signal logic into service-layer functions and call side effects explicitly (auditing, cache invalidation, denormalized counters) around bulk operations.
  - If batch sizes are small, consider chunked `save(update_fields=...)` to reuse existing signal flows; otherwise keep bulk and compensate with explicit side effects.
  - If using a history/audit library with bulk support, prefer its bulk helpers to retain history.
  
- Database constraints
  - Add DB check constraints to `Deliverable` to enforce completion consistency (e.g., `is_completed = false OR completed_date IS NOT NULL`).

- Concurrency
  - Use `select_for_update()` narrowly with timeouts for regenerate/update flows; avoid deadlocks by ordering queries consistently.
  - Where uniqueness is enforced by DB (e.g., `PreDeliverableItem` unique_together), rely on `get_or_create` and handle `IntegrityError` instead of prechecking to reduce race risks.

- Typing and linting
  - Frontend: incrementally enable TS `strict` (start with `src/api` and `src/components/ui`), and add eslint rules like `no-floating-promises`, no unused vars.
  - Backend: introduce mypy for `backend/core`, `deliverables`, `people`; add type hints to service modules.

- Tests to add/strengthen
  - PreDeliverableService: settings precedence, duplicate avoidance.
  - People utilization: Sunday policy parity and edge cases (missing keys, weekend offsets).
  - Projects CSV exporter: zero extra queries; correct counts.

---

## Section 4: Maintainability Improvements

- Modularize helpers
  - Create `backend/core/utils/{excel.py,csv.py,dates.py}`; keep them pure (no Django model imports) to avoid cycles; add docstrings and basic tests.
  - Domain-specific helpers (that touch Django models) remain within their app modules/services to avoid import cycles.

- Week keys and dates (Sunday canonical)
  - Extend `core/week_utils.py` with canonical Sunday helpers and a transition-aware `get_week_value(weekly_hours, sunday_date, window=3)` function used wherever hours are read.
  - Document the policy and how to migrate data; add a management command for re-keying.

- API surface consistency (frontend)
  - Collapse to one client; keep ETag logic in `etagStore` and error mapping in `api/errors.ts`.
  - Codemod all call-sites to use the typed `apiClient` in a single PR; ensure compile/tests pass; keep an optional single rollback flag if desired (no dual compatibility layer).
  - Replace ad-hoc `console.log` with `debug()` util gated by env.

- Component structure
  - Split `AssignmentGrid.tsx` into: Toolbar, WeekHeader, PersonRow (virtualized), CellEditor.
  - Move deliverable color/classification to a tiny `lib/colors.ts`.
  - Virtualization a11y acceptance: preserve focus/keyboard navigation parity; maintain ARIA roles and screen-reader announcements; enable only after profiling shows measurable benefit; keep pagination patterns as-is.

- Repository hygiene
  - Remove `.broken`/`.backup` files; add `docs/experiments/` for prototypes.
  - Remove committed `node_modules-bak/` folders and similar vendor snapshots from the repo; add to `.gitignore` to reduce repo size and churn.
  - Add pre-commit hooks: black/isort (Python), eslint/prettier (TS), whitespace/encoding check.

---

## Section 5: Prioritized Action Plan

- Quick Wins (1–3 days)
  - Backend: Optimize `generate_pre_deliverables` (preload existing items, batch settings resolution); add unit tests.
  - Frontend: Centralize `friendlyErrorMessage` and unify ETag/token logic; remove stray `.broken`/`.backup` files.
  - Encoding: Add `.editorconfig` and normalize UTF-8; fix mojibake in affected files.
  - Week Policy – Phase 0: Introduce Sunday canonical helpers and transition read mode (read both, write Sunday). Ship behind a flag defaulting to ON.
  - Bug fix: Correct `role__icontains` to `role__name__icontains` (or ID-based filter) in People export/listing filters.
  - CI Schema Drift Gate: add GH Actions job to regenerate Spectacular schema and openapi-typescript types; fail on diff.

- Medium Term (1–2 weeks)
  - Week Policy – Phase 1: Add management command to re-key `weekly_hours` from mixed keys to Sunday; run in staging, then production with backups.
  - Week Policy – Phase 2: Flip to strict Sunday reads after validating parity metrics; keep fallback for one release behind a flag.
  - Extract Excel/CSV utilities to `core/utils`; refactor people/projects import/export to use them; introduce streaming for large exports.
  - DB Indexes: Add `PreDeliverableItem(generated_date)` and partial `is_active` index; verify assignment join indexes; validate with `EXPLAIN` snapshots.
  - Typing: mypy on targeted backend packages; TS `strict` on `src/api` + `src/components/ui`.
  - Weekly hours validation: add Sunday-key validator, management command to report/fix non-Sunday keys; wire into CI as a non-blocking check initially.
  - Frontend grid: switch week header/utils and any Monday-based assumptions to Sunday-only; update fixtures/tests.

- Long Term (3–6 weeks)
  - Virtualize Assignment grid; add memoized selectors; a11y testing; ship behind `VIRTUALIZED_GRID` flag.
  - Migrate all services to typed `apiClient`; retire legacy fetch paths; codemod where safe.
  - Caching: Expand for aggregates with invalidation via signals; monitor hit ratios and 412 rates.
  - Settings cleanup: Consolidate duplicated `FEATURES` definitions and related settings in `backend/config/settings.py` into a single canonical section; document flags.

---

## Section 6: Risk Assessment

- Week policy change (Sunday canonical)
  - Risk: Numbers change due to week alignment; missing keys in historical data.
  - Mitigation: Transition read mode (read both ±3 days), management command to re-key, feature flag to disable; compare metrics in logs (parity report) before flipping.

- Behavior changes in pre-deliverable generation
  - Risk: Different effective settings resolution may alter generated dates.
  - Mitigation: Snapshot tests on seeded dataset; feature-flag rollout; monitor change counts.

- Frontend virtualization
  - Risk: Keyboard/ARIA regressions.
  - Mitigation: Add a11y tests; behind `VIRTUALIZED_GRID` flag; gradual rollout.

- Index and migration timing
  - Risk: Locks or downtime if run improperly.
  - Mitigation: Use Postgres `CONCURRENTLY` for index creation via `RunSQL`; schedule off-peak; separate schema and data migrations.

---

## Operational Details

- CI Schema Drift Gate
  - Canonical artifacts: commit backend schema to `docs/openapi.json` and frontend types to `frontend/src/api/schema.ts`.
  - Generation commands:
    - Backend: `python backend/manage.py spectacular --file docs/openapi.json`
    - Frontend: `npx openapi-typescript docs/openapi.json -o frontend/src/api/schema.ts`
  - GitHub Actions job:
    - Setup Python and Node (pin versions), install deps, run both generation commands.
    - `git diff --exit-code -- docs/openapi.json frontend/src/api/schema.ts` to fail on drift.
  - Determinism: pin `drf-spectacular` and `openapi-typescript`; keep schema stable under CI env (no timestamps/flags in schema output).
  - Acceptance: merges block if either artifact differs from committed versions.
  - Normalization: sort JSON keys and strip env-specific fields to avoid false positives, for example:
    - `jq -S . docs/openapi.json > docs/openapi.json.tmp && mv docs/openapi.json.tmp docs/openapi.json`
    - If needed, sanitize: `jq 'del(.servers)' docs/openapi.json > tmp && mv tmp docs/openapi.json`
  - Stable settings: generate against a fixed CI settings module (no feature-flag-dependent schema differences).

- Compatibility Guardrails (backend ↔ frontend)
  - Single source of truth for names: keep `backend/core/fields.py` registries authoritative; new/changed fields must be added there first.
  - Serializer policy: prefer `AutoMappedSerializer` or explicit `source=` mappings that reflect the registry; avoid ad‑hoc field renames.
  - OpenAPI contract: when serializers change, regenerate and commit OpenAPI (`spectacular`) and `frontend/src/api/schema.ts` types; do not hand‑edit generated types.
  - CI contract check: fail CI if the generated OpenAPI or TypeScript schema differs from what’s committed (drift = error).
  - Client migration: consolidate on `apiClient` and shared `etagStore`; ensure responses keep camelCase keys. Any response shape changes are feature‑flagged and reflected in schema/types.
  - Smoke tests: maintain a minimal serializer key test suite (people, projects, assignments) that validates camelCase keys and critical fields.

- Feature Flags (env-driven)
  - `WEEK_KEYS_CANONICAL`: `sunday` | `monday` (default `sunday`).
  - `WEEK_KEYS_TRANSITION_READ_BOTH`: `true|false` (default `true` initially).
  - `VIRTUALIZED_GRID`: `true|false` (default `false`).
  - `API_CLIENT_V2`: `true|false` to gate typed client adoption per slice.
  - Management: centralize flags in a single `settings.FEATURES` block (backend) and `src/lib/flags.ts` (frontend). Avoid duplicate definitions in settings.
  - Capabilities: prefer the existing `/api/capabilities/` endpoint to advertise server capabilities to the client; do not add a new `/api/config/features` route.
  - Lifecycle: each flag defines owner, purpose, default, and sunset criteria/date; add a "flag cleanup" checklist to PRs introducing flags.
  - Operations: log flag states on startup (once), avoid per-request logs; remove flags promptly after rollout.

- Streaming/Async Export Policy
  - If export row count > configurable threshold (e.g., 10k), enqueue Celery task and return 202 with job links. Otherwise stream via `StreamingHttpResponse` to lower memory.

- CI/Quality Gates
  - Run mypy on targeted packages, eslint with strict rules on selected folders, UTF-8/mojibake linter, and checks for stray `.backup/.broken` files and vendor folders like `node_modules-bak/`.
  - Add a lint to detect broad bare `except:` usages and enforce explicit exception types in new/changed code.
  - Contract drift check: generate OpenAPI + TS types in CI; fail on diff to guard against snake_case/camelCase mismatches.
  - Python linting: add `ruff` with focused rules (imports, bare excepts, complexity) alongside black/isort in pre-commit and CI.

- Measurement Plan
  - Capture baselines and success criteria for hot endpoints:
    - P95 latency and requests/sec; alert if P95 > 700ms for 5 minutes or error rate > 1%.
    - DB queries/request (DEBUG sampling) and statement timeouts.
    - ETag/optimistic concurrency: 412 rate; alert if > 2% sustained (excluding conflict-heavy endpoints by route).
    - Aggregate cache hit ratio (target > 60% on heatmap/forecast) and payload sizes.
    - Pre-deliverables: daily counts of created/updated/deleted; alert on spikes > 3x weekly average.
    - DB health: lock waits/blocked queries; alert if above baseline by 2x.
    - Frontend (Sentry): error rate and slow transactions on grid; alert if > 2x baseline.
    - Frontend (custom): track and review `personal_dashboard_mount_ms` and other route mount timings; aim for clear improvement on warm navigations via prefetch and caching.
  - Require before/after measurements for PRs that change query plans, caching, or rendering.

---

## Concrete Change List (Initial PRs)

- PR0: Week policy standardization (Sunday canonical)
  - Add helpers and transition read mode; add management command to re-key `weekly_hours`; add parity logging; feature flags; tests.
  - Rollback: re-enable transition read mode via flag; restore DB snapshot if needed; provide reverse re-key if feasible.

- PR1: Backend pre-deliverables perf
  - Batch effective settings + preload existing items; narrow transaction scopes; tests.

- PR2: Frontend API consolidation
  - Move `friendlyErrorMessage` to `src/api/errors.ts`; align on `apiClient` and `etagStore`; remove duplicates. Codemod all service call-sites to `apiClient` in a single PR; optional single rollback flag.
  - Rollback: revert the codemod PR; no compatibility layer maintained.
\n+- PR2.1: Feature flags unification and capabilities
  - Deduplicate `settings.FEATURES` into a single block; add `PERSONAL_DASHBOARD` with env default. Log FEATURES once at startup (DEBUG-safe).
  - On the client, add `PERSONAL_DASHBOARD` to `src/lib/flags.ts`; gate route and sidebar; when disabled, redirect `/my-work` to `/dashboard`.
  - Prefer `/api/capabilities/` for capability advertisement; do not add a new `/api/config/features` route.
\n+- PR2.2: ETag policy standardization
  - Audit aggregate endpoints and standardize manual ETag computation + 304 behavior. Document the policy (detail vs aggregate) and add targeted tests.

- PR3: Utils extraction
  - Add `core/utils/{excel.py,csv.py,dates.py}`; refactor people/projects handlers; add docstrings/tests.
\n+- PR3.1: Shared aggregates (optional, when reuse exists)
  - If team and personal dashboards share business rules, extract minimal helpers to `backend/core/aggregates.py` and cover them with unit tests used by both endpoints.

- PR4: Encoding + hygiene
  - Add `.editorconfig`, clean mojibake (audit user-facing strings and docs), remove stray files, add pre-commit hooks and CI checks.

- PR5: Indexes and EXPLAIN baselines
  - Add/verify indexes; attach EXPLAIN (ANALYZE) screenshots/numbers in PR; implement using `CREATE INDEX CONCURRENTLY`/`DROP INDEX CONCURRENTLY` via `RunSQL`, with `atomic = False` migration; test on staging-sized data. Use descriptive names (e.g., `idx_preitem_gen_date_active`).
  - Rollback: `DROP INDEX CONCURRENTLY <name>` migration; decouple from schema changes.
\n+- PR5.1: Deliverables pre-items permissions
  - Update `PreDeliverableItemViewSet` to allow completion by staff/managers or by users assigned to the parent deliverable; return 403 otherwise. Add tests for assigned/non-assigned behavior. Keep list filtering via `mine_only` for personal views.

- PR6: Sunday integrity and repo hygiene
  - Add weekly_hours Sunday-key validator and management command; fix People role filter; remove `node_modules-bak/` directories and update `.gitignore`.
  - Rollback: disable validator enforcement via flag temporarily; re-enable transition read mode if regressions arise.

- PR7: CI schema drift gate
  - Add GitHub Actions workflow to regenerate DRF Spectacular schema and frontend TS types; fail on diff to prevent contract drift.
\n+- PR7.1: OpenAPI + TS regeneration discipline
  - Document the sequence: update backend views/serializers → regenerate `backend/openapi.json` → update `frontend/src/api/schema.src.json` → regenerate `frontend/src/api/schema.ts`. Commit all artifacts together.

- PR8: Ops hardening and logging
  - Add stale-lock TTL checks and admin override for backup/restore locks; verify `/health` and `/readiness` remain lightweight and allow-listed; ensure production security flags (HSTS, cookie flags, CSRF trusted origins, CSP) are enforced when `DEBUG=False`.
  - Standardize structured logging fields across middleware/services (request_id, user_id, path, duration_ms); on the frontend, capture `X-Request-ID` and attach to ApiError or Sentry breadcrumb for correlation.
\n+- PR9: Route prefetch hygiene
  - Ensure top-level routes (e.g., `/my-work`) are covered by `routes/prefetch.ts` importer mapping and optional `prefetchData.ts` hooks, gated by flags and connection heuristics.
\n+- PR10: Telemetry additions
  - Track `personal_dashboard_mount_ms` on client mount; validate reduced rerenders with react-query `staleTime` (~30s) on non-critical personal data.

This plan prioritizes safe migration to Sunday-based week keys, measurable performance wins, reduced duplication, and a smoother developer experience with focused utilities and stronger typing.
