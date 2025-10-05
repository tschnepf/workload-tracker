from django.core.management.base import BaseCommand, CommandError
import json
from pathlib import Path
from core.models import UtilizationScheme
from core.serializers import UtilizationSchemeSerializer


class Command(BaseCommand):
    help = "Load a UtilizationScheme from a JSON file (validates and saves; bumps version)"

    def add_arguments(self, parser):
        parser.add_argument('--file', required=True, help='Path to JSON file to load')

    def handle(self, *args, **options):
        in_path = options['file']
        path = Path(in_path)
        if not path.exists():
            raise CommandError(f"File not found: {path}")
        try:
            payload = json.loads(path.read_text(encoding='utf-8'))
        except Exception as e:
            raise CommandError(f"Failed to read/parse JSON: {e}")

        inst = UtilizationScheme.get_active()
        ser = UtilizationSchemeSerializer(instance=inst, data=payload, partial=False)
        ser.is_valid(raise_exception=True)

        # Apply and bump version
        for k, v in ser.validated_data.items():
            setattr(inst, k, v)
        inst.version = (inst.version or 0) + 1
        inst.save()

        self.stdout.write(self.style.SUCCESS(
            f"Utilization scheme loaded and saved (new version: {inst.version})"
        ))

