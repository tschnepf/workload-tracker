from __future__ import annotations

from django.db import migrations


EVENT_KEYS = (
    'pred.reminder',
    'pred.digest',
    'assignment.created',
    'assignment.removed',
    'assignment.bulk_updated',
    'deliverable.reminder',
    'deliverable.date_changed',
)

CHANNEL_KEYS = ('mobilePush', 'email', 'inBrowser')


def _default_matrix() -> dict[str, dict[str, bool]]:
    return {
        event_key: {
            'mobilePush': True,
            'email': True,
            'inBrowser': True,
        }
        for event_key in EVENT_KEYS
    }


def _normalize_matrix(raw):
    normalized = _default_matrix()
    if not isinstance(raw, dict):
        return normalized

    for event_key in EVENT_KEYS:
        row = raw.get(event_key)
        if not isinstance(row, dict):
            continue
        for channel in CHANNEL_KEYS:
            if channel in row:
                normalized[event_key][channel] = bool(row.get(channel))
    return normalized


def _sync_model_matrixes(model):
    for row in model.objects.all().only('id', 'notification_channel_matrix').iterator():
        normalized = _normalize_matrix(getattr(row, 'notification_channel_matrix', None))
        if normalized != getattr(row, 'notification_channel_matrix', None):
            row.notification_channel_matrix = normalized
            row.save(update_fields=['notification_channel_matrix'])


def sync_notification_channel_matrices(apps, schema_editor):
    NotificationPreference = apps.get_model('core', 'NotificationPreference')
    WebPushGlobalSettings = apps.get_model('core', 'WebPushGlobalSettings')

    _sync_model_matrixes(NotificationPreference)
    _sync_model_matrixes(WebPushGlobalSettings)


def noop_reverse(apps, schema_editor):
    return None


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0049_alter_inappnotification_expires_at_and_more'),
    ]

    operations = [
        migrations.RunPython(sync_notification_channel_matrices, noop_reverse),
    ]
