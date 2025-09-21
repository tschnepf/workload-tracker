# Automatic Hour Reallocation — Overview

This document summarizes the behavior and policies for automatic hour reallocation when a deliverable date changes.

## Core Policies

- Sunday-only: All week keys are the Sunday `YYYY-MM-DD` of the week. No tolerance scanning.
- Whole-week shifts: Compute `delta_weeks` from `sunday_of_week(old)` to `sunday_of_week(new)`, then shift buckets in whole weeks.
- Integer-only: Hours are stored as integers. All writes round up (ceil) after any collision sums.
- No conservation guarantee: Totals may increase due to rounding; do not block writes. Over-capacity is allowed and only surfaced as warnings in UI.
- Auto-apply: Changing a deliverable date triggers reallocation in the same transaction (feature-flagged).
- Timezone: All backend math uses naive UTC `date`; frontend uses UTC-safe helpers.

## Algorithm (High Level)

1) Determine `delta_weeks` by comparing `sunday_of_week(old_date)` to `sunday_of_week(new_date)`.
2) Find the reallocation window using neighbor deliverables on the same project around the old date. Only buckets in this window move.
3) Normalize input keys to Sunday. Move eligible keys by `delta_weeks`.
4) Merge collisions by summing float values and apply ceil to produce integer hours.
5) Drop zero-hour buckets. Persist updates in a single transaction.

## Backend Interfaces

- `core/week_utils.py`: `sunday_of_week`, `week_key`, `shift_week_key`, `list_sundays_between`.
- `deliverables/reallocation.py`: `reallocate_weekly_hours(...)` — pure, test-covered.
- PATCH `/api/deliverables/{id}/`: if `date` changes and feature flag is enabled, reallocation occurs in the same transaction and the response includes:
  - `reallocation`: `{ deltaWeeks, assignmentsChanged, touchedWeekKeys }`.
- `ReallocationAudit` model captures snapshots for observability and optional undo.
  - `undo_last_reallocation` management command replays the previous state for touched assignments; optional `--revert-date` also rolls back `deliverable.date`.

## Frontend Behavior

- UTC-safe week helpers ensure consistent Sunday keys and labels.
- Hour inputs are integer-only; UI coerces to ceil.
- Changing a deliverable date shows a non-blocking toast with a summary and emits a refresh signal. Assignment grids then refresh data.

## Deployment & Rollout

1) Run normalization (`normalize_weekly_hours --dry-run` then `--apply`).
2) Deploy code + migrations (including removal of `DeliverableAssignment.weekly_hours`).
3) Enable `FEATURES['AUTO_REALLOCATION']` (default is enabled).
4) Monitor logs for `deliverable_reallocation` events and audit entries.

