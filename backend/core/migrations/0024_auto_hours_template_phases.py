from django.db import migrations, models


DEFAULT_PHASE_KEYS = ['sd', 'dd', 'ifp', 'ifc']


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0023_auto_hours_templates'),
    ]

    operations = [
        migrations.AddField(
            model_name='autohourstemplate',
            name='phase_keys',
            field=models.JSONField(blank=True, default=DEFAULT_PHASE_KEYS),
        ),
    ]
