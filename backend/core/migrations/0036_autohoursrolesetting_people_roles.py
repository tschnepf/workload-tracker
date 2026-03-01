from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('roles', '0005_role_overhead_hours'),
        ('core', '0035_autohourstemplaterolesetting_people_roles'),
    ]

    operations = [
        migrations.AddField(
            model_name='autohoursrolesetting',
            name='people_roles',
            field=models.ManyToManyField(
                blank=True,
                related_name='auto_hours_global_role_mappings',
                to='roles.role',
            ),
        ),
    ]
