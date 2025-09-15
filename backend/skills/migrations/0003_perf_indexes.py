from django.db import migrations, models
from django.db.models.functions import Lower


class Migration(migrations.Migration):

    dependencies = [
        ('skills', '0002_update_unique_constraint'),
    ]

    operations = [
        # PersonSkill composite index and single-column index
        migrations.AddIndex(
            model_name='personskill',
            index=models.Index(fields=['person', 'skill_tag'], name='personskill_person_skill_idx'),
        ),
        migrations.AddIndex(
            model_name='personskill',
            index=models.Index(fields=['skill_tag'], name='personskill_skill_idx'),
        ),

        # SkillTag case-insensitive index on name
        migrations.AddIndex(
            model_name='skilltag',
            index=models.Index(Lower('name'), name='skilltag_name_lower_idx'),
        ),
    ]

