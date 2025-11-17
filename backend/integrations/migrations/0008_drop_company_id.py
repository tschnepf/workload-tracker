from django.db import migrations, models


def copy_company_id_to_headers(apps, schema_editor):
    Connection = apps.get_model('integrations', 'IntegrationConnection')
    for connection in Connection.objects.exclude(company_id__isnull=True).exclude(company_id=''):
        headers = dict(connection.extra_headers or {})
        if headers.get('legacy_company_id') == connection.company_id:
            continue
        headers['legacy_company_id'] = connection.company_id
        connection.extra_headers = headers
        connection.save(update_fields=['extra_headers'])


def restore_company_id_from_headers(apps, schema_editor):
    Connection = apps.get_model('integrations', 'IntegrationConnection')
    for connection in Connection.objects.all():
        headers = dict(connection.extra_headers or {})
        legacy_value = headers.get('legacy_company_id')
        if not legacy_value:
            continue
        connection.company_id = legacy_value
        headers.pop('legacy_company_id', None)
        connection.extra_headers = headers
        connection.save(update_fields=['company_id', 'extra_headers'])


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0007_integrationprovidercredential'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='integrationconnection',
            name='uniq_integration_connection',
        ),
        migrations.RunPython(copy_company_id_to_headers, reverse_code=restore_company_id_from_headers),
        migrations.RemoveField(
            model_name='integrationconnection',
            name='company_id',
        ),
        migrations.AddConstraint(
            model_name='integrationconnection',
            constraint=models.UniqueConstraint(fields=('provider', 'environment'), name='uniq_integration_connection'),
        ),
    ]
