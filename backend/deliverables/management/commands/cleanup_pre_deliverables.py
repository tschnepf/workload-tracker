import json
import logging
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Delete all pre-deliverable items with optional export (rollback helper)"

    def add_arguments(self, parser):
        parser.add_argument('--confirm', type=str, help='Type YES to confirm deletion')
        parser.add_argument('--export', type=str, help='File path to export items as JSON before deletion')

    def handle(self, *args, **options):
        from deliverables.models import PreDeliverableItem
        confirm = options.get('confirm')
        export = options.get('export')
        if confirm != 'YES':
            raise CommandError("Refusing to delete without --confirm YES")

        qs = PreDeliverableItem.objects.all().select_related('deliverable', 'pre_deliverable_type')
        count = qs.count()
        if export:
            data = []
            for it in qs:
                data.append({
                    'id': it.id,
                    'deliverable': it.deliverable_id,
                    'type': it.pre_deliverable_type_id,
                    'generated_date': it.generated_date.isoformat() if it.generated_date else None,
                    'days_before': it.days_before,
                    'is_completed': it.is_completed,
                    'completed_date': it.completed_date.isoformat() if it.completed_date else None,
                    'notes': it.notes,
                    'is_active': it.is_active,
                })
            with open(export, 'w', encoding='utf-8') as f:
                json.dump(data, f)
            self.stdout.write(f"Exported {count} items to {export}")

        deleted, _ = qs.delete()
        self.stdout.write(f"Deleted {deleted} PreDeliverableItem records")
        logging.getLogger('management').warning('cleanup_pre_deliverables', extra={'deleted': deleted})

