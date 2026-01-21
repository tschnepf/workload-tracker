from django.core.management.base import BaseCommand
from django.db import transaction

from deliverables.models import Deliverable
from deliverables.services import DeliverableTaskService
from core.deliverable_phase import classify_deliverable_phase
from core.choices import DeliverablePhase


class Command(BaseCommand):
    help = "Backfill deliverable tasks for existing deliverables (idempotent)"

    def add_arguments(self, parser):
        parser.add_argument('--project_id', type=int, help='Limit to a project id')
        parser.add_argument('--phase', type=str, choices=['sd', 'dd', 'ifp', 'ifc'], help='Limit to a phase')
        parser.add_argument('--dry_run', action='store_true', help='Preview counts without writing')

    def handle(self, *args, **options):
        project_id = options.get('project_id')
        phase_filter = options.get('phase')
        dry_run = bool(options.get('dry_run'))

        qs = Deliverable.objects.all().select_related('project')
        if project_id:
            qs = qs.filter(project_id=project_id)

        created_total = 0
        scanned = 0
        for d in qs.iterator():
            scanned += 1
            phase = classify_deliverable_phase(d.description, d.percentage)
            if phase not in (DeliverablePhase.SD, DeliverablePhase.DD, DeliverablePhase.IFP, DeliverablePhase.IFC):
                continue
            if phase_filter and phase.value != phase_filter:
                continue
            if dry_run:
                # Just count potential creations
                created_total += 1
                continue
            with transaction.atomic():
                created = DeliverableTaskService.generate_for_deliverable(d)
                created_total += len(created)

        if dry_run:
            self.stdout.write(self.style.WARNING(f"Dry run: scanned {scanned}, matching {created_total} deliverables"))
        else:
            self.stdout.write(self.style.SUCCESS(f"Backfill complete: scanned {scanned}, created {created_total} tasks"))
