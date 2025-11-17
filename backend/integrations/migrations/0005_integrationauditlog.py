from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0004_integrationjob_metrics'),
    ]

    operations = [
        migrations.CreateModel(
            name='IntegrationAuditLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('action', models.CharField(choices=[('connection.created', 'Connection created'), ('connection.updated', 'Connection updated'), ('connection.deleted', 'Connection deleted'), ('rule.created', 'Rule created'), ('rule.updated', 'Rule updated'), ('rule.deleted', 'Rule deleted'), ('rule.resync', 'Rule resync requested'), ('job.retry', 'Job retry requested')], max_length=64)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('connection', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.SET_NULL, to='integrations.integrationconnection')),
                ('provider', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.SET_NULL, to='integrations.integrationprovider')),
                ('rule', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.SET_NULL, to='integrations.integrationrule')),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-created_at']},
        ),
    ]

