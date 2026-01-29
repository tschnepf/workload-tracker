from django.core.management.base import BaseCommand

from assignments.rollup_service import rebuild_project_rollups
from assignments.models import Assignment


class Command(BaseCommand):
    help = "Rebuild project rollup tables from current assignments."

    def add_arguments(self, parser):
        parser.add_argument(
            '--project-ids',
            type=str,
            help='Comma-separated project IDs to rebuild (defaults to all with assignments).',
        )

    def handle(self, *args, **options):
        ids_arg = options.get('project_ids')
        if ids_arg:
            try:
                project_ids = [int(x) for x in ids_arg.split(',') if x.strip().isdigit()]
            except Exception:
                self.stderr.write('Invalid --project-ids')
                return
        else:
            project_ids = list(
                Assignment.objects.filter(is_active=True, project_id__isnull=False)
                .values_list('project_id', flat=True)
                .distinct()
            )

        if not project_ids:
            self.stdout.write('No projects to rebuild.')
            return

        rebuild_project_rollups(project_ids)
        self.stdout.write(f'Rebuilt rollups for {len(project_ids)} project(s).')
