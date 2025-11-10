from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0012_add_project_notes'),
    ]

    operations = [
        migrations.AddField(
            model_name='project',
            name='notes_json',
            field=models.JSONField(blank=True, null=True),
        ),
    ]

