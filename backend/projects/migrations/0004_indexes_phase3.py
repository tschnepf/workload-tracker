from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0002_alter_project_status'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='project',
            index=models.Index(fields=['is_active', 'status'], name='project_active_status_idx'),
        ),
        migrations.AddIndex(
            model_name='project',
            index=models.Index(fields=['updated_at'], name='project_updated_idx'),
        ),
    ]
