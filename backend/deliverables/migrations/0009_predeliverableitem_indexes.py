from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('deliverables', '0008_predeliverableitem'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='predeliverableitem',
            index=models.Index(fields=['deliverable', 'is_active', 'generated_date'], name='predeliv_deliv_active_date'),
        ),
        migrations.AddIndex(
            model_name='predeliverableitem',
            index=models.Index(fields=['generated_date', 'is_completed'], name='predeliv_calendar'),
        ),
    ]

