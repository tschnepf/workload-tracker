from django.db import migrations


def backfill_role_fk(apps, schema_editor):
    vendor = schema_editor.connection.vendor
    if vendor == 'postgresql':
        # Efficient SQL backfill using normalization on the DB side
        with schema_editor.connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE assignments_assignment a
                SET role_on_project_ref_id = pr.id
                FROM projects_projectrole pr
                WHERE a.department_id = pr.department_id
                  AND a.role_on_project IS NOT NULL
                  AND a.role_on_project_ref_id IS NULL
                  AND lower(regexp_replace(trim(a.role_on_project), '\\s+', ' ', 'g')) = pr.normalized_name;
                """
            )
        return
    # Fallback for SQLite and other backends: do it in Python
    Assignment = apps.get_model('assignments', 'Assignment')
    ProjectRole = apps.get_model('projects', 'ProjectRole')
    def norm(s: str) -> str:
        return ' '.join((s or '').strip().split()).lower()
    for a in Assignment.objects.filter(role_on_project__isnull=False, role_on_project_ref__isnull=True).iterator():
        if not a.department_id:
            continue
        n = norm(a.role_on_project or '')
        if not n:
            continue
        pr = ProjectRole.objects.filter(department_id=a.department_id, normalized_name=n).first()
        if pr:
            a.role_on_project_ref_id = pr.id
            a.save(update_fields=['role_on_project_ref'])


def create_enforce_trigger(apps, schema_editor):
    # Only on Postgres; skip on SQLite and others
    if schema_editor.connection.vendor != 'postgresql':
        return
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            """
            CREATE OR REPLACE FUNCTION assignments_enforce_role_department()
            RETURNS TRIGGER AS $$
            DECLARE pr_dept BIGINT;
            BEGIN
              IF NEW.role_on_project_ref_id IS NULL THEN
                RETURN NEW;
              END IF;
              SELECT department_id INTO pr_dept FROM projects_projectrole WHERE id = NEW.role_on_project_ref_id;
              IF pr_dept IS NULL THEN
                RAISE EXCEPTION 'role_department_not_found';
              END IF;
              IF NEW.department_id IS NULL OR NEW.department_id <> pr_dept THEN
                RAISE EXCEPTION 'role_department_mismatch';
              END IF;
              RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            DROP TRIGGER IF EXISTS trg_assignments_enforce_role_department ON assignments_assignment;
            CREATE TRIGGER trg_assignments_enforce_role_department
            BEFORE INSERT OR UPDATE OF role_on_project_ref_id, department_id
            ON assignments_assignment
            FOR EACH ROW EXECUTE FUNCTION assignments_enforce_role_department();
            """
        )


def drop_enforce_trigger(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            """
            DROP TRIGGER IF EXISTS trg_assignments_enforce_role_department ON assignments_assignment;
            DROP FUNCTION IF EXISTS assignments_enforce_role_department();
            """
        )


class Migration(migrations.Migration):

    dependencies = [
        ('assignments', '0008_assignment_department_and_role_fk'),
    ]

    operations = [
        migrations.RunPython(backfill_role_fk, migrations.RunPython.noop),
        migrations.RunPython(create_enforce_trigger, drop_enforce_trigger),
    ]
