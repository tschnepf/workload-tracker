from django.db import migrations, models
from django.db.models import F


def copy_external_ids(apps, schema_editor):
    IntegrationExternalLink = apps.get_model('integrations', 'IntegrationExternalLink')
    IntegrationClient = apps.get_model('integrations', 'IntegrationClient')
    IntegrationExternalLink.objects.filter(legacy_external_id='').update(legacy_external_id=F('external_id'))
    IntegrationClient.objects.filter(legacy_external_id='').update(legacy_external_id=F('external_id'))


def drop_legacy_ids(apps, schema_editor):
    IntegrationExternalLink = apps.get_model('integrations', 'IntegrationExternalLink')
    IntegrationClient = apps.get_model('integrations', 'IntegrationClient')
    IntegrationExternalLink.objects.update(legacy_external_id='')
    IntegrationClient.objects.update(legacy_external_id='')


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0009_integrationconnection_utc_offset'),
    ]

    operations = [
        migrations.AddField(
            model_name='integrationclient',
            name='legacy_external_id',
            field=models.CharField(blank=True, default='', max_length=128),
        ),
        migrations.AddField(
            model_name='integrationexternallink',
            name='legacy_external_id',
            field=models.CharField(blank=True, default='', max_length=128),
        ),
        migrations.AddIndex(
            model_name='integrationclient',
            index=models.Index(fields=['connection', 'legacy_external_id'], name='idx_integration_client_legacy'),
        ),
        migrations.AddIndex(
            model_name='integrationexternallink',
            index=models.Index(fields=['connection', 'legacy_external_id'], name='idx_external_link_legacy'),
        ),
        migrations.RunPython(copy_external_ids, drop_legacy_ids),
    ]
