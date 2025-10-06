from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from django.conf import settings
import hashlib

from .serializers import (
    PreDeliverableGlobalSettingsItemSerializer,
    PreDeliverableGlobalSettingsUpdateSerializer,
    UtilizationSchemeSerializer,
    ProjectRoleSerializer,
)
from .models import PreDeliverableGlobalSettings, UtilizationScheme, ProjectRole
from deliverables.models import PreDeliverableType
from accounts.models import AdminAuditLog  # type: ignore
from assignments.models import Assignment  # type: ignore


class PreDeliverableGlobalSettingsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    @extend_schema(responses=PreDeliverableGlobalSettingsItemSerializer(many=True))
    def get(self, request):
        items = []
        # Join types and global settings
        types = PreDeliverableType.objects.all().order_by('sort_order', 'name')
        settings_map = {g.pre_deliverable_type_id: g for g in PreDeliverableGlobalSettings.objects.all()}
        for t in types:
            g = settings_map.get(t.id)
            items.append({
                'typeId': t.id,
                'typeName': t.name,
                'defaultDaysBefore': g.default_days_before if g else t.default_days_before,
                'isEnabledByDefault': g.is_enabled_by_default if g else t.is_active,
                'sortOrder': t.sort_order,
                'isActive': t.is_active,
            })
        return Response(items)

    @extend_schema(
        request=inline_serializer(name='GlobalSettingsUpdate', fields={'settings': PreDeliverableGlobalSettingsUpdateSerializer(many=True)}),
        responses=PreDeliverableGlobalSettingsItemSerializer(many=True),
    )
    def put(self, request):
        payload = request.data or {}
        settings = payload.get('settings') or []
        if not isinstance(settings, list):
            return Response({'error': 'settings must be a list'}, status=400)
        for item in settings:
            try:
                type_id = int(item.get('typeId'))
                days = int(item.get('defaultDaysBefore'))
                enabled = bool(item.get('isEnabledByDefault'))
            except Exception:
                return Response({'error': 'invalid setting entry'}, status=400)
            if days < 0:
                return Response({'error': 'defaultDaysBefore must be >= 0'}, status=400)
            t = PreDeliverableType.objects.filter(id=type_id).first()
            if not t:
                return Response({'error': f'unknown typeId {type_id}'}, status=400)
            obj, _ = PreDeliverableGlobalSettings.objects.get_or_create(pre_deliverable_type=t)
            obj.default_days_before = days
            obj.is_enabled_by_default = enabled
            obj.save(update_fields=['default_days_before', 'is_enabled_by_default', 'updated_at'])
        return self.get(request)


class UtilizationSchemeView(APIView):
    """Singleton endpoint for utilization scheme.

    - GET: returns the current scheme with ETag/Last-Modified. Requires auth.
    - PUT: admin-only, requires If-Match ETag; increments version on success.
    - When feature flag is disabled: GET returns defaults; PUT returns 403.
    """
    permission_classes = [IsAuthenticated]

    def _current_etag(self, obj: UtilizationScheme) -> str:
        payload = f"{obj.version}-{obj.updated_at.isoformat() if obj.updated_at else ''}"
        return hashlib.md5(payload.encode()).hexdigest()

    @extend_schema(responses=UtilizationSchemeSerializer)
    def get(self, request):
        obj = UtilizationScheme.get_active()
        etag = self._current_etag(obj)
        inm = request.META.get('HTTP_IF_NONE_MATCH')
        if inm and inm.strip('"') == etag:
            from django.utils.http import http_date
            resp = Response(status=status.HTTP_304_NOT_MODIFIED)
            resp['ETag'] = f'"{etag}"'
            resp['Last-Modified'] = http_date(obj.updated_at.timestamp())
            return resp

        # When feature flag is disabled, serve defaults (read-only) per rollout spec
        if not settings.FEATURES.get('UTILIZATION_SCHEME_ENABLED', True):
            data = {
                'mode': UtilizationScheme.MODE_ABSOLUTE,
                'blue_min': 1, 'blue_max': 29,
                'green_min': 30, 'green_max': 36,
                'orange_min': 37, 'orange_max': 40,
                'red_min': 41,
                'zero_is_blank': True,
                'version': obj.version,
                'updated_at': obj.updated_at,
            }
        else:
            data = UtilizationSchemeSerializer(obj).data

        resp = Response(data)
        from django.utils.http import http_date
        resp['ETag'] = f'"{etag}"'
        resp['Last-Modified'] = http_date(obj.updated_at.timestamp())
        return resp

    @extend_schema(request=UtilizationSchemeSerializer, responses=UtilizationSchemeSerializer)
    def put(self, request):
        if not settings.FEATURES.get('UTILIZATION_SCHEME_ENABLED', True):
            return Response({'detail': 'Utilization scheme editing is disabled'}, status=status.HTTP_403_FORBIDDEN)
        # Admin-only
        for cls in self.permission_classes:
            pass
        if not request.user or not request.user.is_staff:
            return Response({'detail': 'Admin required'}, status=status.HTTP_403_FORBIDDEN)

        obj = UtilizationScheme.get_active()
        # If-Match required
        if_match = request.META.get('HTTP_IF_MATCH')
        current = self._current_etag(obj)
        if not if_match or if_match.strip('"') != current:
            return Response({'detail': 'Precondition failed'}, status=status.HTTP_412_PRECONDITION_FAILED)

        before = UtilizationSchemeSerializer(obj).data
        ser = UtilizationSchemeSerializer(instance=obj, data=request.data, partial=False)
        ser.is_valid(raise_exception=True)
        # increment version and save
        obj.version = (obj.version or 0) + 1
        for k, v in ser.validated_data.items():
            setattr(obj, k, v)
        obj.save()
        after = UtilizationSchemeSerializer(obj).data
        # Audit log (non-blocking)
        try:
            AdminAuditLog.objects.create(
                actor=request.user if request.user.is_authenticated else None,
                action='utilization_scheme_update',
                target_user=None,
                detail={'before': before, 'after': after},
            )
        except Exception:
            pass
        # Return with new ETag
        etag = self._current_etag(obj)
        resp = Response(after)
        from django.utils.http import http_date
        resp['ETag'] = f'"{etag}"'
        resp['Last-Modified'] = http_date(obj.updated_at.timestamp())
        return resp


class ProjectRoleView(APIView):
    """List/add project roles for suggestions/settings.

    - GET: returns union of catalog roles and distinct existing assignment roles.
    - POST: admin-only; adds a role to the catalog.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Feature-gated department filter
        dept_param = request.query_params.get('department')
        if settings.FEATURES.get('PROJECT_ROLES_BY_DEPARTMENT', False) and dept_param:
            try:
                dept_id = int(dept_param)
                if dept_id <= 0:
                    raise ValueError
            except Exception:
                return Response({'detail': 'invalid department id'}, status=400)
            names = list(
                DepartmentProjectRole.objects.filter(department_id=dept_id, is_active=True)
                .select_related('project_role')
                .order_by(Lower('project_role__name'))
                .values_list('project_role__name', flat=True)
            )
            return Response({'roles': names})

        # Legacy union: catalog + existing assignments
        names = set()
        try:
            for pr in ProjectRole.objects.all():
                if pr.name:
                    names.add(pr.name.strip())
        except Exception:
            pass
        try:
            qs = Assignment.objects.exclude(role_on_project__isnull=True).exclude(role_on_project__exact='')
            for r in qs.values_list('role_on_project', flat=True).distinct():
                if r:
                    names.add(str(r).strip())
        except Exception:
            pass
        out = sorted(names, key=lambda s: s.lower())
        return Response({'roles': out})

    def post(self, request):
        if not request.user or not request.user.is_staff:
            return Response({'detail': 'Admin required'}, status=status.HTTP_403_FORBIDDEN)
        name = (request.data or {}).get('name')
        if not name or not isinstance(name, str) or not name.strip():
            return Response({'detail': 'name is required'}, status=400)
        try:
            obj, created = ProjectRole.objects.get_or_create(name_key=name.strip().lower(), defaults={'name': name.strip()})
            ser = ProjectRoleSerializer(obj)
            return Response(ser.data, status=201 if created else 200)
        except Exception as e:
            return Response({'detail': str(e)}, status=400)


from rest_framework.throttling import ScopedRateThrottle
from django.utils.http import http_date


def _make_roles_map_etag(data: dict) -> str:
    raw = '|'.join(
        f"{dept}:{','.join(str(item.get('id'))+'@'+(item.get('name') or '') for item in items)}"
        for dept, items in sorted(data.items(), key=lambda x: int(x[0]) if str(x[0]).isdigit() else str(x[0]))
    )
    return hashlib.md5(raw.encode('utf-8')).hexdigest()


def _last_modified_from_qs(qs):
    try:
        latest = qs.order_by('-updated_at').values_list('updated_at', flat=True).first()
        return latest.timestamp() if latest else None
    except Exception:
        return None


class DepartmentProjectRolesMapView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'department_roles_map'

    @extend_schema(responses=inline_serializer(name='DeptProjectRolesMap', fields={}))
    def get(self, request):
        ids_param = request.query_params.get('department_ids') or ''
        if not ids_param:
            return Response({})
        dept_ids: list[int] = []
        for tok in ids_param.split(','):
            tok = tok.strip()
            if not tok:
                continue
            try:
                n = int(tok)
                if n > 0:
                    dept_ids.append(n)
            except Exception:
                continue
        dept_ids = dept_ids[:100]
        data: dict[str, list[dict]] = {str(d): [] for d in dept_ids}
        if not dept_ids:
            return Response(data)
        qs = (
            DepartmentProjectRole.objects
            .filter(department_id__in=dept_ids, is_active=True)
            .select_related('project_role')
            .order_by('department_id', Lower('project_role__name'))
        )
        lm = _last_modified_from_qs(qs)
        inm = request.META.get('HTTP_IF_NONE_MATCH')
        etag_hint = hashlib.md5((','.join(map(str, dept_ids))+f"-{lm or ''}").encode('utf-8')).hexdigest()
        if inm and inm.strip('"') == etag_hint:
            resp = Response(status=status.HTTP_304_NOT_MODIFIED)
            resp['ETag'] = f'"{etag_hint}"'
            if lm:
                resp['Last-Modified'] = http_date(lm)
            return resp
        for dpr in qs:
            d = str(dpr.department_id)
            data.setdefault(d, []).append({'id': dpr.project_role_id, 'name': dpr.project_role.name})
        etag = _make_roles_map_etag(data)
        resp = Response(data)
        resp['ETag'] = f'"{etag}"'
        if lm:
            resp['Last-Modified'] = http_date(lm)
        return resp


class DepartmentProjectRolesView(APIView):
    throttle_classes = [ScopedRateThrottle]

    def get_permissions(self):
        if self.request.method.upper() == 'POST':
            return [IsAuthenticated(), IsAdminUser()]
        return [IsAuthenticated()]

    def get_throttles(self):
        self.throttle_scope = 'department_roles_mutate' if self.request.method.upper() == 'POST' else 'department_roles_map'
        return super().get_throttles()

    @extend_schema(responses=inline_serializer(name='DeptProjectRolesList', fields={}))
    def get(self, request):
        dept_param = request.query_params.get('department')
        try:
            dept_id = int(dept_param) if dept_param is not None else None
        except Exception:
            return Response({'detail': 'invalid department id'}, status=400)
        if not dept_id:
            return Response({'detail': 'department is required'}, status=400)
        qs = (
            DepartmentProjectRole.objects
            .filter(department_id=dept_id, is_active=True)
            .select_related('project_role')
            .order_by(Lower('project_role__name'))
        )
        data = [{'id': r.project_role_id, 'name': r.project_role.name} for r in qs]
        etag = hashlib.md5(('list-'+str(dept_id)+'-'+','.join(str(it['id']) for it in data)).encode('utf-8')).hexdigest()
        lm = _last_modified_from_qs(qs)
        inm = request.META.get('HTTP_IF_NONE_MATCH')
        if inm and inm.strip('"') == etag:
            resp = Response(status=status.HTTP_304_NOT_MODIFIED)
            resp['ETag'] = f'"{etag}"'
            if lm:
                resp['Last-Modified'] = http_date(lm)
            return resp
        resp = Response(data)
        resp['ETag'] = f'"{etag}"'
        if lm:
            resp['Last-Modified'] = http_date(lm)
        return resp

    @extend_schema(
        request=inline_serializer(name='DeptProjectRoleCreate', fields={
            'department': serializers.IntegerField(),
            'name': serializers.CharField(),
        }),
        responses=inline_serializer(name='DeptProjectRoleCreateResponse', fields={'id': serializers.IntegerField(), 'name': serializers.CharField()}),
    )
    def post(self, request):
        payload = request.data or {}
        try:
            dept_id = int(payload.get('department'))
            if dept_id <= 0:
                raise ValueError
        except Exception:
            return Response({'detail': 'department must be a positive integer'}, status=400)
        name = payload.get('name')
        if not isinstance(name, str) or not name.strip():
            return Response({'detail': 'name is required'}, status=400)
        norm = ' '.join(name.strip().split())
        key = norm.lower()
        with transaction.atomic():
            pr, _ = ProjectRole.objects.get_or_create(name_key=key, defaults={'name': norm})
            obj, created = DepartmentProjectRole.objects.get_or_create(
                department_id=dept_id, project_role=pr, defaults={'is_active': True}
            )
        try:
            AdminAuditLog.objects.create(
                actor=request.user if request.user and request.user.is_authenticated else None,
                action='department_project_roles_add',
                target_user=None,
                detail={'department': dept_id, 'roleId': pr.id, 'roleName': pr.name, 'created': created},
            )
        except Exception:
            pass
        status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response({'id': pr.id, 'name': pr.name}, status=status_code)


class DepartmentProjectRoleDeleteView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'department_roles_mutate'

    @extend_schema(responses=inline_serializer(name='DeptProjectRoleDelete', fields={'detail': serializers.CharField()}))
    def delete(self, request, department: int, role_id: int):
        try:
            if int(department) <= 0 or int(role_id) <= 0:
                raise ValueError
        except Exception:
            return Response({'detail': 'invalid ids'}, status=400)
        qs = DepartmentProjectRole.objects.filter(department_id=department, project_role_id=role_id)
        existed = qs.exists()
        deleted = qs.delete()[0] if existed else 0
        try:
            AdminAuditLog.objects.create(
                actor=request.user if request.user and request.user.is_authenticated else None,
                action='department_project_roles_remove',
                target_user=None,
                detail={'department': department, 'roleId': role_id, 'deleted': deleted},
            )
        except Exception:
            pass
        if not existed:
            return Response({'detail': 'not found'}, status=404)
        return Response({'detail': 'deleted'})
