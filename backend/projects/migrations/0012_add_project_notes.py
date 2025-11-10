from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0011_migrate_roles_from_core_mapping'),
    ]

    operations = [
        migrations.AddField(
            model_name='project',
            name='notes',
            field=models.TextField(blank=True),
        ),
    ]

