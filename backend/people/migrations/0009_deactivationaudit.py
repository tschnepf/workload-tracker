from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('people', '0008_remove_person_person_active_dept_idx_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='DeactivationAudit',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('user_id', models.IntegerField(blank=True, null=True)),
                ('mode', models.CharField(default='all', max_length=20)),
                ('assignments_touched', models.IntegerField(default=0)),
                ('assignments_deactivated', models.IntegerField(default=0)),
                ('hours_zeroed', models.FloatField(default=0.0)),
                ('week_keys_touched', models.JSONField(default=list)),
                ('deliverable_links_deactivated', models.IntegerField(default=0)),
                ('started_at', models.DateTimeField(auto_now_add=True)),
                ('finished_at', models.DateTimeField(auto_now=True)),
                ('person', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='deactivation_audits', to='people.person')),
            ],
            options={
                'ordering': ['-started_at'],
            },
        ),
    ]

