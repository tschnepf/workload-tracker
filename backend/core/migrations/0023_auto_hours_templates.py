from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0022_auto_hours_phase_settings'),
        ('projects', '0019_projectriskedit'),
    ]

    operations = [
        migrations.CreateModel(
            name='AutoHoursTemplate',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=120, unique=True)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Auto Hours Template',
                'ordering': ['name'],
            },
        ),
        migrations.CreateModel(
            name='AutoHoursTemplateRoleSetting',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('ramp_percent_by_phase', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('role', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='auto_hours_template_settings', to='projects.projectrole')),
                ('template', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='role_settings', to='core.autohourstemplate')),
            ],
            options={
                'verbose_name': 'Auto Hours Template Role Setting',
                'ordering': ['template_id', 'role_id'],
                'unique_together': {('template', 'role')},
            },
        ),
    ]
