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
