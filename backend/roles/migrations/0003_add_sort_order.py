from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('roles', '0002_auto_20250830_2331'),
    ]

    operations = [
        migrations.AddField(
            model_name='role',
            name='sort_order',
            field=models.IntegerField(default=0),
        ),
        migrations.AlterModelOptions(
            name='role',
            options={'ordering': ['sort_order', 'name', 'id'], 'verbose_name': 'Role', 'verbose_name_plural': 'Roles'},
        ),
        migrations.AddIndex(
            model_name='role',
            index=models.Index(fields=['sort_order', 'name'], name='idx_role_sort_name'),
        ),
    ]
