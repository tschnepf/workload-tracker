from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0039_network_graph_initial_backfill_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='networkgraphsettings',
            name='omitted_project_ids',
            field=models.JSONField(blank=True, default=list),
        ),
    ]

