from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0006_client_name_index'),
        ('deliverables', '0004_remove_deliverableassignment_weekly_hours'),
    ]

    operations = [
        migrations.CreateModel(
            name='ReallocationAudit',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('user_id', models.IntegerField(blank=True, null=True)),
                ('old_date', models.DateField()),
                ('new_date', models.DateField()),
                ('delta_weeks', models.IntegerField(default=0)),
                ('assignments_changed', models.IntegerField(default=0)),
                ('touched_week_keys', models.JSONField(default=list)),
                ('snapshot', models.JSONField(default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('deliverable', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='reallocation_audits', to='deliverables.deliverable')),
                ('project', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='reallocation_audits', to='projects.project')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]

