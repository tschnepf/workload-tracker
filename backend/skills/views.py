"""
Skills views - REST API endpoints for skills management
"""

from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from django.db.models import Q
from .models import SkillTag, PersonSkill
from .serializers import SkillTagSerializer, PersonSkillSerializer, PersonSkillSummarySerializer

class SkillTagViewSet(viewsets.ModelViewSet):
    """CRUD operations for skill tags"""
    queryset = SkillTag.objects.filter(is_active=True)
    serializer_class = SkillTagSerializer
    # Use global default permissions (IsAuthenticated)
    
    def get_queryset(self):
        """Filter by search term if provided"""
        queryset = super().get_queryset()
        search = self.request.query_params.get('search', '')
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | Q(category__icontains=search)
            )
        return queryset.order_by('name')

class PersonSkillViewSet(viewsets.ModelViewSet):
    """CRUD operations for person skills"""
    queryset = PersonSkill.objects.all()
    serializer_class = PersonSkillSerializer
    # Use global default permissions (IsAuthenticated)
    
    def get_queryset(self):
        """Filter by person if provided"""
        queryset = super().get_queryset()
        person_id = self.request.query_params.get('person')
        skill_type = self.request.query_params.get('skill_type')
        
        if person_id:
            queryset = queryset.filter(person_id=person_id)
        if skill_type:
            queryset = queryset.filter(skill_type=skill_type)
            
        return queryset.select_related('person', 'skill_tag').order_by('skill_type', 'skill_tag__name')
    
    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Get skill summary for a person"""
        person_id = request.query_params.get('person')
        if not person_id:
            return Response({'error': 'person parameter required'}, status=status.HTTP_400_BAD_REQUEST)
        
        skills = self.get_queryset().filter(person_id=person_id)
        serializer = PersonSkillSummarySerializer(skills, many=True)
        
        # Group by skill type
        grouped_skills = {
            'strengths': [],
            'development': [],
            'learning': []
        }
        
        for skill in serializer.data:
            skill_type = skill['skillType']
            if skill_type in grouped_skills:
                grouped_skills[skill_type].append(skill)
        
        return Response(grouped_skills)
