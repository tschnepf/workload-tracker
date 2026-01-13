from typing import List, Dict
from datetime import date, timedelta
from django.db.models import Prefetch
from django.core.cache import cache
import logging

logger = logging.getLogger('cache_performance')


class CapacityAnalysisService:
    @staticmethod
    def get_capacity_heatmap(people_queryset, weeks: int = 12, cache_scope: str = "all") -> List[Dict]:
        """Compute per-person utilization summaries over N weeks.

        Expects people_queryset to be filtered (e.g., active only) and may include
        select_related('department') to avoid N+1.
        """
        try:
            version = cache.get('analytics_cache_version', 1)
        except Exception:
            version = 1
        key = f"capacity_heatmap_v{version}_{cache_scope}_{weeks}"
        try:
            cached = cache.get(key)
        except Exception as e:
            cached = None
            logger.warning("Cache GET failed: %s", key)
        if cached is not None:
            logger.info("Cache HIT: %s", key, extra={'cache_hit': True})
            return cached
        logger.info("Cache MISS: %s", key, extra={'cache_hit': False})

        result: List[Dict] = []
        for p in people_queryset:
            util = p.get_utilization_over_weeks_sunday(weeks=weeks)
            result.append({
                'id': p.id,
                'name': p.name,
                'weeklyCapacity': p.weekly_capacity,
                'department': p.department.name if getattr(p, 'department', None) else None,
                'weekKeys': util.get('week_keys', []),
                'weekTotals': util.get('week_totals', {}),
                'peak': {
                    'weekKey': util.get('peak_week_key'),
                    'percentage': util.get('peak_percentage'),
                },
                'averagePercentage': util.get('total_percentage'),
            })
        try:
            cache.set(key, result, timeout=300)
        except Exception:
            logger.warning("Cache SET failed: %s", key)
        return result

    @staticmethod
    def get_workload_forecast(people_queryset, weeks: int = 8, cache_scope: str = "all") -> List[Dict]:
        """Aggregate team capacity vs allocated for N weeks ahead.

        The queryset should prefetch active assignments to avoid N+1 at call site.
        """
        # Sunday-only week starts
        from core.week_utils import sunday_of_week
        today = date.today()
        start_sunday = sunday_of_week(today)
        week_starts = [start_sunday + timedelta(weeks=w) for w in range(weeks)]

        # Total capacity across team (constant across weeks)
        total_capacity_per_week = sum((p.weekly_capacity or 0) for p in people_queryset)

        def hours_for_week(assignment, sunday_date: date) -> float:
            wh = assignment.weekly_hours or {}
            key = sunday_date.strftime('%Y-%m-%d')
            try:
                return float(wh.get(key) or 0)
            except Exception:
                return 0.0

        try:
            version = cache.get('analytics_cache_version', 1)
        except Exception:
            version = 1
        key = f"workload_forecast_v{version}_{cache_scope}_{weeks}"
        try:
            cached = cache.get(key)
        except Exception:
            cached = None
            logger.warning("Cache GET failed: %s", key)
        if cached is not None:
            logger.info("Cache HIT: %s", key, extra={'cache_hit': True})
            return cached
        logger.info("Cache MISS: %s", key, extra={'cache_hit': False})

        forecast: List[Dict] = []
        for week_start in week_starts:
            total_allocated = 0.0
            overallocated = []
            for p in people_queryset:
                person_alloc = 0.0
                for a in getattr(p, 'assignments').all():
                    person_alloc += hours_for_week(a, week_start)
                total_allocated += person_alloc
                if person_alloc > (p.weekly_capacity or 0):
                    overallocated.append({'id': p.id, 'name': p.name})

            team_util = round((total_allocated / total_capacity_per_week * 100), 1) if total_capacity_per_week else 0
            forecast.append({
                'weekStart': week_start.strftime('%Y-%m-%d'),
                'totalCapacity': total_capacity_per_week,
                'totalAllocated': round(total_allocated, 1),
                'teamUtilization': team_util,
                'peopleOverallocated': overallocated,
            })

        try:
            cache.set(key, forecast, timeout=600)
        except Exception:
            logger.warning("Cache SET failed: %s", key)
        return forecast


# --- Deactivation cleanup utilities ---
from django.db import transaction
from django.db.utils import ProgrammingError, OperationalError
from django.utils import timezone
from typing import Any
from people.models import Person, DeactivationAudit
from assignments.models import Assignment
from deliverables.models import DeliverableAssignment


def _bump_analytics_cache_version() -> None:
    key = 'analytics_cache_version'
    try:
        cache.incr(key)
    except Exception:
        current = cache.get(key, 1)
        try:
            cache.set(key, int(current) + 1, None)
        except Exception:  # nosec B110
            pass


def deactivate_person_cleanup(person_id: int, zero_mode: str = 'all', actor_user_id: int | None = None) -> Dict[str, Any]:
    """Cleanup assignments and links when a person is deactivated.

    - Set Assignment.is_active=False for all their assignments
    - Zero out weekly_hours (all by default; or only future weeks if zero_mode == 'future')
    - Set end_date to today when applicable
    - Deactivate DeliverableAssignment links (is_active=False)
    - Create DeactivationAudit with summary metrics
    - Bump analytics cache version to invalidate aggregates
    """
    from core.week_utils import sunday_of_week
    today = timezone.now().date()
    this_week = sunday_of_week(today).isoformat()

    with transaction.atomic():
        person = Person.objects.select_for_update().get(id=person_id)

        assignments = list(Assignment.objects.select_for_update().filter(person_id=person_id))
        assignments_touched = len(assignments)
        assignments_deactivated = 0
        hours_zeroed_total = 0.0
        week_keys_touched: set[str] = set()

        for a in assignments:
            # Sum existing hours for audit
            try:
                if a.weekly_hours:
                    hours_zeroed_total += sum(float(v or 0) for v in a.weekly_hours.values())
            except Exception:  # nosec B110
                pass

            wh = a.weekly_hours or {}
            if zero_mode == 'future':
                new_wh = {}
                for wk, v in wh.items():
                    try:
                        if wk < this_week:
                            new_wh[wk] = v
                        else:
                            week_keys_touched.add(wk)
                    except Exception:
                        new_wh[wk] = v
                wh = new_wh
            else:
                for wk in wh.keys():
                    week_keys_touched.add(wk)
                wh = {}

            a.weekly_hours = wh
            if a.is_active:
                a.is_active = False
                assignments_deactivated += 1
            if a.end_date is None or (a.end_date and a.end_date > today):
                a.end_date = today
            a.save(update_fields=['weekly_hours', 'is_active', 'end_date', 'updated_at'])

        # Deactivate deliverable links
        links_qs = DeliverableAssignment.objects.select_for_update().filter(person_id=person_id, is_active=True)
        deliverable_links_deactivated = links_qs.update(is_active=False)

        # Audit (non-blocking): tolerate write failures so cleanup never rolls back
        audit_id = None
        try:
            audit = DeactivationAudit.objects.create(
                person=person,
                user_id=actor_user_id,
                mode=zero_mode,
                assignments_touched=assignments_touched,
                assignments_deactivated=assignments_deactivated,
                hours_zeroed=float(round(hours_zeroed_total, 2)),
                week_keys_touched=sorted(list(week_keys_touched)),
                deliverable_links_deactivated=int(deliverable_links_deactivated or 0),
            )
            audit_id = audit.id
        except (ProgrammingError, OperationalError) as e:
            # Common during rollout if the migration hasn't applied yet in a worker
            logger.warning("DeactivationAudit write skipped (non-blocking): %s", e)
        except Exception as e:
            logger.warning("DeactivationAudit write failed (non-blocking): %s", e)

        _bump_analytics_cache_version()

        return {
            'audit_id': audit_id,
            'assignments_touched': assignments_touched,
            'assignments_deactivated': assignments_deactivated,
            'hours_zeroed': float(round(hours_zeroed_total, 2)),
            'deliverable_links_deactivated': int(deliverable_links_deactivated or 0),
        }
