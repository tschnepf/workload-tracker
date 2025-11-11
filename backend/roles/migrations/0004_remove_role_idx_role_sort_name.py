from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('roles', '0003_add_sort_order'),
    ]

    operations = [
        migrations.RemoveIndex(
            model_name='role',
            name='idx_role_sort_name',
        ),
    ]

