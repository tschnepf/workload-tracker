import json
import logging
from datetime import date
from django.core.management.base import BaseCommand
from django.db.models import Q


class Command(BaseCommand):
    help = "Validate pre-deliverable data integrity and calculations"

    def add_arguments(self, parser):
        parser.add_argument('--output', choices=['text', 'json'], default='text')

    def handle(self, *args, **options):
        from deliverables.models import PreDeliverableItem, PreDeliverableType
        from core.week_utils import working_days_before
        output = options['output']
        issues = {
            'orphans': [],
            'calc_mismatch': [],
            'duplicates': [],
            'missing_globals': [],
        }

        # 1) Orphaned items (deliverable deleted but items remain) - FK CASCADE prevents this normally
        # But check generated_date sanity and deliverable presence via select_related
        qs = PreDeliverableItem.objects.select_related('deliverable', 'pre_deliverable_type')
        for item in qs:
            if item.deliverable_id is None or item.deliverable is None:
                issues['orphans'].append(item.id)

        # 2) Verify generated_date calculations (if deliverable has a date)
        for item in qs:
            d = getattr(item.deliverable, 'date', None)
            if d is None:
                continue
            try:
                expected = working_days_before(d, int(item.days_before or 0))
            except Exception as e:
                issues['calc_mismatch'].append({'id': item.id, 'error': str(e)})
                continue
            if expected != item.generated_date:
                issues['calc_mismatch'].append({
                    'id': item.id,
                    'deliverable': item.deliverable_id,
                    'type': item.pre_deliverable_type_id,
                    'days_before': item.days_before,
                    'generated_date': item.generated_date.isoformat() if item.generated_date else None,
                    'expected': expected.isoformat(),
                })

        # 3) Duplicates (same deliverable+type)
        dupes = (
            qs.values('deliverable_id', 'pre_deliverable_type_id')
            .order_by()
            .annotate(cnt=models.Count('id'))
            .filter(cnt__gt=1)
        )
        for row in dupes:
            issues['duplicates'].append(row)

        # 4) Active types without global settings
        from core.models import PreDeliverableGlobalSettings
        type_ids = set(PreDeliverableType.objects.filter(is_active=True).values_list('id', flat=True))
        global_type_ids = set(PreDeliverableGlobalSettings.objects.values_list('pre_deliverable_type_id', flat=True))
        missing = sorted(type_ids - global_type_ids)
        for tid in missing:
            issues['missing_globals'].append(tid)

        # Output
        if output == 'json':
            self.stdout.write(json.dumps(issues))
        else:
            for k, v in issues.items():
                self.stdout.write(f"{k}: {len(v)}")
        logging.getLogger('management').info('validate_pre_deliverable_data', extra={'issues': issues})

