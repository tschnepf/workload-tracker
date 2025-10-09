from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = 'Backfill Assignment.role_on_project_ref by normalized join to projects.ProjectRole within the same department.'

    def handle(self, *args, **options):
        vendor = connection.vendor
        if vendor == 'postgresql':
            with connection.cursor() as cursor:
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
            self.stdout.write(self.style.SUCCESS('Backfill completed via SQL (Postgres).'))
            return 0

        # Fallback for non-Postgres
        from assignments.models import Assignment
        from projects.models import ProjectRole

        def norm(s: str) -> str:
            return ' '.join((s or '').strip().split()).lower()

        updated = 0
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
                updated += 1
        self.stdout.write(self.style.SUCCESS(f'Backfill completed via ORM. Updated: {updated}'))
        return 0

