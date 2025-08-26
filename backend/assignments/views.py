from rest_framework import viewsets, permissions
from .models import Assignment
from .serializers import AssignmentSerializer

class AssignmentViewSet(viewsets.ModelViewSet):
    queryset = Assignment.objects.filter(is_active=True)
    serializer_class = AssignmentSerializer
    permission_classes = [permissions.IsAuthenticated]