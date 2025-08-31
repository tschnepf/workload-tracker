from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.db.models import Count, Sum, Q
from datetime import date, timedelta
from people.models import Person
from assignments.models import Assignment


class DashboardView(APIView):
    """Team dashboard with utilization metrics and overview"""
    permission_classes = [AllowAny]
    
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
            
            # Categorize utilization
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
        
        return Response({
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
        })
