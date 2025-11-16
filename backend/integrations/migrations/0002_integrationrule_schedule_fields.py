from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='integrationrule',
            name='last_error',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='integrationrule',
            name='last_run_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='integrationrule',
            name='last_success_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='integrationrule',
            name='next_run_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='integrationrule',
            name='resync_required',
            field=models.BooleanField(default=False),
        ),
        migrations.AddIndex(
            model_name='integrationrule',
            index=models.Index(fields=['is_enabled', 'next_run_at'], name='idx_integration_rule_next_run'),
        ),
    ]
