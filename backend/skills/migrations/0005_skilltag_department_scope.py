from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('departments', '0006_department_secondary_managers'),
        ('skills', '0004_remove_personskill_personskill_person_skill_idx_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='skilltag',
            name='department',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='skill_tags',
                to='departments.department',
            ),
        ),
    ]
