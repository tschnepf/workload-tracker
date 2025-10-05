from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Count, Sum, Q
from datetime import date, timedelta
from django.core.cache import cache
from django.conf import settings
from people.models import Person
from assignments.models import Assignment
from drf_spectacular.utils import extend_schema, OpenApiParameter
import logging
from core.models import UtilizationScheme
from .serializers import DashboardResponseSerializer


class DashboardView(APIView):
    """Team dashboard with utilization metrics and overview"""
    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[
            OpenApiParameter(name='weeks', type=int, required=False, description='Number of weeks to aggregate (1-12)'),
            OpenApiParameter(name='department', type=int, required=False, description='Filter by department id'),
        ],
        responses=DashboardResponseSerializer
    )
    def get(self, request):
        # Get weeks parameter from query string (default to 1)
        weeks = int(request.GET.get('weeks', 1))
        weeks = max(1, min(12, weeks))  # Clamp between 1-12 weeks
        
        # Get department filter parameter
        department_id = request.GET.get('department')
        department_filter = None
        if department_id:
            try:
                department_filter = int(department_id)
            except (ValueError, TypeError):
                department_filter = None

        # Short-TTL cache wrapper (feature-flagged)
        use_cache = bool(settings.FEATURES.get('SHORT_TTL_AGGREGATES'))
        cache_key = None
        if use_cache:
            # Keyed by weeks + department (None -> 'all')
            cache_key = f"dashboard_v1:{weeks}:{department_filter if department_filter is not None else 'all'}"
            try:
                cached = cache.get(cache_key)
            except Exception:
                cached = None
            if cached is not None:
                return Response(cached)
        
        today = date.today()
        week_start = today - timedelta(days=today.weekday())
        week_end = week_start + timedelta(days=6)
        
        # Get active people, optionally filtered by department
        active_people = Person.objects.filter(is_active=True)
        if department_filter:
            active_people = active_people.filter(department_id=department_filter)
        total_people = active_people.count()
        
        # Calculate utilization distribution
        utilization_ranges = {
            'underutilized': 0,  # < 70%
            'optimal': 0,         # 70-85%
            'high': 0,            # 85-100%
            'overallocated': 0    # > 100%
        }
        
        team_overview = []
        available_people = []
        total_utilization = 0
        peak_utilization = 0
        peak_person_name = None
        
        # Helper: get active scheme with a short in-process cache to avoid hot-path DB hits
        def get_scheme_cached():
            try:
                cache_key_scheme = 'utilization_scheme:active'
                sch = cache.get(cache_key_scheme)
                if sch is None:
                    sch = UtilizationScheme.get_active()
                    # Cache for 60s
                    try:
                        cache.set(cache_key_scheme, sch, 60)
                    except Exception:
                        pass
                return sch
            except Exception:
                return UtilizationScheme.get_active()

        use_scheme = bool(settings.FEATURES.get('UTILIZATION_SCHEME_ENABLED', True))
        scheme = get_scheme_cached() if use_scheme else None

        for person in active_people:
            # Use multi-week utilization calculation
            utilization_data = person.get_utilization_over_weeks(weeks)
            percent = utilization_data['total_percentage']
            peak_percent = utilization_data['peak_percentage']
            total_utilization += percent
            
            # Track overall peak utilization
            if peak_percent > peak_utilization:
                peak_utilization = peak_percent
                peak_person_name = person.name
            
            # Categorize utilization using UtilizationScheme when enabled
            if scheme and scheme.mode == UtilizationScheme.MODE_ABSOLUTE:
                hours = utilization_data.get('allocated_hours') or 0
                # Guardrails: clamp negatives and warn
                if hours < 0:
                    try:
                        logging.getLogger('monitoring').warning('negative_allocated_hours_clamped', extra={'person_id': person.id, 'hours': hours})
                    except Exception:
                        pass
                    hours = 0
                # Zero hours: treat as underutilized for distribution purposes
                if hours >= (scheme.red_min or 41):
                    utilization_ranges['overallocated'] += 1
                elif hours >= scheme.orange_min and hours <= scheme.orange_max:
                    utilization_ranges['high'] += 1
                elif hours >= scheme.green_min and hours <= scheme.green_max:
                    utilization_ranges['optimal'] += 1
                elif hours >= scheme.blue_min and hours <= scheme.blue_max:
                    utilization_ranges['underutilized'] += 1
                else:
                    # Outside configured bounds; clamp into nearest bucket
                    if hours <= 0 or hours < scheme.blue_min:
                        utilization_ranges['underutilized'] += 1
                    else:
                        utilization_ranges['overallocated'] += 1

                # Available people list mirrors underutilized bucket
                if (hours <= 0) or (hours < scheme.green_min):
                    available_people.append({
                        'id': person.id,
                        'name': person.name,
                        'available_hours': utilization_data['available_hours'],
                        'utilization_percent': percent,
                    })
            else:
                # Percent-mode (or feature disabled) fallback to thresholds 70/85/100
                if percent < 70:
                    utilization_ranges['underutilized'] += 1
                    available_people.append({
                        'id': person.id,
                        'name': person.name,
                        'available_hours': utilization_data['available_hours'],
                        'utilization_percent': percent
                    })
                elif percent <= 85:
                    utilization_ranges['optimal'] += 1
                elif percent <= 100:
                    utilization_ranges['high'] += 1
                else:
                    utilization_ranges['overallocated'] += 1
            
            # Add to team overview
            team_overview.append({
                'id': person.id,
                'name': person.name,
                'role': person.role.name if person.role else 'No Role',
                'utilization_percent': percent,
                'allocated_hours': utilization_data['allocated_hours'],
                'capacity': person.weekly_capacity,
                'is_overallocated': utilization_data['is_overallocated'],
                'peak_utilization_percent': peak_percent,
                'peak_week': utilization_data['peak_week_key'],
                'is_peak_overallocated': utilization_data['is_peak_overallocated']
            })
        
        # Calculate average utilization
        avg_utilization = round(total_utilization / total_people, 1) if total_people > 0 else 0
        
        # Get total active assignments, optionally filtered by department
        assignments_qs = Assignment.objects.filter(is_active=True)
        if department_filter:
            assignments_qs = assignments_qs.filter(person__department_id=department_filter)
        total_assignments = assignments_qs.count()
        
        # Recent assignments (last 7 days), optionally filtered by department
        recent_assignments = []
        recent_assignment_qs = Assignment.objects.filter(
            created_at__gte=today - timedelta(days=7)
        ).select_related('person')
        
        if department_filter:
            recent_assignment_qs = recent_assignment_qs.filter(person__department_id=department_filter)
            
        recent_assignment_qs = recent_assignment_qs.order_by('-created_at')[:5]
        
        for assignment in recent_assignment_qs:
            recent_assignments.append({
                'person': assignment.person.name,
                'project': assignment.project_display,
                'created': assignment.created_at.isoformat()
            })
        
        payload = {
            'summary': {
                'total_people': total_people,
                'avg_utilization': avg_utilization,
                'peak_utilization': round(peak_utilization, 1),
                'peak_person': peak_person_name,
                'total_assignments': total_assignments,
                'overallocated_count': utilization_ranges['overallocated']
            },
            'utilization_distribution': utilization_ranges,
            'team_overview': sorted(team_overview, key=lambda x: x['name']),
            'available_people': sorted(available_people, key=lambda x: -x['available_hours'])[:5],
            'recent_assignments': recent_assignments
        }

        # Store in cache with short TTL if enabled
        if use_cache and cache_key is not None:
            # TTL preference: DASHBOARD_CACHE_TTL > AGGREGATE_CACHE_TTL > default(30)
            ttl = getattr(settings, 'DASHBOARD_CACHE_TTL', None)
            if ttl is None:
                ttl = getattr(settings, 'AGGREGATE_CACHE_TTL', 30)
            try:
                cache.set(cache_key, payload, timeout=int(ttl))
            except Exception:
                pass

        return Response(payload)
