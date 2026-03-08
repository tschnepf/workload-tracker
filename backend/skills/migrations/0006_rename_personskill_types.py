from django.db import migrations, models


def rename_skill_types_forward(apps, schema_editor):
    PersonSkill = apps.get_model('skills', 'PersonSkill')
    _remap_skill_type(PersonSkill, old_value='development', new_value='in_progress')
    _remap_skill_type(PersonSkill, old_value='learning', new_value='goals')


def rename_skill_types_reverse(apps, schema_editor):
    PersonSkill = apps.get_model('skills', 'PersonSkill')
    _remap_skill_type(PersonSkill, old_value='in_progress', new_value='development')
    _remap_skill_type(PersonSkill, old_value='goals', new_value='learning')


def _remap_skill_type(person_skill_model, *, old_value: str, new_value: str):
    """
    Remap skill_type values while preventing unique_together collisions on
    (person, skill_tag, skill_type).
    """
    rows = list(
        person_skill_model.objects.filter(skill_type=old_value).values_list('id', 'person_id', 'skill_tag_id')
    )
    if not rows:
        return
    pairs = {(person_id, skill_tag_id) for _, person_id, skill_tag_id in rows}
    existing_targets = set(
        person_skill_model.objects.filter(
            skill_type=new_value,
            person_id__in=[person_id for person_id, _ in pairs],
            skill_tag_id__in=[skill_tag_id for _, skill_tag_id in pairs],
        ).values_list('person_id', 'skill_tag_id')
    )
    update_ids = []
    delete_ids = []
    for row_id, person_id, skill_tag_id in rows:
        if (person_id, skill_tag_id) in existing_targets:
            delete_ids.append(row_id)
        else:
            update_ids.append(row_id)
    if update_ids:
        person_skill_model.objects.filter(id__in=update_ids).update(skill_type=new_value)
    if delete_ids:
        person_skill_model.objects.filter(id__in=delete_ids).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('skills', '0005_skilltag_department_scope'),
    ]

    operations = [
        migrations.RunPython(rename_skill_types_forward, rename_skill_types_reverse),
        migrations.AlterField(
            model_name='personskill',
            name='skill_type',
            field=models.CharField(
                choices=[('strength', 'Strength'), ('in_progress', 'In Progress'), ('goals', 'Goals')],
                max_length=20,
            ),
        ),
    ]
