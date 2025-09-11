from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('people', '0005_rename_role_fk_person_role'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='person',
            index=models.Index(fields=['is_active', 'department'], name='person_active_dept_idx'),
        ),
        migrations.AddIndex(
            model_name='person',
            index=models.Index(fields=['updated_at'], name='person_updated_idx'),
        ),
    ]

