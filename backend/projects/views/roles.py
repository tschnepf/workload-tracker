from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework import status
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from django.utils.http import http_date
import hashlib

from projects.serializers.roles import (
    ProjectRoleItemSerializer,
    ProjectRoleCreateSerializer,
    ProjectRoleUpdateSerializer,
    normalize_name,
)
from projects.selectors.roles import list_roles_by_department, last_updated_timestamp_for_department
from projects.models import ProjectRole


class ProjectRoleListCreateView(APIView):
    def get_permissions(self):
        if self.request.method.upper() == 'POST':
            return [IsAuthenticated(), IsAdminUser()]
        return [IsAuthenticated()]

    @extend_schema(responses=ProjectRoleItemSerializer(many=True))
    def get(self, request):
        dept_param = request.query_params.get('department')
        try:
            dept_id = int(dept_param) if dept_param is not None else None
        except Exception:
            return Response({'detail': 'invalid department'}, status=400)
        if not dept_id:
            return Response({'detail': 'department is required'}, status=400)
        include_inactive = (request.query_params.get('include_inactive') or '').lower() in ('1', 'true', 'yes')
        roles = list_roles_by_department(dept_id, include_inactive=include_inactive)
        data = ProjectRoleItemSerializer(roles, many=True).data
        # ETag/Last-Modified hints
        lm = last_updated_timestamp_for_department(dept_id)
        etag = hashlib.md5(('prlist-'+str(dept_id)+'-'+','.join(str(it['id']) for it in data)).encode('utf-8')).hexdigest()
        inm = request.META.get('HTTP_IF_NONE_MATCH')
        if inm and inm.strip('"') == etag:
            resp = Response(status=status.HTTP_304_NOT_MODIFIED)
            resp['ETag'] = f'"{etag}"'
            if lm:
                resp['Last-Modified'] = http_date(lm.timestamp())
            return resp
        resp = Response(data)
        resp['ETag'] = f'"{etag}"'
        if lm:
            resp['Last-Modified'] = http_date(lm.timestamp())
        return resp

    @extend_schema(request=ProjectRoleCreateSerializer, responses=ProjectRoleItemSerializer)
    def post(self, request):
        s = ProjectRoleCreateSerializer(data=request.data)
        if not s.is_valid():
            # 409 for name conflict, 400 otherwise
            if s.errors.get('name') == ['conflict']:
                return Response({'detail': 'conflict'}, status=409)
            return Response(s.errors, status=400)
        dept_id = s.validated_data['department']
        name = s.validated_data['name']
        norm = s.validated_data['normalized_name']
        sort_order = s.validated_data.get('sortOrder') or 0
        obj = ProjectRole.objects.create(
            department_id=dept_id,
            name=name,
            normalized_name=norm,
            sort_order=sort_order,
            is_active=True,
        )
        return Response(ProjectRoleItemSerializer(obj).data, status=201)


class ProjectRoleDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    @extend_schema(request=ProjectRoleUpdateSerializer, responses=ProjectRoleItemSerializer)
    def patch(self, request, id: int):
        try:
            rid = int(id)
            if rid <= 0:
                raise ValueError
        except Exception:
            return Response({'detail': 'invalid id'}, status=400)
        obj = ProjectRole.objects.filter(id=rid).first()
        if not obj:
            return Response({'detail': 'not found'}, status=404)
        s = ProjectRoleUpdateSerializer(data=request.data, partial=True)
        if not s.is_valid():
            return Response(s.errors, status=400)
        data = s.validated_data
        if 'name' in data:
            norm = data.get('normalized_name')
            # Uniqueness check for new name within department
            if ProjectRole.objects.filter(department=obj.department, normalized_name=norm).exclude(id=obj.id).exists():
                return Response({'detail': 'conflict'}, status=409)
            obj.name = data['name']
            obj.normalized_name = norm
        if 'isActive' in data:
            obj.is_active = bool(data['isActive'])
        if 'sortOrder' in data:
            obj.sort_order = int(data['sortOrder'])
        obj.save(update_fields=['name', 'normalized_name', 'is_active', 'sort_order', 'updated_at'])
        return Response(ProjectRoleItemSerializer(obj).data)

    @extend_schema(responses=inline_serializer(name='ProjectRoleDeleteResponse', fields={'detail': serializers.CharField()}))
    def delete(self, request, id: int):
        try:
            rid = int(id)
            if rid <= 0:
                raise ValueError
        except Exception:
            return Response({'detail': 'invalid id'}, status=400)
        obj = ProjectRole.objects.filter(id=rid).first()
        if not obj:
            return Response({'detail': 'not found'}, status=404)
        # Soft-delete: set inactive
        obj.is_active = False
        obj.save(update_fields=['is_active', 'updated_at'])
        return Response({'detail': 'deleted'})
