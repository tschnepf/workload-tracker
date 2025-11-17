from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0003_integrationsecretkey'),
    ]

    operations = [
        migrations.AddField(
            model_name='integrationjob',
            name='metrics',
            field=models.JSONField(default=dict, blank=True),
        ),
    ]
