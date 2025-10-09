from django.core.management.base import BaseCommand, CommandParser
from django.db import transaction
from projects.models import ProjectRole
import csv
from pathlib import Path


def normalize_name(name: str) -> str:
    return ' '.join((name or '').strip().split()).lower()


class Command(BaseCommand):
    help = 'Import department-scoped project roles from CSV (columns: department_id, role_name, [sort_order])'

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument('csv_path', type=str, help='Path to CSV file')
        parser.add_argument('--dry-run', action='store_true', help='Only print actions without writing')

    def handle(self, *args, **options):
        csv_path = Path(options['csv_path'])
        dry_run = bool(options.get('dry_run'))
        if not csv_path.exists():
            self.stderr.write(self.style.ERROR(f'File not found: {csv_path}'))
            return 1
        created = 0
        skipped = 0
        with csv_path.open('r', newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            if not {'department_id', 'role_name'}.issubset(set(reader.fieldnames or [])):
                self.stderr.write(self.style.ERROR('CSV must have columns: department_id, role_name [, sort_order]'))
                return 1
            entries: list[tuple[int, str, int]] = []
            for row in reader:
                try:
                    dept_id = int(row['department_id'])
                except Exception:
                    continue
                name = (row.get('role_name') or '').strip()
                if not name:
                    continue
                sort_order = 0
                try:
                    sort_order = int(row.get('sort_order') or 0)
                except Exception:
                    sort_order = 0
                entries.append((dept_id, name, sort_order))

        if dry_run:
            self.stdout.write(self.style.WARNING(f'DRY RUN: {len(entries)} entries parsed'))
        with transaction.atomic():
            for dept_id, name, sort_order in entries:
                norm = normalize_name(name)
                if ProjectRole.objects.filter(department_id=dept_id, normalized_name=norm).exists():
                    skipped += 1
                    continue
                if not dry_run:
                    ProjectRole.objects.create(
                        department_id=dept_id,
                        name=name,
                        normalized_name=norm,
                        is_active=True,
                        sort_order=sort_order,
                    )
                created += 1
        self.stdout.write(self.style.SUCCESS(f'Created: {created}, Skipped: {skipped}'))
        return 0

