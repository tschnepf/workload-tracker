from __future__ import annotations

import json
import math
from typing import Dict, Any

from django.core.management.base import BaseCommand
from django.db import transaction

from assignments.models import Assignment
from core.week_utils import sunday_of_week
from datetime import date


def _normalize_map(weekly_hours: Dict[str, Any]) -> Dict[str, int]:
    """Normalize a weekly_hours mapping to Sunday keys with integer (ceil) hours.

    - Any key that is not a valid date is ignored.
    - Keys are normalized to the Sunday of their week.
    - Collisions (same Sunday) sum hours; rounding occurs after summation.
    - Negative/NaN values are treated as 0.
    - Returns a dict of { 'YYYY-MM-DD': int_hours } with only nonzero entries.
    """
    if not weekly_hours:
        return {}
    buckets: Dict[str, float] = {}
    for k, v in weekly_hours.items():
        try:
            d = date.fromisoformat(str(k))
        except Exception:
            continue
        try:
            hours = float(v)
            if not math.isfinite(hours) or hours < 0:
                hours = 0.0
        except Exception:
            hours = 0.0
        skey = sunday_of_week(d).isoformat()
        buckets[skey] = buckets.get(skey, 0.0) + hours

    # ceil after collision sum; drop zeros
    result: Dict[str, int] = {}
    for skey, total in buckets.items():
        n = int(math.ceil(total))
        if n > 0:
            result[skey] = n
    return result


class Command(BaseCommand):
    help = "Normalize Assignment.weekly_hours to Sunday keys and integer (ceil) hours."

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Apply changes (default is dry-run)')
        parser.add_argument('--json', action='store_true', help='Output summary as JSON')

    def handle(self, *args, **options):
        apply_changes: bool = bool(options.get('apply'))
        as_json: bool = bool(options.get('json'))

        qs = Assignment.objects.all().only('id', 'weekly_hours', 'updated_at')
        processed = 0
        changed = 0
        total_keys_shifted = 0
        total_collisions = 0
        total_hours_before = 0.0
        total_hours_after = 0.0

        per_assignment = []

        # Use a single transaction if applying
        context = transaction.atomic() if apply_changes else nullcontext()
        with context:
            for a in qs.iterator():
                processed += 1
                wh = a.weekly_hours or {}
                before_total = 0.0
                try:
                    before_total = sum(float(v or 0) for v in wh.values())
                except Exception:
                    # best-effort on malformed
                    before_total = 0.0

                normalized = _normalize_map(wh)

                # Count shifts and collisions
                # A collision occurs if multiple original keys mapped to the same Sunday key
                sunday_counts: Dict[str, int] = {}
                for k in (wh or {}).keys():
                    try:
                        d = date.fromisoformat(str(k))
                    except Exception:
                        continue
                    s = sunday_of_week(d).isoformat()
                    sunday_counts[s] = sunday_counts.get(s, 0) + 1
                collisions = sum(1 for c in sunday_counts.values() if c > 1)
                keys_shifted = sum(1 for k in wh.keys() if k not in normalized.keys())  # rough estimate

                after_total = sum(normalized.values())

                changed_flag = (normalized != (wh or {}))
                if changed_flag:
                    changed += 1
                    total_keys_shifted += keys_shifted
                    total_collisions += collisions
                    total_hours_before += before_total
                    total_hours_after += after_total

                    per_assignment.append({
                        'assignmentId': a.id,
                        'keysBefore': len(wh or {}),
                        'keysAfter': len(normalized),
                        'keysShifted': keys_shifted,
                        'collisions': collisions,
                        'totalBefore': before_total,
                        'totalAfter': after_total,
                    })

                    if apply_changes:
                        a.weekly_hours = normalized
                        a.save(update_fields=['weekly_hours', 'updated_at'])

        summary = {
            'processed': processed,
            'changed': changed,
            'totalKeysShifted': total_keys_shifted,
            'totalCollisions': total_collisions,
            'totalHoursBefore': total_hours_before,
            'totalHoursAfter': total_hours_after,
        }

        if as_json:
            self.stdout.write(json.dumps({'summary': summary, 'assignments': per_assignment}, default=str))
        else:
            self.stdout.write("Normalization summary:")
            self.stdout.write(json.dumps(summary, indent=2))
            if per_assignment:
                self.stdout.write("\nChanged assignments (top 50):")
                for row in per_assignment[:50]:
                    self.stdout.write(json.dumps(row))


# Context manager for dry-run path
class nullcontext:
    def __enter__(self):
        return None

    def __exit__(self, exc_type, exc, tb):
        return False

