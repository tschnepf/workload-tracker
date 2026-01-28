from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from django.conf import settings
import hashlib
from django.db import transaction
from decimal import Decimal

from .serializers import (
    PreDeliverableGlobalSettingsItemSerializer,
    PreDeliverableGlobalSettingsUpdateSerializer,
    UtilizationSchemeSerializer,
    ProjectRoleSerializer,
    CalendarFeedSettingsSerializer,
    DeliverablePhaseMappingSettingsSerializer,
    QATaskSettingsSerializer,
)
from .models import PreDeliverableGlobalSettings, UtilizationScheme, ProjectRole, CalendarFeedSettings, DeliverablePhaseMappingSettings, QATaskSettings, AutoHoursRoleSetting
from accounts.permissions import IsAdminOrManager
from deliverables.models import PreDeliverableType
from accounts.models import AdminAuditLog  # type: ignore
from assignments.models import Assignment  # type: ignore
from projects.models import ProjectRole as DepartmentProjectRole


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


class AutoHoursRoleSettingsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrManager]
    MAX_WEEKS_BEFORE = 8

    def _empty_hours_by_week(self) -> dict:
        return {str(i): 0 for i in range(self.MAX_WEEKS_BEFORE + 1)}

    def _normalize_hours_by_week(self, raw) -> tuple[dict, str | None]:
        if raw is None:
            return self._empty_hours_by_week(), None

        normalized = self._empty_hours_by_week()
        if isinstance(raw, list):
            for idx, value in enumerate(raw):
                if idx > self.MAX_WEEKS_BEFORE:
                    continue
                try:
                    hours = Decimal(str(value))
                except Exception:
                    return {}, f'invalid percent value at index {idx}'
                if hours < 0 or hours > 100:
                    return {}, 'percentPerWeek must be between 0 and 100'
                normalized[str(idx)] = float(hours)
            return normalized, None

        if isinstance(raw, dict):
            for key, value in raw.items():
                try:
                    week = int(key)
                except Exception:
                    return {}, f'invalid week key {key}'
                if week < 0 or week > self.MAX_WEEKS_BEFORE:
                    return {}, f'weeksBefore must be between 0 and {self.MAX_WEEKS_BEFORE}'
                try:
                    hours = Decimal(str(value))
                except Exception:
                    return {}, f'invalid percent value for week {week}'
                if hours < 0 or hours > 100:
                    return {}, 'percentPerWeek must be between 0 and 100'
                normalized[str(week)] = float(hours)
            return normalized, None

        return {}, 'percentByWeek must be a list or object'

    @extend_schema(
        responses=inline_serializer(
            name='AutoHoursRoleSettingItem',
            fields={
                'roleId': serializers.IntegerField(),
                'roleName': serializers.CharField(),
                'departmentId': serializers.IntegerField(),
                'departmentName': serializers.CharField(),
                'percentByWeek': serializers.DictField(child=serializers.FloatField()),
                'isActive': serializers.BooleanField(),
                'sortOrder': serializers.IntegerField(),
            },
            many=True,
        ),
    )
    def get(self, request):
        dept_id = request.query_params.get('department_id')
        dept_id_int = None
        if dept_id:
            try:
                dept_id_int = int(dept_id)
            except Exception:
                return Response({'error': 'department_id must be an integer'}, status=400)
        roles_qs = DepartmentProjectRole.objects.select_related('department')
        if dept_id_int is not None:
            roles_qs = roles_qs.filter(department_id=dept_id_int)
        roles = list(roles_qs.order_by('department_id', 'sort_order', 'name'))
        role_ids = [r.id for r in roles]
        settings_map = {
            s.role_id: s for s in AutoHoursRoleSetting.objects.filter(role_id__in=role_ids)
        }
        items = []
        for role in roles:
            setting = settings_map.get(role.id)
            hours_by_week = self._empty_hours_by_week()
            if setting:
                raw = setting.ramp_percent_by_week or {}
                if isinstance(raw, dict):
                    for key, value in raw.items():
                        if str(key) in hours_by_week:
                            try:
                                hours_by_week[str(int(key))] = float(Decimal(str(value)))
                            except Exception:
                                pass
                if not raw:
                    try:
                        hours_by_week['0'] = float(setting.standard_percent_of_capacity)
                    except Exception:
                        pass
            items.append({
                'roleId': role.id,
                'roleName': role.name,
                'departmentId': role.department_id,
                'departmentName': getattr(role.department, 'name', ''),
                'percentByWeek': hours_by_week,
                'isActive': role.is_active,
                'sortOrder': role.sort_order,
            })
        return Response(items)

    @extend_schema(
        request=inline_serializer(
            name='AutoHoursRoleSettingsUpdate',
            fields={
                'settings': inline_serializer(
                    name='AutoHoursRoleSettingUpdateItem',
                    fields={
                        'roleId': serializers.IntegerField(),
                        'percentByWeek': serializers.DictField(child=serializers.FloatField(), required=False),
                        'percentPerWeek': serializers.FloatField(required=False),
                    },
                    many=True,
                ),
            },
        ),
        responses=inline_serializer(
            name='AutoHoursRoleSettingItemResponse',
            fields={
                'roleId': serializers.IntegerField(),
                'roleName': serializers.CharField(),
                'departmentId': serializers.IntegerField(),
                'departmentName': serializers.CharField(),
                'percentByWeek': serializers.DictField(child=serializers.FloatField()),
                'isActive': serializers.BooleanField(),
                'sortOrder': serializers.IntegerField(),
            },
            many=True,
        ),
    )
    def put(self, request):
        payload = request.data or {}
        settings = payload.get('settings') or []
        if not isinstance(settings, list):
            return Response({'error': 'settings must be a list'}, status=400)

        dept_id = request.query_params.get('department_id')
        dept_id_int = None
        if dept_id:
            try:
                dept_id_int = int(dept_id)
            except Exception:
                return Response({'error': 'department_id must be an integer'}, status=400)

        updates: list[tuple[int, dict]] = []
        role_ids: list[int] = []
        for item in settings:
            try:
                role_id = int(item.get('roleId'))
            except Exception:
                return Response({'error': 'invalid roleId'}, status=400)
            hours_by_week_raw = item.get('percentByWeek')
            hours_by_week, err = self._normalize_hours_by_week(hours_by_week_raw)
            if err:
                return Response({'error': err}, status=400)
            if hours_by_week_raw is None and item.get('percentPerWeek') is not None:
                try:
                    hours = Decimal(str(item.get('percentPerWeek')))
                except Exception:
                    return Response({'error': f'invalid percentPerWeek for roleId {role_id}'}, status=400)
                if hours < 0 or hours > 100:
                    return Response({'error': 'percentPerWeek must be between 0 and 100'}, status=400)
                hours_by_week['0'] = float(hours)
            updates.append((role_id, hours_by_week))
            role_ids.append(role_id)

        if role_ids:
            existing_qs = DepartmentProjectRole.objects.filter(id__in=role_ids)
            if dept_id_int is not None:
                existing_qs = existing_qs.filter(department_id=dept_id_int)
            existing = set(existing_qs.values_list('id', flat=True))
            missing = [rid for rid in role_ids if rid not in existing]
            if missing:
                return Response({'error': f'unknown roleId(s): {missing}'}, status=400)

        with transaction.atomic():
            for role_id, hours_by_week in updates:
                obj, _ = AutoHoursRoleSetting.objects.get_or_create(role_id=role_id)
                try:
                    obj.standard_percent_of_capacity = Decimal(str(hours_by_week.get('0', 0)))
                except Exception:
                    obj.standard_percent_of_capacity = 0
                obj.ramp_percent_by_week = hours_by_week
                obj.save(update_fields=['standard_percent_of_capacity', 'ramp_percent_by_week', 'updated_at'])

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
        return hashlib.sha256(payload.encode()).hexdigest()

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
        except Exception:  # nosec B110
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

    @extend_schema(
        responses=inline_serializer(
            name='ProjectRoleListResponse',
            fields={'roles': serializers.ListField(child=serializers.CharField())},
        )
    )
    def get(self, request):
        # Legacy union: catalog + existing assignments
        names = set()
        try:
            for pr in ProjectRole.objects.all():
                if pr.name:
                    names.add(pr.name.strip())
        except Exception:  # nosec B110
            pass
        try:
            qs = Assignment.objects.exclude(role_on_project__isnull=True).exclude(role_on_project__exact='')
            for r in qs.values_list('role_on_project', flat=True).distinct():
                if r:
                    names.add(str(r).strip())
        except Exception:  # nosec B110
            pass
        out = sorted(names, key=lambda s: s.lower())
        return Response({'roles': out})


class DeliverablePhaseMappingSettingsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    @extend_schema(responses=DeliverablePhaseMappingSettingsSerializer)
    def get(self, request):
        obj = DeliverablePhaseMappingSettings.get_active()
        return Response(DeliverablePhaseMappingSettingsSerializer(obj).data)

    @extend_schema(request=DeliverablePhaseMappingSettingsSerializer, responses=DeliverablePhaseMappingSettingsSerializer)
    def put(self, request):
        obj = DeliverablePhaseMappingSettings.get_active()
        ser = DeliverablePhaseMappingSettingsSerializer(instance=obj, data=request.data, partial=False)
        ser.is_valid(raise_exception=True)
        ser.save()
        # Invalidate classifier cache
        try:
            from core.deliverable_phase import clear_phase_mapping_cache
            clear_phase_mapping_cache()
        except Exception:  # nosec B110
            pass
        return Response(DeliverablePhaseMappingSettingsSerializer(obj).data)

    @extend_schema(
        request=inline_serializer(
            name='ProjectRoleCreateRequest',
            fields={'name': serializers.CharField()},
        ),
        responses=ProjectRoleSerializer,
    )
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

    @extend_schema(
        request=inline_serializer(name='ProjectRoleDeleteReq', fields={'name': serializers.CharField(required=False)}),
        responses=inline_serializer(name='ProjectRoleDeleteResp', fields={
            'detail': serializers.CharField(),
            'removedFromAssignments': serializers.IntegerField(),
            'catalogDeleted': serializers.BooleanField(),
        })
    )
    def delete(self, request):
        """Remove a project role from the catalog and clear assignments using it.

        Behavior:
        - Admin only.
        - Accepts role name via query param (?name=...) or JSON body { name }.
        - Clears `Assignment.role_on_project` wherever it matches (case-insensitive).
        - If a catalog ProjectRole exists for that normalized name, it is deleted.
        """
        if not request.user or not request.user.is_staff:
            return Response({'detail': 'Admin required'}, status=status.HTTP_403_FORBIDDEN)

        # Accept name from query (?name=) or body { name }
        name = request.query_params.get('name')
        if not name:
            body = request.data or {}
            name = body.get('name') if isinstance(body, dict) else None
        if not isinstance(name, str) or not name.strip():
            return Response({'detail': 'name is required'}, status=400)

        norm = ' '.join(name.strip().split())
        key = norm.lower()

        from assignments.models import Assignment  # local import to avoid cycles in schema generation

        with transaction.atomic():
            # Clear from assignments (case-insensitive comparison)
            removed_count = Assignment.objects.filter(role_on_project__iexact=norm).update(role_on_project=None)

            from .models import ProjectRole
            pr = ProjectRole.objects.filter(name_key=key).first()
            catalog_deleted = False
            if pr:
                pr.delete()
                catalog_deleted = True

        # Best-effort audit log
        try:
            from accounts.models import AdminAuditLog  # type: ignore
            AdminAuditLog.objects.create(
                actor=request.user if request.user and request.user.is_authenticated else None,
                action='project_roles_remove',
                target_user=None,
                detail={'name': norm, 'removedFromAssignments': removed_count, 'catalogDeleted': catalog_deleted},
            )
        except Exception:  # nosec B110
            pass

        return Response({'detail': 'deleted', 'removedFromAssignments': removed_count, 'catalogDeleted': catalog_deleted})


class QATaskSettingsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    @extend_schema(responses=QATaskSettingsSerializer)
    def get(self, request):
        obj = QATaskSettings.get_active()
        return Response(QATaskSettingsSerializer(obj).data)

    @extend_schema(request=QATaskSettingsSerializer, responses=QATaskSettingsSerializer)
    def put(self, request):
        obj = QATaskSettings.get_active()
        ser = QATaskSettingsSerializer(instance=obj, data=request.data, partial=False)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(QATaskSettingsSerializer(obj).data)


class CalendarFeedsView(APIView):
    """Admin endpoint to view/update tokens for calendar feeds (read-only ICS).

    - GET: returns current token values
    - PATCH: set a specific token or regenerate with {regenerate: true}
    """
    permission_classes = [IsAuthenticated, IsAdminUser]

    @extend_schema(responses=CalendarFeedSettingsSerializer)
    def get(self, request):
        obj = CalendarFeedSettings.get_active()
        return Response(CalendarFeedSettingsSerializer(obj).data)

    @extend_schema(
        request=inline_serializer(name='CalendarFeedsPatch', fields={
            'deliverables_token': serializers.CharField(required=False),
            'regenerate': serializers.BooleanField(required=False),
        }),
        responses=CalendarFeedSettingsSerializer,
    )
    def patch(self, request):
        obj = CalendarFeedSettings.get_active()
        regen = bool(request.data.get('regenerate'))
        token = request.data.get('deliverables_token')
        if regen:
            obj.rotate_deliverables_token()
        elif token is not None:
            t = str(token).strip()
            if len(t) < 16:
                return Response({'detail': 'token too short'}, status=400)
            obj.deliverables_token = t
            obj.save(update_fields=['deliverables_token', 'updated_at'])
        return Response(CalendarFeedSettingsSerializer(obj).data)
