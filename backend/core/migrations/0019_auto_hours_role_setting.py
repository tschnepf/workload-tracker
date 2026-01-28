from django.db import migrations, models
import django.core.validators
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0018_qa_task_settings'),
        ('projects', '0019_projectriskedit'),
    ]

    operations = [
        migrations.CreateModel(
            name='AutoHoursRoleSetting',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('standard_hours_per_week', models.DecimalField(decimal_places=2, default=0, max_digits=6, validators=[django.core.validators.MinValueValidator(0)])),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('role', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='auto_hours_setting', to='projects.projectrole')),
            ],
            options={
                'ordering': ['role_id'],
                'verbose_name': 'Auto Hours Role Setting',
            },
        ),
    ]
