from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('departments', '0004_department_vertical'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='department',
            index=models.Index(fields=['vertical'], name='idx_department_vertical'),
        ),
    ]
