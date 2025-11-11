# Weekly Assignment Snapshots – Implementation Plan (Updated)
Note: Phase classification rule clarity
- Attribute a week’s hours to the next scheduled deliverable for that project (forward selection).
- When the project status is `active_ca`, treat all weeks as `ca` even if no next deliverable exists.
This plan implements immutable, weekly snapshots of assigned hours and explicit assignment lifecycle events so you can: (a) preserve forecast “as‑of” history, (b) produce experience reports by client/project/role, and (c) see when people joined/left/moved roles on a project and in which deliverable phase that occurred. All prompts are prescriptive and lean: small focused steps, strong typing, server‑side aggregation, no shortcuts/band‑aids, and strict backend/frontend coordination.
## Phase 0 — Alignment & Guardrails
Prompt 0.1 — Set guardrails and conventions
- Enforce lean code: no dead code, no speculative flags, minimal surface area.
- Reuse shared utilities for week keys (Sunday), department scoping, client labels, and deliverable classification. Do not duplicate logic.
- Any schema/API change MUST include synchronized frontend types/hooks in the same phase. No partial rollouts.
- All new writes idempotent; all reads server‑aggregated; tests accompany changes.
## Phase 1 — Data Model & Migration
Prompt 1.1 — Add WeeklyAssignmentSnapshot model and migration
- Create `WeeklyAssignmentSnapshot` in `assignments` with:
  - `week_start: date` (Sunday ISO date key; UTC)
  - `person: FK people.Person` (nullable FK allowed, see denorms below)
  - `project: FK projects.Project` (nullable FK allowed)
  - `role_on_project_id: IntegerField(null=True)` (denormalized ID if present)
  - `department_id: IntegerField(null=True)` (denormalized from Person at capture time)
  - `project_status: CharField(max_length=20, choices=ProjectStatus.choices)` (MUST mirror `Project.status` choices defined in backend/projects/models.py:13; implement shared `TextChoices` in a neutral module such as `backend/core/choices.py` to avoid duplication/import cycles)
  - `deliverable_phase: CharField(max_length=20, choices=('sd','dd','ifp','masterplan','bulletins','ca','other'))` (use a shared enum `DeliverablePhase` so analytics and snapshots use the same vocabulary)
  - `hours: FloatField` (>= 0)
  - `captured_at: DateTimeField(auto_now_add=True)`
  - `updated_at: DateTimeField(auto_now=True)` (required for correct ETag/Last-Modified behavior on updates)
  - `source: CharField(max_length=20, default='assigned', choices=('assigned','assigned_backfill'))` (controlled vocabulary; mark backfilled rows explicitly)
  - Denormalized resilience fields: `person_name: CharField`, `project_name: CharField`, `client: CharField`
  - Unique constraint: `(person_id, project_id, role_on_project_id, week_start, source)`
  - Controlled vocabularies: centralize `ProjectStatus`, `DeliverablePhase`, and `SnapshotSource` as `TextChoices` for reuse across models/serializers; if not refactoring `Project` immediately, values MUST remain identical to `Project.status`.
- Indexes: `(week_start)`, `(department_id, week_start)`, `(client, week_start)`, `(person_id, week_start)`, `(project_id, role_on_project_id, week_start)`, `(client, person_id)`
- Query shape guidance: place equality filters first (e.g., `department_id` or `project_id` + `role_on_project_id`), then the `week_start` range to fully leverage the composite indexes; verify with EXPLAIN to avoid bitmap merges on large windows.
- FK behavior: keep FKs, but allow SET_NULL; denorm fields ensure historical rows remain readable if upstream rows are removed.
Prompt 1.2 — Add AssignmentMembershipEvent model and migration
- Purpose: record immutable weekly lifecycle events for join/leave/role‑change with phase at event time.
- Fields:
  - `week_start: date` (Sunday)
  - `person: FK people.Person` (nullable) + `person_name`
  - `project: FK projects.Project` (nullable) + `project_name` + `client`
  - `role_on_project_id: IntegerField(null=True)`
  - `event_type: CharField(max_length=20, choices=('joined','left'))` (events are based on assignment membership, not hours)
  - `deliverable_phase: CharField` (same choices as snapshots)
  - `hours_before: FloatField` (>=0)
  - `hours_after: FloatField` (>=0)
  - `captured_at: DateTimeField(auto_now_add=True)`
  - `updated_at: DateTimeField(auto_now=True)`
- Unique constraint: `(person_id, project_id, role_on_project_id, event_type, week_start)`
- Indexes: `(person_id, project_id, week_start)`, `(client, week_start)`
Prompt 1.3 — Admin + serializer scaffolding
- Register both models in Django admin as read‑only lists for sanity.
- Add minimal read‑only DRF serializers to support upcoming endpoints.
## Phase 2 — Weekly Snapshot Writer (Idempotent) + Event Detection
Prompt 2.1 — Extract shared deliverable classification helper
- Move the phase derivation logic (forward selection to next deliverable, Monday exception, Active‑CA rule) into a single helper module and reuse it in analytics + snapshot writer. Add unit tests for edge cases.
 - Helper MUST return `DeliverablePhase` enum values (not free‑form strings) to preserve controlled vocabulary in snapshots and analytics.
Prompt 2.2 — Implement `write_weekly_assignment_snapshots(week_start)`
- Location: `backend/assignments/snapshot_service.py`
- Behavior:
  - Normalize `week_start` to Sunday (UTC) via existing week utils.
  - Query all active Assignments. For snapshot rows, include only entries where the computed `hours_for_week > 0` to keep the table compact. Use `core.week_utils.get_week_value(...)` to tolerate legacy non‑Sunday keys.
  - Derive denorm fields and `deliverable_phase` using the shared helper.
  - Upsert one `WeeklyAssignmentSnapshot` per `(person, project, role, week_start, source='assigned')` with hours rounded to 2 decimals. Use batched, transactional upserts.
  - On conflict, update fields (`hours`, `project_status`, `deliverable_phase`, denorms) and always touch `updated_at`.
  - Return summary: examined, inserted, updated, skipped.
Note: Week key policy
- Going forward, week keys are Sunday-only for new data; no legacy tolerance required. If needed for transitional scenarios, keep a tolerant lookup behind a feature flag.
 - No Monday exceptions; all classification and snapshots use Sunday-based week boundaries.
Note: Upserts (safe update-or-insert)
- Applies to both snapshot rows and event rows; prefer Postgres `ON CONFLICT DO UPDATE` (or Django `bulk_create(update_conflicts=True)`), otherwise use `update_or_create` in batches to avoid duplicates.
Note: Writer concurrency and batching
- Acquire a Postgres advisory lock per `week_start` to prevent concurrent writers for the same week.
- Advisory lock behavior: per-week lock with key `weekly_snapshot:<YYYY-MM-DD>` (the Sunday week).
- If lock cannot be acquired, log a clear message and exit with a specific "skipped_due_to_lock" code (not a failure).
- Jobs for different weeks may run concurrently; only the same week is mutually exclusive.
- Lock is held only while the writer runs and is released on completion (or error).
- Process assignments in bounded batches (e.g., 5k–10k) and commit upserts per batch to keep transactions fast and memory predictable.
Note: Shared choices and helpers
- Add `backend/core/choices.py` with shared `TextChoices` for `ProjectStatus`, `DeliverablePhase`, and `SnapshotSource`; reference these from models/serializers and APIs to prevent drift.
- Add `backend/core/departments.py` with a small helper (e.g., `get_descendant_department_ids(root_id)`) to implement include-children BFS once and reuse across endpoints.
- Add `backend/core/deliverable_phase.py` with the classification helper used by both analytics and the snapshot writer; refactor existing analytics to import it.
 - Expose enum choices in serializers/OpenAPI so frontend types lock to the allowed values.
  - Single source of truth: both analytics endpoints and the weekly snapshot writer MUST import and use this helper.
  - Test checklist: cover (a) no deliverables, (b) multiple deliverables in the same week, (c) `active_ca` override.
Note: API hardening
- Add moderate throttling for new snapshot/event read endpoints and build stable cache keys (include department and date range).
- Extract department scoping (include_children BFS) into a shared helper and reuse across endpoints.
 - Throttle scope name: `snapshots` with a moderate default (e.g., 300/min per user), tunable via environment.
 - ETag/Last-Modified: every new endpoint must include validators based on `max(updated_at)` of included rows and incorporate department + date range into cache keys.
Note: Events API pagination
- Make membership events endpoints paginated and sorted (e.g., by `week_start`, `person_id`, `project_id`) for stable, resumable reads.
 - Default page size: 100 (tunable via environment). Document the stable sort so clients can resume reliably.
Note: Membership and roles semantics (authoritative)
- Join = assignment is created (effective week = Sunday of creation), regardless of hours. Hours do not trigger joins.
- Leave = assignment is removed/deactivated, or the project is marked `completed` that week. Zero hours do not imply leave.
- Coverage vs membership: coverageBlocks reflect hours only; it is expected to show gaps when a member has 0 hours.
- Weekly role state = role at snapshot time (Sunday). Intra-week role flips are ignored; only changes across Sundays may produce a derived roleChanged.
- roleChanged is derived only when exactly one role is replaced by one other role across adjacent weeks for the same person/project; null roles are excluded from pairing.
- Start dates are not retroactively required; effective start uses the assignment creation time. If `start_date` is present, it can refine the calculation, but it is not required.
- Role may be null; treat null as an 'unspecified' bucket in groupings. The unique constraint permits null roles; queries should handle this explicitly.
Note: API hardening
- Add moderate throttling for new snapshot/event read endpoints and build stable cache keys (include department and date range).
- Extract department scoping (include_children BFS) into a shared helper and reuse across endpoints.
Note: Scheduling (UTC)
- Standardize on UTC for any scheduler (Celery Beat or OS cron) so Sunday week boundaries and cache keys remain consistent.
 - Create snapshots on Sunday morning UTC (e.g., 06:00 UTC) to capture what the previous week looked like at that time; pass `--week` as the prior Sunday.
Note: Week-range execution
- Support running the writer across a span of Sundays with `--start YYYY-MM-DD --end YYYY-MM-DD` to simplify controlled re-runs.
Prompt 2.3 — Emit `AssignmentMembershipEvent` rows via diffs
- Build membership sets for prior and current week from Assignments (not snapshot rows).
- Compute set diffs between prior and current week membership keys `(person_id, project_id, role_on_project_ref_id)`:
  - If prior hours == 0 and current > 0 → emit `joined` (hours_before=0, hours_after=current, phase=current week’s phase).
  - If prior hours > 0 and current == 0 → emit `left` (hours_before=prior, hours_after=0, phase=current week’s phase).
  - Role change is represented as paired events: `(role A) left` and `(role B) joined` in the same week based on zero/nonzero transitions per role key.
- Idempotency: upsert events by unique key; never duplicate on re‑runs.
- On conflict, do nothing (keep first capture consistent with Sunday “as‑of” snapshots; events are not retroactively edited).
- Batch inserts and wrap in a transaction. Return event counts alongside snapshot counts.
 - First live run note: without a prior week, all current memberships will emit `joined`; this is expected and acceptable.
Note (authoritative update to 2.3): Joined/Left are based on assignment membership, not hours
- Membership for a week = an Assignment exists with `is_active=True` and, if `start_date`/`end_date` are set, the week overlaps that range. Hours may be zero.
- Compute set diffs between prior and current week membership keys `(person_id, project_id, role_on_project_ref_id)`:
  - `joined`: present in current set, absent in prior. `hours_before` from prior week (0 if none); `hours_after` from current week (0 allowed). Phase from current week classification.
  - `left`: present in prior set, absent in current. `hours_before` from prior week (0 allowed); `hours_after = 0`. Phase from current week classification.
- Do not use hours thresholds to determine membership; hours only annotate events.
Role change pairing (derived in read APIs)
- When exactly one role is removed and exactly one role is added for the same person and project within the same week, surface a computed `roleChanged` item with `week_start`, `roleFromId`, and `roleToId`.
- Underlying stored events remain the atomic `joined`/`left` rows to keep writes simple and idempotent; pairing happens server‑side when shaping responses.
- Exclude weeks with multiple role additions/removals; only pair one‑to‑one replacements.
Prompt 2.4 — Add management command
- Command: `capture_weekly_assignment_snapshots --week YYYY-MM-DD`
- Default to last Sunday; prints JSON summary; non‑zero exit on error.
Prompt 2.5 — Scheduling (documentation only)
- Document Celery beat or Cron (e.g., Sundays 06:00 UTC with `--week` set to the prior Sunday) to reflect the prior week "as-of" that Sunday morning.
## Phase 3 — Read APIs (Experience & Timelines)
Prompt 3.1 — Experience by Client (person‑centric)
- Add action `experience_by_client` with params: `client?`, `department?`, `include_children? (0|1)`, `start?`, `end?`, `min_weeks?`.
- Response: list of people with totals (weeks, hours, projectsCount) and role aggregates (weeks, hours). Server‑side aggregation only.
Prompt 3.2 — Person Experience Profile
- Add action `person_experience_profile` with params: `person (required)`, `start?`, `end?`.
- Response: breakdown by client and by project, with role and phase aggregates, plus `eventsCount`.
Prompt 3.3 — PersonProjectTimeline (events + coverage)
- Add action `person_project_timeline` with params: `person`, `project`, `start?`, `end?`.
 - Response: `{ weeksSummary, coverageBlocks: [{roleId,start,end,weeks,hours}], events: [{week_start,event_type,phase,hours_before,hours_after}], roleChanges: [{week_start,roleFromId,roleToId}] }`.
- Compute `coverageBlocks` from consecutive non‑zero snapshot rows grouped by role.
Prompt 3.4 — ProjectStaffingTimeline
- Add action `project_staffing_timeline` with params: `project`, `start?`, `end?`.
- Response: per person/role weeks+hours and event arrays; aggregates per role (peopleCount, weeks, hours).
Prompt 3.5 — OpenAPI + caching
- Update schemas; add ETag/Last‑Modified based on `max(updated_at)` for included snapshot/event rows; include department scope + date range in cache keys.
## Phase 4 — Frontend Hooks & Cards
Prompt 4.1 — Types and services
- Run `npm run openapi:types`. Add new typed fetchers in `frontend/src/services/experienceApi.ts` for all endpoints in Phase 3.
Prompt 4.2 — Hooks
- Implement:
  - `useClientExperienceData({ client?, departmentId?, includeChildren?, start?, end? })`
  - `usePersonExperienceProfile({ personId, start?, end? })`
  - `usePersonProjectTimeline({ personId, projectId, start?, end? })`
  - `useProjectStaffingTimeline({ projectId, start?, end? })`
- Hooks return `{loading, error, data}`; no client‑side summing beyond simple display helpers.
Prompt 4.3 — UI (lean SVG)
- Client Experience Card: compact table of top people with role chips; link to person profile drawer.
- Person Profile Drawer: client/project list + role/phase tags + events inline.
- Project Staffing Timeline Card: per‑role aggregates + people list with join/leave markers on a weekly strip.
- Follow existing visual language; no new chart libraries.
## Phase 5 — Backfill (Optional, Controlled)
Prompt 5.1 — Backfill snapshots and events
- Command: `backfill_weekly_assignment_snapshots --weeks N`
- Reconstruct snapshots for past N Sundays from `Assignment.weekly_hours` (approximate, not true “as‑of”).
- Source indicator only: set `source='assigned_backfill'` on backfilled rows; do not add a separate `reconstructed:boolean` flag.
- Events: do not emit by default during backfill (use `--emit-events=1` to opt in). When enabled, compute membership-based joins/leaves across backfilled weeks.
- Refuse to overwrite existing rows unless `--force` is provided.
## Phase 6 — Testing & Validation
Prompt 6.1 — Unit tests for writer + events
- Verify per person–project–role upserts, idempotency, rounding, and event emission for zero→nonzero (joined), nonzero→zero (left), and role changes (paired events) with correct phase using the shared helper.
Prompt 6.2 — API tests
- Validate department scoping w/ and w/o children; date windowing; ordering; correctness of aggregates; and ETag/Last‑Modified 304 behavior.
Prompt 6.3 — Performance sanity
- Seed ~10k snapshot rows; typical queries <200ms locally with proposed indexes; weekly writer completes swiftly in a transaction with batched upserts.
Prompt 6.4 — Frontend integration tests (light)
- Mock API responses to assert hooks state and that cards/drawers render totals, coverage, and events correctly with accessible labels.
## Phase 7 — Observability & Docs
Prompt 7.1 — Metrics & runbook
- Log snapshot job summaries (examined/written/updated/skipped, eventsWritten, duration).
- Include skipped-by-reason counts (e.g., missing project FK, missing person FK, unparsable hours) to speed triage.
- Include `lockAcquired` (boolean) and `batchesProcessed` in run summaries.
- Document scheduling, re‑runs for specific weeks, and retention policy (e.g., keep indefinitely or partition by year).
- Explain difference between snapshots (assigned “as‑of”) and actuals (if added later). Document backfill limitations clearly.
---
## Acceptance Criteria
- Weekly, idempotent snapshot writer persists person–project–role rows with hours > 0, plus lifecycle events.
- Joined/Left lifecycle events are determined by assignment membership (exists/removed), independent of weekly hours values.
- New read APIs return correct server‑aggregated results for experience and timelines with department/date filters and caching validators.
- Frontend hooks and cards consume these APIs without client summing; types match OpenAPI; builds pass.
- Backfill (if used) marks reconstructed data and does not overwrite live rows without `--force`.
- Tests cover writer logic, event detection, endpoint correctness, and UI basics; performance meets the proposed thresholds.
