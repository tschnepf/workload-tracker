from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0020_auto_hours_role_ramp'),
    ]

    operations = [
        migrations.RenameField(
            model_name='autohoursrolesetting',
            old_name='standard_hours_per_week',
            new_name='standard_percent_of_capacity',
        ),
        migrations.RenameField(
            model_name='autohoursrolesetting',
            old_name='ramp_hours_by_week',
            new_name='ramp_percent_by_week',
        ),
    ]
