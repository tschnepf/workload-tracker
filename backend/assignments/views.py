"""
Assignment API Views - Chunk 3
Uses AutoMapped serializers for naming prevention
"""

from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.throttling import UserRateThrottle
from django.db.models import Sum
from .models import Assignment
from .serializers import AssignmentSerializer
from people.models import Person
from projects.models import Project

class HotEndpointThrottle(UserRateThrottle):
    """Special throttle for hot endpoints like conflict checking"""
    scope = 'hot_endpoint'

class AssignmentViewSet(viewsets.ModelViewSet):
    """
    Assignment CRUD API with utilization tracking
    Uses AutoMapped serializer for automatic snake_case ↔ camelCase conversion
    """
    queryset = Assignment.objects.filter(is_active=True).select_related('person').order_by('-created_at')
    serializer_class = AssignmentSerializer
    permission_classes = []  # Remove auth for Chunk 3 testing
    
    def list(self, request):
        """Get all assignments with person details and optional project filtering"""
        queryset = self.get_queryset()
        
        # Filter by project if specified
        project_id = request.query_params.get('project')
        if project_id:
            try:
                project_id = int(project_id)
                queryset = queryset.filter(project_id=project_id)
            except ValueError:
                return Response({
                    'error': 'Invalid project ID format'
                }, status=status.HTTP_400_BAD_REQUEST)
        
        # Check if bulk loading is requested (Phase 2 optimization)
        if request.query_params.get('all') == 'true':
            # Return all assignments without pagination
            serializer = self.get_serializer(queryset, many=True)
            return Response(serializer.data)
        
        serializer = self.get_serializer(queryset, many=True)
        
        return Response({
            'results': serializer.data,
            'count': len(serializer.data)
        })
    
    def create(self, request, *args, **kwargs):
        """Create assignment with validation"""
        serializer = self.get_serializer(data=request.data)
        if serializer.is_valid():
            assignment = serializer.save()
            return Response(
                self.get_serializer(assignment).data, 
                status=status.HTTP_201_CREATED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['get'])
    def by_person(self, request):
        """Get assignments grouped by person"""
        person_id = request.query_params.get('person_id')
        if person_id:
            queryset = self.get_queryset().filter(person_id=person_id)
        else:
            queryset = self.get_queryset()
        
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['post'], throttle_classes=[HotEndpointThrottle])
    def check_conflicts(self, request):
        """
        Check assignment conflicts for a person in a specific week
        Optimized to prevent N+1 queries by fetching all person assignments in single query
        """
        try:
            person_id = request.data.get('personId')
            project_id = request.data.get('projectId') 
            week_key = request.data.get('weekKey')
            proposed_hours = float(request.data.get('proposedHours', 0))
            
            if not all([person_id, project_id, week_key]):
                return Response({
                    'error': 'Missing required fields: personId, projectId, weekKey'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Get person and validate capacity
            try:
                person = Person.objects.get(id=person_id)
            except Person.DoesNotExist:
                return Response({
                    'error': 'Person not found'
                }, status=status.HTTP_404_NOT_FOUND)
            
            person_capacity = person.weekly_capacity or 36
            
            # Get ALL assignments for this person in a single query with project info
            person_assignments = Assignment.objects.filter(
                person_id=person_id,
                is_active=True
            ).select_related('project')
            
            # Calculate current week hours and collect project assignments
            total_hours = 0
            current_assignments = []
            project_assignments = {}
            
            for assignment in person_assignments:
                # Get hours for the specific week from JSON field
                weekly_hours = assignment.weekly_hours or {}
                week_hours = weekly_hours.get(week_key, 0)
                
                if week_hours > 0:
                    total_hours += week_hours
                    project_name = assignment.project.name if assignment.project else f"Project {assignment.project_id}"
                    
                    # Group by project
                    if project_name not in project_assignments:
                        project_assignments[project_name] = 0
                    project_assignments[project_name] += week_hours
                    
                    current_assignments.append({
                        'projectName': project_name,
                        'hours': week_hours,
                        'assignmentId': assignment.id
                    })
            
            # Add proposed hours to total
            total_with_proposed = total_hours + proposed_hours
            
            # Generate warnings and conflict status
            warnings = []
            has_conflict = total_with_proposed > person_capacity
            
            if has_conflict:
                overage_hours = total_with_proposed - person_capacity
                overage_percent = round((total_with_proposed / person_capacity) * 100)
                warnings.append(
                    f"⚠️ {person.name} would be at {overage_percent}% capacity "
                    f"({total_with_proposed}h/{person_capacity}h) - {overage_hours}h over limit"
                )
                
                # Add project breakdown if there are existing assignments
                if project_assignments:
                    warnings.append("Current assignments:")
                    for project_name, hours in project_assignments.items():
                        warnings.append(f"• {project_name}: {hours}h")
            
            return Response({
                'hasConflict': has_conflict,
                'warnings': warnings,
                'totalHours': total_hours,
                'totalWithProposed': total_with_proposed,
                'personCapacity': person_capacity,
                'availableHours': max(0, person_capacity - total_hours),
                'currentAssignments': current_assignments,
                'projectBreakdown': project_assignments
            })
            
        except ValueError as e:
            return Response({
                'error': f'Invalid data format: {str(e)}'
            }, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({
                'error': f'Internal server error: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)