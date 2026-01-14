from __future__ import annotations

from rest_framework import viewsets, permissions, status
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema, OpenApiResponse, OpenApiTypes
from django.shortcuts import get_object_or_404
from django.http import FileResponse

from .models import ProjectRisk
from .serializers import ProjectRiskSerializer


class ProjectRiskViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectRiskSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    lookup_url_kwarg = 'risk_id'

    def get_queryset(self):
        project_id = self.kwargs.get('project_id')
        if not project_id:
            return ProjectRisk.objects.none()
        return (
            ProjectRisk.objects
            .filter(project_id=project_id)
            .select_related('created_by', 'updated_by', 'created_by__profile', 'created_by__profile__person', 'updated_by__profile', 'updated_by__profile__person')
            .prefetch_related('departments')
        )

    def perform_create(self, serializer):
        project_id = self.kwargs.get('project_id')
        serializer.save(project_id=project_id, created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)


@extend_schema(
    responses={
        200: OpenApiResponse(description='Risk attachment file', response=OpenApiTypes.BINARY),
        404: OpenApiResponse(description='No attachment found'),
    }
)
class ProjectRiskAttachmentDownloadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, project_id: int, risk_id: int):
        risk = get_object_or_404(ProjectRisk, pk=risk_id, project_id=project_id)
        if not risk.attachment:
            return Response({'detail': 'No attachment found'}, status=status.HTTP_404_NOT_FOUND)
        file_handle = risk.attachment.open('rb')
        filename = risk.attachment.name.split('/')[-1]
        return FileResponse(file_handle, as_attachment=True, filename=filename)
