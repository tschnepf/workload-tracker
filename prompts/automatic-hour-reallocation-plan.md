# Automatic Hour Reallocation Implementation Plan (Final)

## Overview
Implement automatic hour reallocation for assignments when deliverable dates change. The system is Sunday-only end-to-end (no Ã‚Â±3-day tolerance), uses whole-week shifts, stores integer hours only (rounded up), and auto-applies on date change (no confirmation modal). Assignment.weekly_hours is the single source of truth; DeliverableAssignment.weekly_hours is removed.

## Current System Snapshot

- Assignment: `weekly_hours` JSON with keys `YYYY-MM-DD` (not strictly Sunday today). Authoritative for aggregates and UI.
- Deliverable: optional `date`. Ordering is by `sort_order`, then `percentage`, then `date`.
- DeliverableAssignment: currently includes `weekly_hours`, but it is not used in calculations; it will be removed.
- Some views use Monday labels and Ã‚Â±3-day tolerance; these will be standardized to Sunday-only.

## Core Policies

- Sunday-only keys: all reads/writes use Sunday `YYYY-MM-DD` keys. No tolerance scanning.
- Single source: only Assignment.weekly_hours is used and mutated by reallocation. DeliverableAssignment.weekly_hours is dropped.
- Whole-week shifts: compute `delta_weeks` via Sunday-of-week(old) and Sunday-of-week(new), shifting buckets by whole weeks.
- Integer hours only: store integers; round up to the nearest hour on all writes (including normalization and reallocation).
- No conservation guarantee: totals may increase due to rounding; do not cap hours. Over-capacity is allowed and only surfaced as warnings.
- Auto-apply: changing a deliverable date triggers reallocation in the same transaction; show non-blocking toast warnings for capacity spikes.
- Feature flag: gate auto-reallocation under `FEATURES['AUTO_REALLOCATION']` (default: enabled).
- Permissions: allow any authenticated user to modify deliverable dates (and thus reallocate). Keep lightweight audit logging.
- Caching/ETags: rely on `updated_at` and existing signals for invalidation; return updated ETags.
- Timezone: all date math is UTC date-only; `sunday_of_week` uses naive UTC dates to avoid DST issues.
- Frontend parity: the UI also uses integer hours only (no decimals anywhere) and enforces Sunday-only week keys for all week pickers and grids.

## Implementation Steps

---

### Step 1: Week Utilities and Standardization

Add `backend/core/week_utils.py` with helpers:
- `sunday_of_week(d: date) -> date`
- `week_key(d: date) -> str` returning Sunday `YYYY-MM-DD`
- `shift_week_key(week_key: str, delta_weeks: int) -> str`
- `list_sundays_between(start: date, end: date, inclusive: bool = True) -> List[str]`

Adopt Sunday-only policy across new and refactored code paths.

Unit tests: `backend/core/tests/test_week_utils.py`.

---

Frontend week helpers:
- Add `frontend/src/utils/weeks.ts` with:
  - `sundayOf(d: Date): Date`
  - `weekKey(d: Date): string` (Sunday `YYYY-MM-DD`)
  - `getSundaysFrom(start: Date, count: number): string[]`
- Replace any ad-hoc week generation with these helpers (see Step 8).

Concrete tasks:
- Implement `weeks.ts` and export the helpers above; add unit tests where applicable.
- Refactor `pages/Assignments/AssignmentForm.tsx` to import `weeks.ts` helpers for all week key generation and validation.
- In `AssignmentForm`, remove half-hour increments and ensure hour inputs are integer-only (step=1, min=0) and ceil on change/blur before sending.
- Repo-wide scan: replace any places generating week keys from Ã¢â‚¬Å“current dateÃ¢â‚¬Â or non-Sunday logic to use `sundayOf(...)` and `weekKey(...)`.

---

### Step 2: One-Time Normalization Command (Sunday + Integer Hours)

Create a management command to normalize `Assignment.weekly_hours`:
- Convert any non-Sunday keys to the canonical Sunday key.
- Merge collisions by summing hours and round up to integers.
- Provide `--dry-run` with a report (keys shifted, collisions, spikes) and a non-dry run that applies changes.
- Log per-assignment change counts and totals changed.

Run normalization before enabling auto-reallocation.

---

### Step 3: Validation Policy Changes (Allow Overages)

- Remove validation that blocks over-allocation on assignments:
  - Delete the hard cap check (168 h/week) in `AssignmentSerializer` (backend/assignments/serializers.py: around lines 70).
  - Delete the cross-field capacity check loop comparing weekly hours vs `person.weekly_capacity` (backend/assignments/serializers.py: around lines 77 and 85).
- DeliverableAssignment serializer: remove the 0Ã¢â‚¬â€œ80 per-week cap if the field remains temporarily (backend/deliverables/serializers.py: around lines 88 and 99). This is moot once the field is removed (see Step 7).
- Keep non-negativity, type, and date-format validations.

---

### Step 4: Backend Refactors to Sunday-Only

- Project grid snapshot (assignments/views): replace Monday keys and Ã‚Â±3-day tolerance with Sunday-only keys.
- People utilization (people/models): remove tolerance scanning; read exact Sunday keys.
- Deliverable staffing summary (deliverables/views): aggregate from Assignment.weekly_hours using Sunday keys only; do not read DeliverableAssignment.weekly_hours.

---

### Step 5: Reallocation Algorithm (Whole-Week, Integer)

Implement reallocation using strict Sunday keys and integer semantics:
- Compute `delta_weeks = weeks_between(sunday_of(old_date), sunday_of(new_date))`.
- Reallocation window rules:
  - Shift only buckets whose Sunday falls in the original window for the deliverable: `(prev.date + 1 day) Ã¢â€ â€™ old.date`, inclusive. If there is no previous dated deliverable, use the configured lookback (e.g., 6 weeks) as the window.
  - Do not backfill the new window; users can adjust manually after the move.
  - If the new date crosses earlier than the previous deliverable or later than the next deliverable, still only consider buckets in the original window to avoid cascading across neighbors.
- For each affected assignment: shift each Sunday bucket in the window by `delta_weeks` weeks.
- Collision handling and rounding order: for each target Sunday, first sum all incoming hours, then apply `ceil()` to the sum, then write the integer.
- Do not cap hours; allow spikes. Include spikes in the summary response.
- Performance guardrails:
  - Short-circuit if no buckets exist in the original window; return early with a summary (`assignmentsChanged = 0`).
  - Batch writes and avoid serializer overhead; coerce and write JSON atomically in a service function.
- All writes store integers.

---

### Step 6: Auto-Apply on Deliverable Date Change

- Modify the Deliverable update (PATCH) path to detect `date` changes and invoke the reallocation algorithm inside the same DB transaction with row locks (`select_for_update()` on affected assignments in a stable pk order to reduce deadlocks).
- Compatibility-first response:
  - Keep PATCH body unchanged (return the updated Deliverable as today).
  - Add header `X-Reallocation-Summary: <json>` containing:
    - `deliverableId: number`
    - `oldDate: string | null`
    - `newDate: string | null`
    - `assignmentsChanged: number`
    - `capacityWarnings: Array<{ personId: number, weekKey: string, totalHours: number, capacity: number }>`
    - `touchedWeekKeys: string[]`
  - Frontend: read and JSON-parse this header to show toasts and target cache invalidation.
  - Optional later: extend OpenAPI to include a typed `reallocationSummary` in the PATCH response body and regenerate the client; until then, use the header for backward-compatibility.
- Concurrency & idempotency:
  - Require `If-Match` (ETag) on PATCH; stale updates return 412.
  - Double-PATCH with the same date results in `assignmentsChanged = 0` and no data mutation.
- Permissions for this action: `IsAuthenticated` (override the default role-based guard). Keep a lightweight audit log at INFO with request id, user id, deliverable id, fromÃ¢â€ â€™to dates, `assignmentsChanged`, and duration.
- Gate by `FEATURES['AUTO_REALLOCATION']` (if disabled, just update the date without reallocation).

---

### Step 7: Schema Change â€” Remove DeliverableAssignment.weekly_hours

- Frontend first (safe rollout):
  - Remove weeklyHours from 	ypes/models.ts (around 226–237) for DeliverableAssignment.
  - Update deliverableAssignmentsApi.create/update to stop sending weeklyHours.
  - Refactor MilestoneReviewTool (and any callers) to not set weeklyHours.
- Backend next (after FE lands or coordinated):
  - Add a migration to drop DeliverableAssignment.weekly_hours.
  - Update DeliverableAssignmentSerializer to remove weeklyHours and related validation.
  - Adjust any tests that referenced the field.
  - Update OpenAPI schema accordingly.
- Migration hygiene: remove references in admin/serializers/tests in the same PR; add a deprecation note in docs explaining the field was never used for calculations.
### Step 8: Frontend Changes (Sunday UI, No Modal)

- Make the UI Sunday-based (labels/selectors align to Sundays).
- On date picker change in Deliverables UI, immediately PATCH the deliverable. Do not show a confirmation modal.
- Ensure PATCH includes `If-Match` automatically (existing client behavior) to prevent lost updates.
- Parse  `X-Reallocation-Summary` from PATCH response headers; show a non-blocking toast with any capacity warnings; include a link/action to jump to impacted person/weeks; and use `touchedWeekKeys` for targeted invalidation. 
- Invalidate cached data for affected assignments, project grid, and deliverables.
- Centralize Sunday labels via a small date util to keep consistent week headers across views.
- Remove any usage of DeliverableAssignment.weeklyHours (e.g., Milestone tools) and update types.
- Hours input policy: enforce integers only across all hour inputs (no 0.5 steps). Use `step=1`, `min=0`, and onChange/onBlur round up to whole numbers. Update any form logic that currently allows half-hours (e.g., Assignments form) to use integer semantics.
- Types and validation: keep `number` in TypeScript, but document and enforce integer semantics at validation boundaries and via rounding in the UI. Add helper to ceil values before sending to the API.
- Calendar/week generation: when building week lists in the UI (e.g., Assignment forms and grids), generate keys from the nearest previous Sunday using `sundayOf(today)` and `getSundaysFrom(...)`, or use `availableWeeks` from the backend when provided. Do not start from arbitrary current dates.
- Explicit refactor items:
  - Update `pages/Assignments/AssignmentForm.tsx` to use `weeks.ts`; remove any decimal input allowances; apply ceil-on-blur.
  - Repo-wide: update other components and utilities that generate week lists (projects grids, reports, heatmaps) to rely on Sunday keys via `weeks.ts`.

---

### Step 9: Consistency, Caching, and Performance

- Rely on existing ETag/`updated_at` invalidation.
- No new indexes/caches initially; measure first.
- Optional: add a Celery background job for very large projects as a Phase 2 optimization (same service methods), but not required for MVP.
- Batch updates to reduce DB round trips; write JSON fields in a single save per assignment when possible.

---

### Step 10: Observability & Recovery

- Structured audit logging: request id, user id, deliverable id, fromÃ¢â€ â€™to, `assignmentsChanged`, duration.
- Metrics (if available): total reallocations, assignments updated per op, max weekly spike.
- Optional recovery: a minimal management command to Ã¢â‚¬Å“undo last reallocation for deliverable XÃ¢â‚¬Â using the audit snapshot.

---

### Step 11: Testing and QA

Backend tests:
- Week utils: Sunday mapping and shifting.
- Normalization: converts non-Sunday keys, merges collisions, rounds up to integers.
- Reallocation core: forward/backward shifts across many weeks; collision sums; large `delta_weeks`; integer rounding; no caps.
- Windows & neighbors: moves earlier than previous/later than next; ensure only original-window buckets move.
- Over capacity: verify writes succeed and warnings are returned.
- Idempotency & concurrency: double-PATCH with same date yields zero changes; stale ETag yields 412.
- Sunday-only reads verified across aggregates (no tolerance scanning).

Frontend tests:
- Date change triggers PATCH and shows toast with warnings and jump action.
- Sunday-based labels and grids render correctly.

E2E (Playwright): change date Ã¢â€ â€™ auto-apply Ã¢â€ â€™ grids reflect updated integer hours.

---

### Step 12: Documentation and Cleanup

- Add `docs/hour-reallocation/overview.md`:
  - Sunday-only policy (no tolerance scanning).
  - Whole-week shift algorithm and collision handling.
  - Integer-only storage and rounding-up rule (ceil after collision sum).
  - Auto-apply flow and capacity warnings (non-blocking).
  - UTC date-only policy and DST considerations.
- Remove garbled characters and remove all references to Ã‚Â±3 days across code, tests, and docs.
- Update OpenAPI schema and client regeneration notes.
- Add a deprecation note for `DeliverableAssignment.weekly_hours` explaining it was never used for calculations.

---

### Step 13: Deployment and Rollout

- Behind feature flag initially. Enable per environment once normalization and migrations are applied.
- Run normalization first (with dry-run and then apply), then deploy code + migration dropping DeliverableAssignment.weekly_hours, then enable the feature flag.
- Validate: ETags update, aggregates reflect Sunday-only updates, toast summaries appear on date changes.

## Success Criteria

- [ ] Sunday-only reads and writes verified end-to-end (no tolerance scanning)
- [ ] Auto-apply on deliverable date change updates Assignment.weekly_hours only
- [ ] Integer-only hours in storage; rounding up enforced
- [ ] UI shows (non-blocking) capacity warnings when dates shift
- [ ] DeliverableAssignment.weekly_hours removed from schema, serializers, types, and tests
- [ ] Caches/ETags refresh automatically
- [ ] Tests cover whole-week shifts, collisions, Sunday-only behavior, and auto-apply flow
- [ ] Documentation clearly states policies and algorithms
 - [ ] Capacity validations that block overages are removed; overages never prevent writes
 - [ ] PATCH response includes `touchedWeekKeys`; clients use it for targeted invalidation
 - [ ] Idempotency and ETag-412 behavior verified
 - [ ] UTC date-only policy documented and used in code
 - [ ] Frontend uses integer-only hour inputs (no decimals) and Sunday-only week keys everywhere

## Technical Requirements

- Django service with transactional apply and row locks on affected assignments
- Assignment.weekly_hours is the sole source of truth
- Sunday-only key writes/reads; integer-only storage (round up)
- Deliverable PATCH triggers reallocation (feature-flagged) with `IsAuthenticated` permission
- Clean serializers, OpenAPI annotations, and typed client regeneration

## Implementation Timeline

Proceed sequentially with validation at each step:
1) Week utils + tests
2) Normalization command + run
3) Validation changes (remove caps)
4) Sunday-only refactors in views/models
5) Reallocation algorithm (window rules, rounding order, batching)
6) Transactional auto-apply on PATCH (response schema, ETag)
7) Schema migration removing DeliverableAssignment.weekly_hours + API/types update
8) Frontend: add `weeks.ts`; refactor `AssignmentForm` to use it; enforce integer-only inputs; repo-wide Sunday key usage; Sunday UI + auto-apply integration + toasts + week header util
9) Observability & metrics; optional undo command
10) Docs + cleanup; enable feature flag; monitor
