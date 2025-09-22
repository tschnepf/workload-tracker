from django.db import migrations


def seed_global(apps, schema_editor):
    PDT = apps.get_model('deliverables', 'PreDeliverableType')
    G = apps.get_model('core', 'PreDeliverableGlobalSettings')
    for t in PDT.objects.all().order_by('sort_order', 'name'):
        G.objects.get_or_create(
            pre_deliverable_type=t,
            defaults={
                'default_days_before': t.default_days_before,
                'is_enabled_by_default': t.is_active,
            },
        )


def unseed_global(apps, schema_editor):
    G = apps.get_model('core', 'PreDeliverableGlobalSettings')
    G.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0001_initial'),
        ('deliverables', '0007_seed_predeliverabletype'),
    ]

    operations = [
        migrations.RunPython(seed_global, reverse_code=unseed_global),
    ]

