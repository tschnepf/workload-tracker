from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0005_add_is_active_updated_idx'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='project',
            index=models.Index(fields=['client', 'name'], name='projects_client_name_idx'),
        ),
    ]

