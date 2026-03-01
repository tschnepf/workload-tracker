from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('roles', '0005_role_overhead_hours'),
        ('core', '0034_rename_core_jobacc_created_429d3f_idx_core_jobacc_created_ff3037_idx'),
    ]

    operations = [
        migrations.AddField(
            model_name='autohourstemplaterolesetting',
            name='people_roles',
            field=models.ManyToManyField(
                blank=True,
                related_name='auto_hours_template_role_mappings',
                to='roles.role',
            ),
        ),
    ]

