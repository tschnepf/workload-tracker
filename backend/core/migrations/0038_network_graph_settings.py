from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0037_notification_push_preferences_and_subscription'),
    ]

    operations = [
        migrations.CreateModel(
            name='NetworkGraphSettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(default='default', max_length=20, unique=True)),
                ('default_window_months', models.PositiveIntegerField(default=24, validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(120)])),
                ('coworker_project_weight', models.DecimalField(decimal_places=2, default=3.0, max_digits=8)),
                ('coworker_week_weight', models.DecimalField(decimal_places=2, default=1.0, max_digits=8)),
                ('coworker_min_score', models.DecimalField(decimal_places=2, default=6.0, max_digits=8)),
                ('client_project_weight', models.DecimalField(decimal_places=2, default=4.0, max_digits=8)),
                ('client_week_weight', models.DecimalField(decimal_places=2, default=1.0, max_digits=8)),
                ('client_min_score', models.DecimalField(decimal_places=2, default=8.0, max_digits=8)),
                ('include_inactive_default', models.BooleanField(default=False)),
                ('max_edges_default', models.PositiveIntegerField(default=4000, validators=[django.core.validators.MinValueValidator(100), django.core.validators.MaxValueValidator(10000)])),
                ('snapshot_scheduler_enabled', models.BooleanField(default=True)),
                ('snapshot_scheduler_day', models.IntegerField(default=6, validators=[django.core.validators.MinValueValidator(0), django.core.validators.MaxValueValidator(6)])),
                ('snapshot_scheduler_hour', models.IntegerField(default=23, validators=[django.core.validators.MinValueValidator(0), django.core.validators.MaxValueValidator(23)])),
                ('snapshot_scheduler_minute', models.IntegerField(default=55, validators=[django.core.validators.MinValueValidator(0), django.core.validators.MaxValueValidator(59)])),
                ('snapshot_scheduler_timezone', models.CharField(default='America/Phoenix', max_length=64)),
                ('last_snapshot_week_start', models.DateField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Network Graph Settings',
                'ordering': ['key'],
            },
        ),
    ]
