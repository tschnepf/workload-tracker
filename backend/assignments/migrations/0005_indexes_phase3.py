from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('assignments', '0004_assignment_project'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='assignment',
            index=models.Index(fields=['is_active', 'person'], name='assign_active_person_idx'),
        ),
        migrations.AddIndex(
            model_name='assignment',
            index=models.Index(fields=['is_active', 'project'], name='assign_active_project_idx'),
        ),
        migrations.AddIndex(
            model_name='assignment',
            index=models.Index(fields=['updated_at'], name='assign_updated_idx'),
        ),
    ]

