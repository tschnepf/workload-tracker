from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0004_indexes_phase3'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='project',
            index=models.Index(fields=['is_active', 'updated_at'], name='project_active_updated_idx'),
        ),
    ]

