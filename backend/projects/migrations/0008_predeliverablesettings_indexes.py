from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0007_projectpredeliverablesettings'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='projectpredeliverablesettings',
            index=models.Index(fields=['project', 'is_enabled'], name='proj_pre_settings_proj_enabled'),
        ),
    ]

