# Role Capacity — Real‑Time Optimization Plan

This plan optimizes the Role Capacity report (`/reports/role-capacity`) while keeping results real‑time from current Assignments data (no reliance on weekly snapshots). It is organized into phases and prescriptive steps that can be re‑fed to the AI‑Agent.

Guidelines for every step:
- Use lean programming best practices: solve the root cause, keep code small and clear, avoid over‑engineering.
- No shortcuts, quick fixes, or band‑aid solutions. Preserve existing behavior and API contracts.
- Follow repository Editing Rules: use `apply_patch` for all code edits; preserve formatting and line endings; avoid bulk regex replacements; run frontend type check/build after changes.
- Coordinate backend and frontend carefully; regenerate OpenAPI and update typed client when the backend schema changes.

---

## Phase 0 — Benchmark & Guard Rails

1) Prompt — Add lightweight timing + logging to the endpoint
   - “Instrument `analytics_role_capacity` in `backend/assignments/views.py` to record start/stop time and log `duration_ms`, `dept_id`, `weeks`, and `role_ids` at INFO level (existing request logger format). Ensure no PII in logs. Keep code lean and behind a small helper to avoid duplication.”

2) Prompt — Capture a baseline
   - “Run the endpoint for representative departments with 4/8/12/16/20 weeks and several role selections. Record duration_ms ranges. Do not modify code yet.”

---

## Phase 1 — Micro‑Optimizations + Short‑TTL Server Cache (Fast Win)

3) Prompt — Optimize Python aggregation path (no behavior change)
   - “In `analytics_role_capacity`, strictly iterate only the requested week keys. For each assignment, access `wh.get(k)` for `k in wk_strs` (do NOT loop over every JSON key). Avoid per‑loop date parsing by comparing strings to `hire_date.isoformat()`; precompute `wk_strs` once. Keep `.only()` tight (`id`, `weekly_hours`, `person__id`, `person__role_id`, `person__hire_date`, `person__is_active`) and use `.iterator()` to stream.”

4) Prompt — Add short‑TTL response cache (60s is acceptable)
   - “Add a small caching layer for `analytics_role_capacity` using Django cache. Key: `rc:{dept}:{weeks}:{sorted(role_ids)}` (include mode later if added). TTL: 60s (acceptable staleness window). Serialize and store the final JSON payload. Add `?nocache=1` to bypass cache for staff. Keep code lean; protect with try/except so cache faults never fail the request. Optionally include a cheap department version (e.g., `MAX(updated_at)` for Assignments/People scoped to dept) in the cache key if it’s inexpensive; otherwise rely on TTL + nocache.”

5) Prompt — Bench and verify
   - “Re‑run benchmarks; confirm functional parity (numbers match pre‑opt results) and log the new duration_ms. Proceed if improvements are material; otherwise continue to Phase 2.”

---

## Phase 2 — Postgres JSONB Aggregation (Real‑Time, DB‑Driven)

Overview: Keep `Assignment.weekly_hours` as JSON but push aggregation into Postgres using JSONB + GIN + lateral expansion. Add a vendor‑aware fallback to Phase 1 logic for non‑Postgres (e.g., SQLite dev).

6) Prompt — Add DB vendor switch + skeleton
   - “Create `backend/assignments/analytics.py` with a function `compute_role_capacity(dept_id, week_keys, role_ids) -> dict`. Implement DB vendor detection (Postgres vs other). Wire `analytics_role_capacity` to call this function. Preserve response format.”

7) Prompt — Add indexes (migration) for Postgres JSONB path
   - “Create a Postgres‑only migration (guarded vendor check, `atomic=False`) to add a GIN index on `assignments_assignment.weekly_hours` using `jsonb_ops`. Statement: `CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_asn_weekly_hours_gin ON assignments_assignment USING GIN (weekly_hours jsonb_ops)`.
      Ensure a supporting index on `people_person(department_id, is_active)` and, if missing, indexes on `role_id` and `hire_date`. Provide safe no‑op operations for non‑Postgres vendors.”

8) Prompt — Implement Postgres SQL with JSONB + LATERAL
   - “In `assignments/analytics.py`, implement the Postgres branch using raw SQL with parameter binding:
     - Prefilter Assignments by department and `weekly_hours ?| ARRAY[:weekKeys]` (GIN index).
     - Expand only requested keys with `CROSS JOIN LATERAL jsonb_each_text(a.weekly_hours) AS j(key, value)` and `j.key = ANY(:weekKeys)`.
     - Join to People for role, dept, hire; apply hire gating without date parsing: `AND (p.hire_date IS NULL OR j.key >= p.hire_date::text)`.
     - Safe cast hours: `COALESCE(NULLIF(j.value,''), '0')::numeric` and clamp negatives to 0 via `GREATEST(0, ...)`.
     - Group by `j.key, p.role_id` and SUM hours.
     - Return a dense matrix aligned to `week_keys` and `role_ids`, defaulting to 0 where no rows exist.”

9) Prompt — Implement non‑Postgres fallback
   - “In the same function, detect DB vendor; for non‑Postgres (e.g., SQLite in CI/dev), call the optimized Phase‑1 Python path. Keep identical response shape. Add unit tests to assert parity.”

10) Prompt — OpenAPI + types
   - “No schema changes. Regenerate `backend/openapi.json` and `frontend/src/api/schema.ts` for safety. Ensure the endpoint description mentions vendor optimization but schema is unchanged.”

11) Prompt — Bench again
   - “Re‑measure duration_ms after migration and Postgres path. Capture improvements and document them in a short comment in `analytics.py`. Add INFO‑level slow‑path logging (>500ms) throttled to avoid noise.”

---

## Phase 3 — Normalized Real‑Time Fact Table (Gold Standard, Optional)

Purpose: Keep real‑time performance predictable by normalizing assignment weekly hours into a narrow table, updated on write.

12) Prompt — Model + migration for `assignment_week_hours`
   - “Add model `AssignmentWeekHours(assignment_id FK, person_id FK, role_id FK, department_id FK, week_start date, hours numeric, updated_at)` with unique `(assignment_id, week_start)`. Add indexes on `(department_id, week_start)` and `(role_id, week_start)`. Create migration.”

13) Prompt — Upsert path on write
   - “Add a focused service (e.g., `assignments/services/week_hours_sync.py`) that computes rows from `Assignment.weekly_hours` and bulk upserts into `AssignmentWeekHours`. Invoke it centrally from all write paths (Assignments serializer `.create`/`.update`, any bulk commands). Prefer explicit calls over signals; ensure operations run within the save transaction or via `transaction.on_commit`.”

14) Prompt — Backfill command
   - “Add a management command to backfill `AssignmentWeekHours` from existing assignments. Make it idempotent and chunked to avoid long transactions. Provide a `--department` filter. Optionally add a reconcile mode to compare sums vs JSON for a sample and log drift.”

15) Prompt — Endpoint switch (feature flag)
   - “Add a settings flag `ROLE_CAPACITY_SOURCE={python|jsonb|normalized}`. Update `compute_role_capacity` to use `normalized` when set; otherwise keep the Postgres/optimized‑Python branch. Ensure identical response shape.”

16) Prompt — Bench & document
   - “Profile with the normalized path and record duration_ms. Update a short docstring note with observed ranges.”

---

## Phase 4 — Frontend Coordination (No Contract Changes)

17) Prompt — Keep API responses stable
   - “Ensure `analytics_role_capacity` response stays `{ weekKeys: string[], roles: {id,name}[], series: {roleId,roleName,assigned[],capacity[]}[] }`. Do not change the schema or route. Regenerate OpenAPI + TypeScript types and confirm no diffs other than metadata.”

18) Prompt — Verify UI & UX
   - “Confirm `/reports/role-capacity` renders identically with the optimized backend. Test with role selections, timeframe changes, and empty‑selection (blank chart frame). No UI code changes required.”

---

## Phase 5 — Testing & Validation

19) Prompt — Unit tests (backend)
   - “Add tests for `compute_role_capacity` covering: hire‑date gating, multiple roles, multiple weeks, zero and positive hours, and parity between Python and Postgres paths (use vendor skip in CI if needed). Validate all branches produce identical series arrays.”

20) Prompt — Performance smoke tests (local)
   - “Seed a department with N assignments × M week keys and measure request time under each mode. Log results. Do not commit perf fixtures; document in test comments.”

21) Prompt — API contract tests
   - “Add a test invoking `analytics_role_capacity` and verifying schema (keys, types, enum of roles present). This guards regressions when refactoring internals.”

22) Prompt — Frontend build + typecheck
   - “After backend changes and OpenAPI regeneration, run `npm run build` in `frontend`. Fix any type errors. Do not loosen types; preserve strictness.”

---

## Phase 6 — Rollout & Monitoring

23) Prompt — Feature gates + safe rollout
   - “Default to Postgres JSONB aggregator if vendor is Postgres; otherwise use optimized Python. Keep the normalized table option behind a setting. Add a simple health check that pings the endpoint with a small dept and logs duration_ms.”

24) Prompt — Observability
   - “Ensure INFO logs include `duration_ms`, `dept_id`, `weeks`, and `roles_count`. In production, add a light metrics counter (if available) to track p95 latencies. Avoid verbose logs.”

---

### Acceptance Criteria
- Endpoint remains real‑time, using current `Assignment.weekly_hours` data.
- No change to API contract; the frontend requires no code changes beyond types regeneration.
- Postgres path shows material latency reduction vs baseline; Python path is measurably faster after Phase 1.
- Optional normalized table provides the best and most predictable performance where adopted.
