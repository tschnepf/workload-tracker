from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0006_client_name_index'),
        ('deliverables', '0006_predeliverabletype'),
    ]

    operations = [
        migrations.CreateModel(
            name='ProjectPreDeliverableSettings',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('days_before', models.PositiveIntegerField()),
                ('is_enabled', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('pre_deliverable_type', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='deliverables.predeliverabletype')),
                ('project', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='pre_deliverable_settings', to='projects.project')),
            ],
            options={
                'verbose_name': 'Project Pre-Deliverable Setting',
                'ordering': ['project__name', 'pre_deliverable_type__sort_order'],
                'unique_together': {('project', 'pre_deliverable_type')},
            },
        ),
    ]

