from django.db import migrations


def seed_drawings_due(apps, schema_editor):
    PreDeliverableType = apps.get_model('deliverables', 'PreDeliverableType')
    PreDeliverableType.objects.get_or_create(
        name='Drawings Due',
        defaults={
            'description': 'Drawings due prior to milestone',
            'default_days_before': 1,
            'is_active': True,
            'sort_order': 50,
        }
    )


def unseed_drawings_due(apps, schema_editor):
    PreDeliverableType = apps.get_model('deliverables', 'PreDeliverableType')
    PreDeliverableType.objects.filter(name='Drawings Due').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('deliverables', '0012_remove_deliverable_deliverable_completed_implies_date_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_drawings_due, reverse_code=unseed_drawings_due),
    ]

