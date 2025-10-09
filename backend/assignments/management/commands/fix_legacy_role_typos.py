from django.core.management.base import BaseCommand, CommandParser
from django.db import transaction


def _norm(s: str) -> str:
    return ' '.join((s or '').strip().split()).lower()


class Command(BaseCommand):
    help = (
        "Fix legacy role_on_project string typos before FK backfill. "
        "Default mapping: {'Mechanica': 'Mechanical'}."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument('--dry-run', action='store_true', help='Only report changes without writing')

    def handle(self, *args, **options):
        from assignments.models import Assignment

        dry_run = bool(options.get('dry_run'))
        # Built-in minimal typo map; extend as needed
        typo_map = {
            'Mechanica': 'Mechanical',
        }
        # Build normalized lookup
        norm_map = { _norm(src): dst for src, dst in typo_map.items() }

        qs = Assignment.objects.exclude(role_on_project__isnull=True).exclude(role_on_project__exact='')
        candidates = []
        for a in qs.only('id', 'role_on_project').iterator():
            if _norm(a.role_on_project) in norm_map:
                candidates.append((a.id, a.role_on_project, norm_map[_norm(a.role_on_project)]))

        if dry_run:
            self.stdout.write(self.style.WARNING(f'DRY RUN: {len(candidates)} assignments would be updated'))
            for (aid, before, after) in candidates[:50]:
                self.stdout.write(f'  id={aid}: "{before}" -> "{after}"')
            return 0

        updated = 0
        with transaction.atomic():
            for (aid, _before, after) in candidates:
                Assignment.objects.filter(id=aid).update(role_on_project=after)
                updated += 1
        self.stdout.write(self.style.SUCCESS(f'Updated {updated} assignments'))
        return 0

