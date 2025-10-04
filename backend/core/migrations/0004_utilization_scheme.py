from django.db import migrations, models


def seed_utilization_scheme(apps, schema_editor):
    UtilizationScheme = apps.get_model('core', 'UtilizationScheme')
    UtilizationScheme.objects.get_or_create(
        key='default',
        defaults=dict(
            mode='absolute_hours',
            blue_min=1,
            blue_max=29,
            green_min=30,
            green_max=36,
            orange_min=37,
            orange_max=40,
            red_min=41,
            zero_is_blank=True,
            version=1,
        ),
    )


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0003_notifications'),
    ]

    operations = [
        migrations.CreateModel(
            name='UtilizationScheme',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(default='default', max_length=20, unique=True)),
                ('mode', models.CharField(choices=[('absolute_hours', 'Absolute Hours'), ('percent', 'Percent')], default='absolute_hours', max_length=20)),
                ('blue_min', models.PositiveIntegerField(default=1)),
                ('blue_max', models.PositiveIntegerField(default=29)),
                ('green_min', models.PositiveIntegerField(default=30)),
                ('green_max', models.PositiveIntegerField(default=36)),
                ('orange_min', models.PositiveIntegerField(default=37)),
                ('orange_max', models.PositiveIntegerField(default=40)),
                ('red_min', models.PositiveIntegerField(default=41)),
                ('zero_is_blank', models.BooleanField(default=True)),
                ('version', models.PositiveIntegerField(default=1)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={'ordering': ['key']},
        ),
        migrations.RunPython(seed_utilization_scheme, migrations.RunPython.noop),
    ]

