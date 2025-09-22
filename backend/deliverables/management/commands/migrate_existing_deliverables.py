import logging
from datetime import date, timedelta
from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = "Generate pre-deliverable items for existing deliverables (idempotent)"

    def add_arguments(self, parser):
        parser.add_argument('--batch-size', type=int, default=100)
        parser.add_argument('--dry-run', action='store_true', default=False)

    def handle(self, *args, **options):
        from deliverables.models import Deliverable
        from datetime import date as _date
        cutoff = _date.today() - timedelta(days=30)
        batch_size = max(1, options['batch_size'])
        dry_run = options['dry_run']
        qs = Deliverable.objects.filter(date__gt=cutoff).order_by('id')
        total = qs.count()
        created_total = 0
        self.stdout.write(f"Analyzing {total} deliverables (cutoff: {cutoff.isoformat()})")

        try:
            from deliverables.services import PreDeliverableService  # Step 7
            have_service = True
        except Exception:
            have_service = False

        idx = 0
        while True:
            chunk = list(qs[idx: idx + batch_size])
            if not chunk:
                break
            idx += batch_size

            for d in chunk:
                if not have_service:
                    logging.info("skip_generation_no_service", extra={'deliverable_id': d.id})
                    continue
                if dry_run:
                    # Simulate only
                    items = PreDeliverableService.preview_generate(d)
                    created_total += len(items)
                else:
                    with transaction.atomic():
                        created = PreDeliverableService.generate_pre_deliverables(d)
                        created_total += len(created)

        self.stdout.write(f"Done. Created (or would create) {created_total} items. Dry-run={dry_run}")
        logging.getLogger('management').info('migrate_existing_deliverables', extra={'dry_run': dry_run, 'created_total': created_total})

