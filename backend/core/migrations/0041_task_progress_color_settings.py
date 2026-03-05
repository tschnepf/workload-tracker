from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0040_network_graph_omitted_projects'),
    ]

    operations = [
        migrations.CreateModel(
            name='TaskProgressColorSettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(default='default', max_length=20, unique=True)),
                ('ranges', models.JSONField(default=list)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Task Progress Color Settings',
                'ordering': ['key'],
            },
        ),
    ]
