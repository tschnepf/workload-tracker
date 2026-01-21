from django.core.management.base import BaseCommand
from django.utils import timezone

from deliverables.models import Deliverable
from deliverables.services import DeliverableQATaskService


class Command(BaseCommand):
    help = "Backfill QA tasks for future-dated deliverables (per department on project)."

    def add_arguments(self, parser):
        parser.add_argument('--project', type=int, help='Limit to a project id')

    def handle(self, *args, **options):
        project_id = options.get('project')
        today = timezone.now().date()
        qs = Deliverable.objects.filter(date__gte=today).select_related('project')
        if project_id:
            qs = qs.filter(project_id=project_id)

        total = qs.count()
        created_total = 0
        processed = 0
        for deliverable in qs.iterator():
            created_total += DeliverableQATaskService.ensure_for_deliverable(deliverable)
            processed += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Processed {processed}/{total} future deliverables; created {created_total} QA tasks."
            )
        )
