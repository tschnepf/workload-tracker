from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0021_auto_hours_percent_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='autohoursrolesetting',
            name='ramp_percent_by_phase',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
