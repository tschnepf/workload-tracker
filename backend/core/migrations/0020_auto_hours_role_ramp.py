from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0019_auto_hours_role_setting'),
    ]

    operations = [
        migrations.AddField(
            model_name='autohoursrolesetting',
            name='ramp_hours_by_week',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
