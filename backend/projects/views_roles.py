from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from django.utils import timezone
from django.utils.http import http_date
import hashlib
from django.db.models import Q

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

PROJECT_ROLE_BULK_MAX_IDS = 200
PROJECT_ROLE_BULK_GET_MAX_IDS = 25
PROJECT_ROLE_BULK_GET_MAX_QUERY_LENGTH = 512


def _parse_department_ids(raw_values):
    ids = []
    seen = set()
    for raw in raw_values:
        try:
            dept_id = int(str(raw).strip())
        except Exception:
            raise ValueError('invalid department id')
        if dept_id <= 0:
            raise ValueError('invalid department id')
        if dept_id in seen:
            continue
        seen.add(dept_id)
        ids.append(dept_id)
    return ids


def _parse_include_inactive(raw_value):
    return str(raw_value or '').strip().lower() in ('1', 'true', 'yes', 'on')


def _bulk_roles_by_department_payload(dept_ids, include_inactive: bool):
    roles_qs = ProjectRole.objects.filter(department_id__in=dept_ids)
    if not include_inactive:
        roles_qs = roles_qs.filter(is_active=True)
    roles_qs = roles_qs.order_by('department_id', '-is_active', 'sort_order', 'name')
    serialized = ProjectRoleItemSerializer(list(roles_qs), many=True).data
    payload = {str(dept_id): [] for dept_id in dept_ids}
    for item in serialized:
        payload[str(item['department_id'])].append(item)
    return payload


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


class ProjectRoleBulkView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=inline_serializer(
            name='ProjectRoleBulkRequest',
            fields={
                'department_ids': serializers.ListField(child=serializers.IntegerField()),
                'include_inactive': serializers.BooleanField(required=False, default=False),
            },
        ),
        responses=inline_serializer(
            name='ProjectRoleBulkResponse',
            fields={
                'rolesByDepartment': serializers.JSONField(),
            },
        ),
    )
    def post(self, request):
        raw_ids = request.data.get('department_ids')
        if not isinstance(raw_ids, list):
            return Response({'detail': 'department_ids[] required'}, status=400)
        try:
            dept_ids = _parse_department_ids(raw_ids)
        except ValueError:
            return Response({'detail': 'invalid department_ids'}, status=400)
        if not dept_ids:
            return Response({'detail': 'department_ids[] required'}, status=400)
        if len(dept_ids) > PROJECT_ROLE_BULK_MAX_IDS:
            return Response({'detail': f'department_ids max length is {PROJECT_ROLE_BULK_MAX_IDS}'}, status=400)

        include_inactive = _parse_include_inactive(request.data.get('include_inactive'))
        payload = _bulk_roles_by_department_payload(dept_ids, include_inactive=include_inactive)
        return Response({'rolesByDepartment': payload})

    @extend_schema(
        responses=inline_serializer(
            name='ProjectRoleBulkGetResponse',
            fields={
                'rolesByDepartment': serializers.JSONField(),
            },
        ),
    )
    def get(self, request):
        raw_csv = str(request.query_params.get('department_ids') or '').strip()
        if not raw_csv:
            return Response({'detail': 'department_ids is required'}, status=400)
        if len(raw_csv) > PROJECT_ROLE_BULK_GET_MAX_QUERY_LENGTH:
            return Response({'detail': 'department_ids query is too long; use POST'}, status=400)
        tokens = [token for token in raw_csv.split(',') if str(token).strip()]
        try:
            dept_ids = _parse_department_ids(tokens)
        except ValueError:
            return Response({'detail': 'invalid department_ids'}, status=400)
        if not dept_ids:
            return Response({'detail': 'department_ids is required'}, status=400)
        if len(dept_ids) > PROJECT_ROLE_BULK_GET_MAX_IDS:
            return Response({'detail': f'department_ids max length is {PROJECT_ROLE_BULK_GET_MAX_IDS} for GET; use POST'}, status=400)
        if len(dept_ids) > PROJECT_ROLE_BULK_MAX_IDS:
            return Response({'detail': f'department_ids max length is {PROJECT_ROLE_BULK_MAX_IDS}'}, status=400)

        include_inactive = _parse_include_inactive(request.query_params.get('include_inactive'))
        payload = _bulk_roles_by_department_payload(dept_ids, include_inactive=include_inactive)
        return Response({'rolesByDepartment': payload})


class ProjectRoleSearchView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=ProjectRoleItemSerializer(many=True))
    def get(self, request):
        q = str(request.query_params.get('q') or '').strip()
        if len(q) < 2:
            return Response([])
        dept_param = request.query_params.get('department')
        dept_id = None
        if dept_param not in (None, ""):
            try:
                dept_id = int(dept_param)
            except Exception:
                return Response({'detail': 'invalid department'}, status=400)
        include_inactive = (request.query_params.get('include_inactive') or '').lower() in ('1', 'true', 'yes')
        norm = normalize_name(q)
        qs = ProjectRole.objects.all()
        if not include_inactive:
            qs = qs.filter(is_active=True)
        if dept_id:
            qs = qs.filter(department_id=dept_id)
        qs = qs.filter(Q(name__icontains=q) | Q(normalized_name__icontains=norm))
        qs = qs.order_by('department_id', 'sort_order', 'name')[:50]
        return Response(ProjectRoleItemSerializer(qs, many=True).data)


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
