from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('deliverables', '0003_indexes_phase3'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='deliverableassignment',
            name='weekly_hours',
        ),
    ]

