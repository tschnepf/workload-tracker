from django.db import migrations


def backfill_globals(apps, schema_editor):
    PreDeliverableType = apps.get_model('deliverables', 'PreDeliverableType')
    Global = apps.get_model('core', 'PreDeliverableGlobalSettings')

    # Build a set of type ids that already have global rows
    existing = set(Global.objects.values_list('pre_deliverable_type_id', flat=True))

    # For every type, ensure a matching global row exists
    for t in PreDeliverableType.objects.all().only('id', 'default_days_before'):
        if t.id in existing:
            continue
        Global.objects.get_or_create(
            pre_deliverable_type_id=t.id,
            defaults={
                'default_days_before': t.default_days_before,
                # Policy: enable by default. Adjust if you prefer to mirror t.is_active
                'is_enabled_by_default': True,
            },
        )


def noop_reverse(apps, schema_editor):
    # Keep data in place; reversing could remove legitimate configuration
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('deliverables', '0013_add_drawings_due_type'),
        ('core', '0012_department_project_role'),
    ]

    operations = [
        migrations.RunPython(backfill_globals, reverse_code=noop_reverse),
    ]

