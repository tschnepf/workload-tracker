from __future__ import annotations

import core.notification_matrix
from django.db import migrations, models


EVENT_KEYS = (
    'pred.reminder',
    'pred.digest',
    'assignment.created',
    'assignment.removed',
    'assignment.bulk_updated',
    'deliverable.reminder',
    'deliverable.date_changed',
)


def normalize_user_channel_matrix_defaults(apps, schema_editor):
    NotificationPreference = apps.get_model('core', 'NotificationPreference')

    for pref in NotificationPreference.objects.all().only('id', 'notification_channel_matrix').iterator():
        raw = pref.notification_channel_matrix if isinstance(pref.notification_channel_matrix, dict) else {}
        normalized = {}

        for event_key in EVENT_KEYS:
            row = raw.get(event_key)
            if isinstance(row, dict):
                mobile_push = bool(row.get('mobilePush')) if 'mobilePush' in row else False
                email = bool(row.get('email')) if 'email' in row else False
                in_browser = bool(row.get('inBrowser')) if 'inBrowser' in row else True
            else:
                mobile_push = False
                email = False
                in_browser = True

            normalized[event_key] = {
                'mobilePush': mobile_push,
                'email': email,
                'inBrowser': in_browser,
            }

        if normalized != raw:
            pref.notification_channel_matrix = normalized
            pref.save(update_fields=['notification_channel_matrix'])


def noop_reverse(apps, schema_editor):
    return None


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0050_sync_notification_channel_matrix_events'),
    ]

    operations = [
        migrations.AlterField(
            model_name='notificationpreference',
            name='email_pre_deliverable_reminders',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='notificationpreference',
            name='push_pre_deliverable_reminders',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='notificationpreference',
            name='push_assignment_changes',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='notificationpreference',
            name='push_deliverable_date_changes',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='notificationpreference',
            name='notification_channel_matrix',
            field=models.JSONField(blank=True, default=core.notification_matrix.default_user_notification_channel_matrix),
        ),
        migrations.RunPython(normalize_user_channel_matrix_defaults, noop_reverse),
    ]
