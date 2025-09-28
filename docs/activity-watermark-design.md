# Activity Watermark Design (Discovery Only)

Status: draft / optional / no code changes in this phase

Goal: Provide a single, low-cost “activity watermark” that represents the latest `updated_at` across People, Assignments, and Deliverables. The watermark can feed cache validators (ETag/Last-Modified) and cheap freshness checks, without altering existing endpoint semantics.

Non-Goals:
- Do not replace per-model ETag/validators already present.
- Do not widen coupling between apps. This is additive and optional.

## Approaches

1) DB View (read-only)
- Create a SQL view `core_activity_watermark_v` that computes `GREATEST(max(updated_at_people), max(updated_at_assignments), max(updated_at_deliverables))`.
- Pros: Simple, no triggers, safe to query.
- Cons: Requires a view DDL migration; still queries 3 tables on each hit.

2) Trigger-maintained table
- Table `core_activity_watermark(id int PK, last_updated timestamptz)` with a single row.
- Triggers on People/Assignments/Deliverables `AFTER INSERT/UPDATE/DELETE` update the single row to `now()` or the affected row’s `updated_at` (whichever is newer).
- Pros: O(1) lookup, extremely cheap for cache validators.
- Cons: Requires DB triggers; needs careful migration and permissions.

3) Signal-maintained cache key (Django layer)
- Post-save/post-delete signals update a short-lived cache key: `activity:last_updated` with the max timestamp.
- Pros: No DB triggers; localized to Django.
- Cons: Cache expirations and invalidations must be robust; potential drift under worker crashes.

## Recommended (incremental)
Start with (1) DB View for simplicity and portability. If cost becomes an issue, migrate to (2) trigger-maintained table. Keep the abstraction isolated in a small helper (`core.watermark.get_activity_watermark()`) returning an aware datetime or `None`.

## Integration Points (Orthogonal)
- Reports and aggregate endpoints may use the watermark as a short-circuit validator in addition to their own last-modified calculations. Do not replace existing validators.
- Do not change response shapes. The watermark is a backend optimization primitive only.

## Operations & Safety
- Backfill strategy: create view or table in a reversible migration; doc the rollback.
- Permissions: if using triggers, ensure ownership/SECURITY DEFINER set appropriately.
- Monitoring: emit a periodic metric for skew (max(per-model updated_at) vs watermark) if we deploy (2) or (3).

## Rollout Plan (if adopted)
- Phase A: Add helper + view and use it in a single endpoint as a conservative optimization.
- Phase B: Measure benefit and extend usage where it reduces load without changing semantics.

