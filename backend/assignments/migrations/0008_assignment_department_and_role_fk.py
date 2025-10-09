from django.db import migrations, models


def backfill_department(apps, schema_editor):
    Assignment = apps.get_model('assignments', 'Assignment')
    # Backfill department from person.department
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            """
            UPDATE assignments_assignment a
            SET department_id = p.department_id
            FROM people_person p
            WHERE a.person_id = p.id AND a.department_id IS NULL;
            """
        )


class Migration(migrations.Migration):

    dependencies = [
        ('departments', '0002_initial'),
        ('projects', '0011_migrate_roles_from_core_mapping'),
        ('assignments', '0007_remove_assignment_assign_active_person_idx_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='assignment',
            name='department',
            field=models.ForeignKey(blank=True, null=True, on_delete=models.deletion.SET_NULL, related_name='assignments', to='departments.department'),
        ),
        migrations.AddField(
            model_name='assignment',
            name='role_on_project_ref',
            field=models.ForeignKey(blank=True, null=True, on_delete=models.deletion.PROTECT, related_name='assignments', to='projects.projectrole'),
        ),
        migrations.AddIndex(
            model_name='assignment',
            index=models.Index(fields=['department'], name='idx_assignment_department'),
        ),
        migrations.AddIndex(
            model_name='assignment',
            index=models.Index(fields=['role_on_project_ref'], name='idx_assignment_role_fk'),
        ),
        migrations.RunPython(backfill_department, migrations.RunPython.noop),
    ]

