from django.core.management.base import BaseCommand
from assignments.models import Assignment
from core.week_utils import sunday_of_week
from datetime import date


class Command(BaseCommand):
    help = "Scan Assignment.weekly_hours for non-Sunday keys; optionally fix by rekeying to Sunday."

    def add_arguments(self, parser):
        parser.add_argument('--fix', action='store_true', help='Rewrite non-Sunday keys to Sunday (canonical) keys')
        parser.add_argument('--window', type=int, default=0, help='Unused (reserved)')

    def handle(self, *args, **options):
        do_fix = bool(options.get('fix'))
        total = 0
        issues = 0
        fixed = 0
        for a in Assignment.objects.all().only('id', 'weekly_hours'):
            total += 1
            wh = a.weekly_hours or {}
            bad = {}
            out = {}
            changed = False
            for k, v in wh.items():
                try:
                    y, m, d = [int(x) for x in k.split('-')]
                    dt = date(y, m, d)
                except Exception:
                    issues += 1
                    bad[k] = v
                    continue
                key_sun = sunday_of_week(dt).isoformat()
                if key_sun != k:
                    issues += 1
                    bad[k] = v
                    changed = True
                    out[key_sun] = (out.get(key_sun, 0.0) + float(v or 0))
                else:
                    out[k] = float(v or 0)
            if do_fix and changed:
                a.weekly_hours = out
                a.save(update_fields=['weekly_hours', 'updated_at'])
                fixed += 1
        if do_fix:
            self.stdout.write(self.style.SUCCESS(f"Scanned {total} assignments; fixed {fixed}; issues found {issues}"))
        else:
            self.stdout.write(self.style.WARNING(f"Scanned {total} assignments; non-Sunday keys found: {issues}. Run with --fix to rekey."))

