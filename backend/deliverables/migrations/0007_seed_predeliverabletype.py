from django.db import migrations


def seed_types(apps, schema_editor):
    PreDeliverableType = apps.get_model('deliverables', 'PreDeliverableType')
    defaults = [
        ("Specification TOC", 3, 10),
        ("Specifications", 1, 20),
        ("Model Delivery", 1, 30),
        ("Sheet List", 1, 40),
    ]
    for name, days, order in defaults:
        PreDeliverableType.objects.get_or_create(
            name=name,
            defaults={
                'description': '',
                'default_days_before': days,
                'is_active': True,
                'sort_order': order,
            }
        )


def unseed_types(apps, schema_editor):
    PreDeliverableType = apps.get_model('deliverables', 'PreDeliverableType')
    names = ["Specification TOC", "Specifications", "Model Delivery", "Sheet List"]
    PreDeliverableType.objects.filter(name__in=names).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('deliverables', '0006_predeliverabletype'),
    ]

    operations = [
        migrations.RunPython(seed_types, reverse_code=unseed_types),
    ]

