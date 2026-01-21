from django.db import migrations, models
from django.core.validators import MinValueValidator, MaxValueValidator


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0017_deliverable_phase_mapping_settings'),
    ]

    operations = [
        migrations.CreateModel(
            name='QATaskSettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(default='default', max_length=20, unique=True)),
                ('default_days_before', models.PositiveIntegerField(default=7, validators=[MinValueValidator(0), MaxValueValidator(365)])),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['key'],
                'verbose_name': 'QA Task Settings',
            },
        ),
    ]
