from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('verticals', '0001_initial'),
        ('projects', '0023_project_change_log'),
    ]

    operations = [
        migrations.AddField(
            model_name='project',
            name='vertical',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='projects',
                to='verticals.vertical',
            ),
        ),
        migrations.AddIndex(
            model_name='project',
            index=models.Index(fields=['vertical'], name='idx_project_vertical'),
        ),
    ]
