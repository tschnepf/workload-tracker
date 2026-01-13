from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from django.utils import timezone
from django.utils.http import http_date
import hashlib

from projects.roles_serializers import (
    ProjectRoleItemSerializer,
    ProjectRoleCreateSerializer,
    ProjectRoleUpdateSerializer,
    normalize_name,
)
from projects.roles_selectors import list_roles_by_department, last_updated_timestamp_for_department
from projects.models import ProjectRole
from accounts.permissions import IsAdminOrManager
from assignments.models import Assignment


class ProjectRoleListCreateView(APIView):
    def get_permissions(self):
        if self.request.method.upper() == 'POST':
            return [IsAuthenticated(), IsAdminOrManager()]
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
        roles_list = list(roles)
        data = ProjectRoleItemSerializer(roles_list, many=True).data
        # ETag/Last-Modified hints (include sort_order/is_active/updated_at to avoid stale lists)
        lm = last_updated_timestamp_for_department(dept_id)
        etag_payload = 'prlist-' + str(dept_id) + '-' + '|'.join(
            f"{r.id}:{r.sort_order}:{int(r.is_active)}:{int(r.updated_at.timestamp()) if r.updated_at else 0}"
            for r in roles_list
        )
        etag = hashlib.sha256(etag_payload.encode('utf-8')).hexdigest()
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
    permission_classes = [IsAuthenticated, IsAdminOrManager]

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
        # Hard-delete: attempt permanent delete; respect PROTECT on FK usage
        try:
            obj.delete()
        except Exception as e:
            from django.db.models.deletion import ProtectedError
            if isinstance(e, ProtectedError):
                # Role is referenced; return 409 conflict
                return Response({'detail': 'protected'}, status=409)
            raise
        # No content on success
        return Response(status=204)


class ProjectRoleUsageView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrManager]

    @extend_schema(
        responses=inline_serializer(
            name='ProjectRoleUsageResponse',
            fields={
                'count': serializers.IntegerField(),
                'assignments': serializers.ListField(
                    child=inline_serializer(
                        name='ProjectRoleUsageAssignment',
                        fields={
                            'id': serializers.IntegerField(),
                            'person': inline_serializer(
                                name='ProjectRoleUsagePerson',
                                fields={
                                    'id': serializers.IntegerField(allow_null=True),
                                    'name': serializers.CharField(allow_blank=True),
                                },
                            ),
                            'project': inline_serializer(
                                name='ProjectRoleUsageProject',
                                fields={
                                    'id': serializers.IntegerField(allow_null=True),
                                    'name': serializers.CharField(allow_blank=True),
                                },
                            ),
                        },
                    )
                ),
            },
        )
    )
    def get(self, request, id: int):
        try:
            rid = int(id)
            if rid <= 0:
                raise ValueError
        except Exception:
            return Response({'detail': 'invalid id'}, status=400)
        role = ProjectRole.objects.filter(id=rid).first()
        if not role:
            return Response({'detail': 'not found'}, status=404)
        qs = (
            Assignment.objects.filter(role_on_project_ref_id=rid)
            .select_related('person', 'project')
            .order_by('project_id', 'person_id', 'id')
        )
        data = []
        for a in qs:
            person_name = getattr(a.person, 'name', '') if a.person_id else ''
            project_name = getattr(a.project, 'name', None) if a.project_id else None
            if not project_name:
                project_name = a.project_name or ''
            data.append({
                'id': a.id,
                'person': {'id': a.person_id, 'name': person_name or ''},
                'project': {'id': a.project_id, 'name': project_name or ''},
            })
        return Response({'count': len(data), 'assignments': data})


class ProjectRoleClearAssignmentsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrManager]

    @extend_schema(
        request=None,
        responses=inline_serializer(
            name='ProjectRoleClearAssignmentsResponse',
            fields={'cleared': serializers.IntegerField()},
        )
    )
    def post(self, request, id: int):
        try:
            rid = int(id)
            if rid <= 0:
                raise ValueError
        except Exception:
            return Response({'detail': 'invalid id'}, status=400)
        role = ProjectRole.objects.filter(id=rid).first()
        if not role:
            return Response({'detail': 'not found'}, status=404)
        cleared = Assignment.objects.filter(role_on_project_ref_id=rid).update(
            role_on_project_ref=None,
            role_on_project=None,
            updated_at=timezone.now(),
        )
        return Response({'cleared': cleared})


class ProjectRoleReorderView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrManager]

    @extend_schema(
        request=inline_serializer(name='ProjectRoleReorderRequest', fields={
            'ids': serializers.ListField(child=serializers.IntegerField()),
        }),
        responses=inline_serializer(name='ProjectRoleReorderResponse', fields={'detail': serializers.CharField()}),
    )
    def post(self, request):
        dept_param = request.query_params.get('department')
        try:
            dept_id = int(dept_param) if dept_param is not None else None
        except Exception:
            return Response({'detail': 'invalid department'}, status=400)
        if not dept_id:
            return Response({'detail': 'department is required'}, status=400)
        ids = request.data.get('ids')
        if not isinstance(ids, list) or not all(isinstance(x, int) for x in ids):
            return Response({'detail': 'ids[] required'}, status=400)
        qs = ProjectRole.objects.filter(department_id=dept_id, id__in=ids).values_list('id', flat=True)
        have = set(qs)
        if len(have) != len(set(ids)):
            return Response({'detail': 'ids contain roles from another department or invalid ids'}, status=400)
        from django.db import transaction
        with transaction.atomic():
            step = 10
            for idx, rid in enumerate(ids):
                ProjectRole.objects.filter(id=rid).update(sort_order=(idx + 1) * step)
        return Response({'detail': 'ok'})
