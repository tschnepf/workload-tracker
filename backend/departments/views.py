from rest_framework import viewsets
from .models import Department
from .serializers import DepartmentSerializer

class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.filter(is_active=True).order_by('name')
    serializer_class = DepartmentSerializer
    permission_classes = []  # Remove auth requirement to match people API