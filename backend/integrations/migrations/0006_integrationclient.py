from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0005_integrationauditlog'),
    ]

    operations = [
        migrations.CreateModel(
            name='IntegrationClient',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('external_id', models.CharField(max_length=128)),
                ('name', models.CharField(blank=True, max_length=255)),
                ('client_number', models.CharField(blank=True, max_length=100, null=True)),
                ('status', models.CharField(blank=True, max_length=100, null=True)),
                ('email', models.CharField(blank=True, max_length=255, null=True)),
                ('phone', models.CharField(blank=True, max_length=100, null=True)),
                ('is_archived', models.BooleanField(default=False)),
                ('updated_on', models.DateTimeField(blank=True, null=True)),
                ('last_synced_at', models.DateTimeField(blank=True, null=True)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('connection', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='clients', to='integrations.integrationconnection')),
            ],
            options={'unique_together': {('connection', 'external_id')}},
        ),
        migrations.AddIndex(
            model_name='integrationclient',
            index=models.Index(fields=['connection', 'client_number'], name='idx_integration_client_number'),
        ),
        migrations.AddIndex(
            model_name='integrationclient',
            index=models.Index(fields=['connection', 'name'], name='idx_integration_client_name'),
        ),
    ]
