from __future__ import annotations

import json

from django.core.management.base import BaseCommand

from assignments.models import Assignment
from assignments.week_hours_service import parity_for_assignment


class Command(BaseCommand):
    help = "Verify parity between Assignment.weekly_hours JSON and AssignmentWeekHour rows."

    def add_arguments(self, parser):
        parser.add_argument('--sample', type=int, default=None, help='Limit verification to first N assignments.')
        parser.add_argument('--fail-on-mismatch', action='store_true', help='Exit with status 1 when mismatches exist.')
        parser.add_argument('--verbose-mismatch', action='store_true', help='Print mismatch payloads.')

    def handle(self, *args, **options):
        qs = Assignment.objects.all().order_by('id')
        sample = options.get('sample')
        if sample:
            qs = qs[: max(1, int(sample))]

        total = 0
        mismatches = 0
        for assignment in qs.iterator(chunk_size=500):
            total += 1
            parity = parity_for_assignment(assignment)
            if parity.matches:
                continue
            mismatches += 1
            if options.get('verbose_mismatch'):
                payload = {
                    'assignmentId': parity.assignment_id,
                    'json': parity.json_map,
                    'normalized': parity.normalized_map,
                }
                self.stdout.write(json.dumps(payload, sort_keys=True))

        ratio = (mismatches / total) if total else 0.0
        self.stdout.write(f"checked={total} mismatches={mismatches} mismatch_rate={ratio:.4%}")
        if mismatches == 0:
            self.stdout.write(self.style.SUCCESS("Parity check passed"))
            return
        if options.get('fail_on_mismatch'):
            raise SystemExit(1)
