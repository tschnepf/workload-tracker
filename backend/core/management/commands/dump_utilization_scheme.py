from django.core.management.base import BaseCommand, CommandError
import json
from pathlib import Path
from core.models import UtilizationScheme


class Command(BaseCommand):
    help = "Dump the current UtilizationScheme to a JSON file"

    def add_arguments(self, parser):
        parser.add_argument('--file', required=True, help='Path to write JSON dump (use - for stdout)')

    def handle(self, *args, **options):
        out_path = options['file']
        scheme = UtilizationScheme.get_active()
        payload = {
            'mode': scheme.mode,
            'blue_min': scheme.blue_min,
            'blue_max': scheme.blue_max,
            'green_min': scheme.green_min,
            'green_max': scheme.green_max,
            'orange_min': scheme.orange_min,
            'orange_max': scheme.orange_max,
            'red_min': scheme.red_min,
            'zero_is_blank': scheme.zero_is_blank,
            'version': scheme.version,
            'updated_at': scheme.updated_at.isoformat() if scheme.updated_at else None,
        }

        if out_path == '-' or out_path.strip() == '-':
            self.stdout.write(json.dumps(payload, indent=2))
            return

        path = Path(out_path)
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(payload, indent=2), encoding='utf-8')
        except Exception as e:
            raise CommandError(f"Failed to write file: {e}")

        self.stdout.write(self.style.SUCCESS(f"Utilization scheme dumped to {path}"))

