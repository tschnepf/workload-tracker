# Pre‑Deliverables: Global Defaults Backfill (Option B)

Goal
- Ensure every `deliverables.PreDeliverableType` has a matching `core.PreDeliverableGlobalSettings` row so the Project Settings UI shows `Source = global` (not `default`) when no project override exists.
- Make this change deterministic, idempotent, and safe for dev/stage/prod.

Background
- Types live in `deliverables.PreDeliverableType` (catalog + built‑in defaults).
- Global defaults live in `core.PreDeliverableGlobalSettings` (1:1 with each type).
- Older environments seeded global rows for the original types only. Newer types (e.g., “Drawings Due”) may not have a global row yet → UI shows `default`.

Scope
- Add a core data migration that backfills a global row for any type missing one.
- Migration should be idempotent (`get_or_create`) and depend on latest type/migrations so ordering is correct.

---

## Implementation Steps (Dev)

1) Create migration in `backend/core/migrations`
- Filename suggestion: `00XX_backfill_pre_deliverable_global_settings.py`
- Dependencies (update based on your tree):
  - `('deliverables', '0013_add_drawings_due_type')` (ensures “Drawings Due” exists first)
  - `('core', '0002_seed_global_settings')` (initial global seeding ran earlier)

2) Migration code (template)
```py
from django.db import migrations

def backfill_globals(apps, schema_editor):
    Type = apps.get_model('deliverables', 'PreDeliverableType')
    Global = apps.get_model('core', 'PreDeliverableGlobalSettings')

    existing = set(Global.objects.values_list('pre_deliverable_type_id', flat=True))
    for t in Type.objects.all():
        if t.id in existing:
            continue
        # Policy: adopt the type’s defaults; enable by default
        Global.objects.get_or_create(
            pre_deliverable_type_id=t.id,
            defaults={
                'default_days_before': t.default_days_before,
                'is_enabled_by_default': True,
            },
        )

def noop_reverse(apps, schema_editor):
    # Keep data; reversing would risk deleting legitimate rows
    pass

class Migration(migrations.Migration):
    dependencies = [
        ('deliverables', '0013_add_drawings_due_type'),
        ('core', '0002_seed_global_settings'),
    ]
    operations = [
        migrations.RunPython(backfill_globals, reverse_code=noop_reverse),
    ]
```

3) Run migration locally
- `docker compose -f docker-compose.yml run --rm backend python manage.py migrate`
- Expect: the new migration applies quickly; “Drawings Due” now shows `Source = global` in the UI.

4) Sanity checks
- API: `GET /api/projects/{id}/pre-deliverable-settings/` → every row has `source` of `project` or `global` (no `default`).
- Admin: core → Pre Deliverable Global Settings includes a row for each type.

---

## Production Rollout

1) Prepare
- Ensure a DB backup/snapshot exists.
- Confirm compose env:
  - If `RUN_MIGRATIONS_ON_START` for backend is `true` (default), backend will migrate on restart.
  - If you prefer manual control, set `RUN_MIGRATIONS_ON_START=false` and run migrate explicitly.

2) Deploy
- `git pull`
- Build images: `docker compose -f docker-compose.prod.yml build backend`

3) Migrate (choose one)
- Auto (recommended default): restart backend and let entrypoint run migrations
  - `docker compose -f docker-compose.prod.yml up -d backend`
- Manual (if auto-migrate disabled):
  - `docker compose -f docker-compose.prod.yml run --rm backend python manage.py migrate`
  - then `docker compose -f docker-compose.prod.yml up -d backend`

4) Verify
- UI: Project → Pre‑Deliverable Settings → all rows show `Source = global` unless a project override exists.
- Admin/API spot check as in dev.

5) Rollback plan (not usually needed)
- If code rollback is required, this data migration is harmless and idempotent; keep it applied.
- If you must reverse: re‑running the migration is safe; reverse is a no‑op to avoid deleting valid rows.

---

## Optional Hardening (future‑proof)

- Auto‑create global rows when new types are added:
  - Add a `post_save` signal for `PreDeliverableType` that calls `get_or_create` on `PreDeliverableGlobalSettings` with the policy above.
  - Keep the backfill migration regardless to cover existing environments.

- Monitoring: add a lightweight check in an admin command or health report comparing counts of types vs. global rows.

---

## Operational Notes
- Idempotent: safe to run multiple times.
- Zero downtime: migration only inserts a few rows.
- Policy confirmation: using `is_enabled_by_default=True` matches current behavior; change to `t.is_active` if you prefer reflecting type activity.

