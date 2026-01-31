from __future__ import annotations

from django.core.management.base import BaseCommand

from projects.assigned_names import rebuild_assigned_names_for_project
from projects.models import Project


class Command(BaseCommand):
    help = 'Backfill Project.assigned_names_text for existing projects.'

    def add_arguments(self, parser):
        parser.add_argument('--project-id', type=int, help='Backfill a single project id')
        parser.add_argument('--limit', type=int, help='Limit number of projects to backfill')

    def handle(self, *args, **options):
        project_id = options.get('project_id')
        limit = options.get('limit')

        if project_id:
            rebuild_assigned_names_for_project(project_id)
            self.stdout.write(self.style.SUCCESS(f'Backfilled assigned names for project {project_id}'))
            return

        qs = Project.objects.filter(is_active=True).only('id').order_by('id')
        if limit:
            qs = qs[:limit]
        count = 0
        for project in qs.iterator():
            rebuild_assigned_names_for_project(project.id)
            count += 1
        self.stdout.write(self.style.SUCCESS(f'Backfilled assigned names for {count} projects'))
