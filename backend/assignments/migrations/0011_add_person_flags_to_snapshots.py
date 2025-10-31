from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('assignments', '0010_weekly_snapshots_and_events'),
    ]

    operations = [
        migrations.AddField(
            model_name='weeklyassignmentsnapshot',
            name='person_is_active',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='weeklyassignmentsnapshot',
            name='person_role_id',
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='weeklyassignmentsnapshot',
            name='person_role_name',
            field=models.CharField(blank=True, default='', max_length=100),
        ),
        migrations.AddIndex(
            model_name='weeklyassignmentsnapshot',
            index=models.Index(fields=['person_role_id', 'week_start'], name='idx_was_role_week'),
        ),
    ]

