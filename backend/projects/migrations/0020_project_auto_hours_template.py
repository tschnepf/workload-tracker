from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0019_projectriskedit'),
        ('core', '0023_auto_hours_templates'),
    ]

    operations = [
        migrations.AddField(
            model_name='project',
            name='auto_hours_template',
            field=models.ForeignKey(blank=True, null=True, on_delete=models.deletion.SET_NULL, related_name='projects', to='core.autohourstemplate'),
        ),
    ]
