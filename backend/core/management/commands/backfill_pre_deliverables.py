"""
Backfill or regenerate PreDeliverableItem records for existing deliverables.

Usage examples:

  # Generate only missing items for all future-dated deliverables
  python manage.py backfill_pre_deliverables

  # Regenerate (delete + recreate) for a single project by id
  python manage.py backfill_pre_deliverables --project 123 --regenerate

  # Include past deliverables within a window
  python manage.py backfill_pre_deliverables --start 2025-01-01 --end 2025-12-31

  # Dry run to see counts only
  python manage.py backfill_pre_deliverables --dry-run
"""

from __future__ import annotations

from datetime import date as _date
from typing import Optional

from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = "Backfill or regenerate pre-deliverable items for deliverables in scope"

    def add_arguments(self, parser):
        parser.add_argument('--project', type=int, help='Limit to a single project id')
        parser.add_argument('--start', type=str, help='Start date (YYYY-MM-DD) for deliverable.date filter')
        parser.add_argument('--end', type=str, help='End date (YYYY-MM-DD) for deliverable.date filter')
        parser.add_argument('--all', action='store_true', help='Include all dated deliverables (overrides default future-only)')
        parser.add_argument('--regenerate', action='store_true', help='Delete existing pre-items then recreate (preserves completed state by type)')
        parser.add_argument('--dry-run', action='store_true', help='Do not write changes; only report planned counts')

    def handle(self, *args, **opts):
        from django.utils.dateparse import parse_date
        from deliverables.models import Deliverable
        from deliverables.services import PreDeliverableService

        project_id: Optional[int] = opts.get('project')
        start_s: Optional[str] = opts.get('start')
        end_s: Optional[str] = opts.get('end')
        include_all: bool = bool(opts.get('all'))
        do_regen: bool = bool(opts.get('regenerate'))
        dry_run: bool = bool(opts.get('dry_run'))

        start = parse_date(start_s) if start_s else (None if include_all else _date.today())
        end = parse_date(end_s) if end_s else None

        qs = Deliverable.objects.all()
        qs = qs.exclude(date__isnull=True)
        if project_id:
            qs = qs.filter(project_id=project_id)
        if start:
            qs = qs.filter(date__gte=start)
        if end:
            qs = qs.filter(date__lte=end)

        total = qs.count()
        if total == 0:
            self.stdout.write(self.style.WARNING('No deliverables matched the criteria.'))
            return

        created = 0
        deleted = 0
        preserved = 0

        self.stdout.write(f"Matched {total} deliverables; mode={'regenerate' if do_regen else 'generate-missing'}; dry_run={dry_run}")

        # Process in small batches to keep memory low
        batch_size = 200
        start_idx = 0
        while start_idx < total:
            batch = list(qs.order_by('id')[start_idx:start_idx + batch_size])
            start_idx += len(batch)
            if not batch:
                break
            if dry_run:
                # Estimate only; cannot know preserved count without reading items
                if do_regen:
                    # Rough estimate: will delete all existing items and recreate defaults
                    from deliverables.models import PreDeliverableItem
                    deleted += PreDeliverableItem.objects.filter(deliverable__in=batch).count()
                else:
                    # Estimate new creations by diffing type ids — skip to simple unknown
                    pass
                continue
            # Write mode
            for d in batch:
                try:
                    if do_regen:
                        summary = PreDeliverableService.regenerate_pre_deliverables(d)
                        created += int(summary.created)
                        deleted += int(summary.deleted)
                        preserved += int(summary.preserved_completed)
                    else:
                        created += len(PreDeliverableService.generate_pre_deliverables(d))
                except Exception as e:  # pragma: no cover - operational logging
                    self.stderr.write(self.style.ERROR(f"Error processing deliverable {d.id}: {e}"))

        msg = f"Completed. created={created} deleted={deleted} preserved_completed={preserved}"
        if dry_run:
            msg = "(dry-run) " + msg
        self.stdout.write(self.style.SUCCESS(msg))

