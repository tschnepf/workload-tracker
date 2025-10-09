from django.db import migrations


def forwards(apps, schema_editor):
    ProjectRoleNew = apps.get_model('projects', 'ProjectRole')
    DepartmentProjectRole = apps.get_model('core', 'DepartmentProjectRole')
    CoreProjectRole = apps.get_model('core', 'ProjectRole')

    # Build a set to avoid duplicates: (department_id, normalized_name)
    existing = set(
        ProjectRoleNew.objects.all().values_list('department_id', 'normalized_name')
    )

    # Iterate existing mappings and create per-department roles
    # Use chunking to avoid large memory, though typical sizes are small.
    dpr_qs = (
        DepartmentProjectRole.objects.select_related('project_role')
        .filter(is_active=True)
        .order_by('department_id', 'project_role_id')
    )
    batch = []
    BATCH_SIZE = 500
    for dpr in dpr_qs.iterator():
        name = (dpr.project_role.name or '').strip()
        norm = ' '.join(name.split()).lower()
        key = (dpr.department_id, norm)
        if not name:
            continue
        if key in existing:
            continue
        existing.add(key)
        batch.append(
            ProjectRoleNew(
                name=name,
                normalized_name=norm,
                department_id=dpr.department_id,
                is_active=True,
                sort_order=0,
            )
        )
        if len(batch) >= BATCH_SIZE:
            ProjectRoleNew.objects.bulk_create(batch, ignore_conflicts=True)
            batch.clear()
    if batch:
        ProjectRoleNew.objects.bulk_create(batch, ignore_conflicts=True)


def backwards(apps, schema_editor):
    # No destructive backwards migration: keep created roles.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0012_department_project_role'),
        ('projects', '0010_project_role_departmental'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]

