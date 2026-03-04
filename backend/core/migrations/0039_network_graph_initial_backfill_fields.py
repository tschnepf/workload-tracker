from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0038_network_graph_settings'),
    ]

    operations = [
        migrations.AddField(
            model_name='networkgraphsettings',
            name='initial_backfill_completed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='networkgraphsettings',
            name='initial_backfill_weeks',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
    ]

