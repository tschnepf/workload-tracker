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
from .models import (
    PreDeliverableGlobalSettings,
    UtilizationScheme,
    ProjectRole,
    CalendarFeedSettings,
    DeliverablePhaseMappingSettings,
    DeliverablePhaseDefinition,
    QATaskSettings,
    AutoHoursRoleSetting,
    AutoHoursGlobalSettings,
    AutoHoursTemplate,
    AutoHoursTemplateRoleSetting,
)
from accounts.permissions import IsAdminOrManager
from deliverables.models import PreDeliverableType
from accounts.models import AdminAuditLog  # type: ignore
from assignments.models import Assignment  # type: ignore
from projects.models import ProjectRole as DepartmentProjectRole
from departments.models import Department

AUTO_HOURS_MAX_WEEKS_BEFORE = 17
AUTO_HOURS_MAX_WEEKS_COUNT = AUTO_HOURS_MAX_WEEKS_BEFORE + 1
AUTO_HOURS_DEFAULT_WEEKS_COUNT = 6


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
        phase, phase_err = self._parse_phase(request)
        if phase_err:
            return Response({'error': phase_err}, status=400)
        payload = request.data or {}
        weeks_count = None
        if 'weeksCount' in payload:
            weeks_count, weeks_err = self._coerce_weeks_count(payload.get('weeksCount'))
            if weeks_err:
                return Response({'error': weeks_err}, status=400)
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
    MAX_WEEKS_BEFORE = AUTO_HOURS_MAX_WEEKS_BEFORE

    def _coerce_weeks_count(self, value) -> tuple[int | None, str | None]:
        try:
            count = int(value)
        except Exception:
            return None, 'weeksCount must be an integer'
        if count < 0 or count > (self.MAX_WEEKS_BEFORE + 1):
            return None, f'weeksCount must be between 0 and {self.MAX_WEEKS_BEFORE + 1}'
        return count, None

    def _get_weeks_count(self, phase: str | None) -> int:
        if not phase:
            return self.MAX_WEEKS_BEFORE + 1
        settings = AutoHoursGlobalSettings.get_active()
        raw = (settings.weeks_by_phase or {}).get(phase)
        try:
            return int(raw)
        except Exception:
            return AUTO_HOURS_DEFAULT_WEEKS_COUNT

    def _set_weeks_count(self, phase: str | None, count: int) -> None:
        if not phase:
            return
        settings = AutoHoursGlobalSettings.get_active()
        weeks_by_phase = settings.weeks_by_phase or {}
        weeks_by_phase[str(phase).strip().lower()] = int(count)
        settings.weeks_by_phase = weeks_by_phase
        settings.save(update_fields=['weeks_by_phase', 'updated_at'])

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

    def _parse_phase(self, request) -> tuple[str | None, str | None]:
        phase = request.query_params.get('phase')
        if not phase:
            return None, None
        norm = str(phase).strip().lower()
        valid = set(DeliverablePhaseDefinition.objects.values_list('key', flat=True))
        if norm in valid:
            return norm, None
        return None, 'phase must match an existing phase mapping'

    @extend_schema(
        responses=inline_serializer(
            name='AutoHoursRoleSettingItem',
            fields={
                'roleId': serializers.IntegerField(),
                'roleName': serializers.CharField(),
                'departmentId': serializers.IntegerField(),
                'departmentName': serializers.CharField(),
                'percentByWeek': serializers.DictField(child=serializers.FloatField()),
                'weeksCount': serializers.IntegerField(),
                'isActive': serializers.BooleanField(),
                'sortOrder': serializers.IntegerField(),
            },
            many=True,
        ),
    )
    def get(self, request):
        phase, phase_err = self._parse_phase(request)
        if phase_err:
            return Response({'error': phase_err}, status=400)
        weeks_count = self._get_weeks_count(phase)
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
                raw = None
                if phase:
                    raw_phase = (setting.ramp_percent_by_phase or {}).get(phase)
                    if isinstance(raw_phase, dict) or isinstance(raw_phase, list):
                        raw = raw_phase
                if raw is None:
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
                'weeksCount': weeks_count,
                'isActive': role.is_active,
                'sortOrder': role.sort_order,
            })
        return Response(items)

    @extend_schema(
        request=inline_serializer(
            name='AutoHoursRoleSettingsUpdate',
            fields={
                'weeksCount': serializers.IntegerField(required=False),
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
                'weeksCount': serializers.IntegerField(),
                'isActive': serializers.BooleanField(),
                'sortOrder': serializers.IntegerField(),
            },
            many=True,
        ),
    )
    def put(self, request):
        phase, phase_err = self._parse_phase(request)
        if phase_err:
            return Response({'error': phase_err}, status=400)
        payload = request.data or {}
        weeks_count = None
        if 'weeksCount' in payload:
            weeks_count, weeks_err = self._coerce_weeks_count(payload.get('weeksCount'))
            if weeks_err:
                return Response({'error': weeks_err}, status=400)
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

        if weeks_count is not None:
            self._set_weeks_count(phase, weeks_count)

        with transaction.atomic():
            for role_id, hours_by_week in updates:
                obj, _ = AutoHoursRoleSetting.objects.get_or_create(role_id=role_id)
                try:
                    obj.standard_percent_of_capacity = Decimal(str(hours_by_week.get('0', 0)))
                except Exception:
                    obj.standard_percent_of_capacity = 0
                if phase:
                    by_phase = obj.ramp_percent_by_phase or {}
                    by_phase[phase] = hours_by_week
                    obj.ramp_percent_by_phase = by_phase
                    obj.save(update_fields=['standard_percent_of_capacity', 'ramp_percent_by_phase', 'updated_at'])
                else:
                    obj.ramp_percent_by_week = hours_by_week
                    obj.save(update_fields=['standard_percent_of_capacity', 'ramp_percent_by_week', 'updated_at'])

        return self.get(request)


class AutoHoursTemplatesView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrManager]

    def _parse_exclusions(self, data) -> tuple[list[int] | None, list[int] | None, str | None]:
        excluded_roles = None
        excluded_departments = None
        if 'excludedRoleIds' in data:
            raw = data.get('excludedRoleIds')
            if raw is None:
                excluded_roles = []
            elif not isinstance(raw, list):
                return None, None, 'excludedRoleIds must be a list'
            else:
                try:
                    excluded_roles = sorted({int(x) for x in raw})
                except Exception:
                    return None, None, 'excludedRoleIds must be a list of integers'
                existing = set(DepartmentProjectRole.objects.filter(id__in=excluded_roles).values_list('id', flat=True))
                missing = [rid for rid in excluded_roles if rid not in existing]
                if missing:
                    return None, None, f'unknown roleId(s): {missing}'
        if 'excludedDepartmentIds' in data:
            raw = data.get('excludedDepartmentIds')
            if raw is None:
                excluded_departments = []
            elif not isinstance(raw, list):
                return None, None, 'excludedDepartmentIds must be a list'
            else:
                try:
                    excluded_departments = sorted({int(x) for x in raw})
                except Exception:
                    return None, None, 'excludedDepartmentIds must be a list of integers'
                existing = set(Department.objects.filter(id__in=excluded_departments).values_list('id', flat=True))
                missing = [did for did in excluded_departments if did not in existing]
                if missing:
                    return None, None, f'unknown departmentId(s): {missing}'
        return excluded_roles, excluded_departments, None

    def _valid_phase_keys(self) -> list[str]:
        return list(DeliverablePhaseDefinition.objects.order_by('sort_order', 'id').values_list('key', flat=True))

    def _normalize_weeks_by_phase(self, data) -> tuple[dict[str, int] | None, str | None]:
        if 'weeksByPhase' not in data:
            return None, None
        raw = data.get('weeksByPhase')
        if raw is None:
            return {}, None
        if not isinstance(raw, dict):
            return None, 'weeksByPhase must be an object'
        valid = set(self._valid_phase_keys())
        normalized: dict[str, int] = {}
        for key, value in raw.items():
            phase = str(key).strip().lower()
            if phase not in valid:
                return None, 'weeksByPhase must match existing phase mappings'
            try:
                count = int(value)
            except Exception:
                return None, f'weeksByPhase[{phase}] must be an integer'
        if count < 0 or count > AUTO_HOURS_MAX_WEEKS_COUNT:
            return None, f'weeksByPhase[{phase}] must be between 0 and {AUTO_HOURS_MAX_WEEKS_COUNT}'
        normalized[phase] = count
        return normalized, None

    def _weeks_by_phase_response(self, template: AutoHoursTemplate) -> dict[str, int]:
        valid = self._valid_phase_keys()
        raw = template.weeks_by_phase or {}
        return {phase: int(raw.get(phase, AUTO_HOURS_DEFAULT_WEEKS_COUNT)) for phase in valid}

    def _parse_phase_keys(self, data) -> tuple[list[str] | None, str | None]:
        if 'phaseKeys' not in data:
            return None, None
        raw = data.get('phaseKeys')
        if raw is None:
            return None, 'phaseKeys must include at least one phase'
        if not isinstance(raw, list):
            return None, 'phaseKeys must be a list'
        valid = self._valid_phase_keys()
        normalized: list[str] = []
        for item in raw:
            key = str(item).strip().lower()
            if key not in valid:
                return None, 'phaseKeys must match existing phase mappings'
            if key not in normalized:
                normalized.append(key)
        if not normalized:
            return None, 'phaseKeys must include at least one phase'
        ordered = [k for k in valid if k in normalized]
        return ordered, None

    @extend_schema(
        responses=inline_serializer(
            name='AutoHoursTemplateListItem',
            fields={
                'id': serializers.IntegerField(),
                'name': serializers.CharField(),
                'description': serializers.CharField(),
                'excludedRoleIds': serializers.ListField(child=serializers.IntegerField()),
                'excludedDepartmentIds': serializers.ListField(child=serializers.IntegerField()),
                'isActive': serializers.BooleanField(),
                'phaseKeys': serializers.ListField(child=serializers.CharField()),
                'weeksByPhase': serializers.DictField(child=serializers.IntegerField()),
                'createdAt': serializers.DateTimeField(),
                'updatedAt': serializers.DateTimeField(),
            },
            many=True,
        ),
    )
    def get(self, request):
        items = []
        for t in AutoHoursTemplate.objects.all().prefetch_related('excluded_roles', 'excluded_departments').order_by('name'):
            excluded_role_ids = list(t.excluded_roles.values_list('id', flat=True))
            excluded_department_ids = list(t.excluded_departments.values_list('id', flat=True))
            items.append({
                'id': t.id,
                'name': t.name,
                'description': t.description or '',
                'excludedRoleIds': excluded_role_ids,
                'excludedDepartmentIds': excluded_department_ids,
                'isActive': t.is_active,
                'phaseKeys': t.phase_keys or [],
                'weeksByPhase': self._weeks_by_phase_response(t),
                'createdAt': t.created_at,
                'updatedAt': t.updated_at,
            })
        return Response(items)

    @extend_schema(
        request=inline_serializer(
            name='AutoHoursTemplateCreate',
            fields={
                'name': serializers.CharField(),
                'description': serializers.CharField(required=False),
                'excludedRoleIds': serializers.ListField(child=serializers.IntegerField(), required=False),
                'excludedDepartmentIds': serializers.ListField(child=serializers.IntegerField(), required=False),
                'isActive': serializers.BooleanField(required=False),
                'phaseKeys': serializers.ListField(child=serializers.CharField(), required=False),
                'weeksByPhase': serializers.DictField(child=serializers.IntegerField(), required=False),
            },
        ),
        responses=inline_serializer(
            name='AutoHoursTemplateCreateResponse',
            fields={
                'id': serializers.IntegerField(),
                'name': serializers.CharField(),
                'description': serializers.CharField(),
                'excludedRoleIds': serializers.ListField(child=serializers.IntegerField()),
                'excludedDepartmentIds': serializers.ListField(child=serializers.IntegerField()),
                'isActive': serializers.BooleanField(),
                'phaseKeys': serializers.ListField(child=serializers.CharField()),
                'weeksByPhase': serializers.DictField(child=serializers.IntegerField()),
                'createdAt': serializers.DateTimeField(),
                'updatedAt': serializers.DateTimeField(),
            },
        ),
    )
    def post(self, request):
        name = (request.data or {}).get('name') or ''
        name = str(name).strip()
        if not name:
            return Response({'error': 'name is required'}, status=400)
        if AutoHoursTemplate.objects.filter(name__iexact=name).exists():
            return Response({'error': 'template name already exists'}, status=400)
        data = request.data or {}
        description = str(data.get('description') or '').strip()
        is_active = bool(data.get('isActive', True))
        excluded_roles, excluded_departments, excl_err = self._parse_exclusions(data)
        if excl_err:
            return Response({'error': excl_err}, status=400)
        phase_keys, phase_err = self._parse_phase_keys(data)
        if phase_err:
            return Response({'error': phase_err}, status=400)
        weeks_by_phase, weeks_err = self._normalize_weeks_by_phase(data)
        if weeks_err:
            return Response({'error': weeks_err}, status=400)
        obj = AutoHoursTemplate.objects.create(
            name=name,
            description=description,
            is_active=is_active,
            phase_keys=phase_keys if phase_keys is not None else self._valid_phase_keys(),
            weeks_by_phase=weeks_by_phase or {},
        )
        if excluded_roles is not None:
            obj.excluded_roles.set(excluded_roles)
        if excluded_departments is not None:
            obj.excluded_departments.set(excluded_departments)
        return Response({
            'id': obj.id,
            'name': obj.name,
            'description': obj.description or '',
            'excludedRoleIds': list(obj.excluded_roles.values_list('id', flat=True)),
            'excludedDepartmentIds': list(obj.excluded_departments.values_list('id', flat=True)),
            'isActive': obj.is_active,
            'phaseKeys': obj.phase_keys or [],
            'weeksByPhase': self._weeks_by_phase_response(obj),
            'createdAt': obj.created_at,
            'updatedAt': obj.updated_at,
        }, status=201)


class AutoHoursTemplateDetailView(AutoHoursTemplatesView):
    permission_classes = [IsAuthenticated, IsAdminOrManager]

    def _parse_phase_keys(self, data) -> tuple[list[str] | None, str | None]:
        if 'phaseKeys' not in data:
            return None, None
        raw = data.get('phaseKeys')
        if raw is None:
            return None, 'phaseKeys must include at least one phase'
        if not isinstance(raw, list):
            return None, 'phaseKeys must be a list'
        valid = list(DeliverablePhaseDefinition.objects.order_by('sort_order', 'id').values_list('key', flat=True))
        normalized: list[str] = []
        for item in raw:
            key = str(item).strip().lower()
            if key not in valid:
                return None, 'phaseKeys must match existing phase mappings'
            if key not in normalized:
                normalized.append(key)
        if not normalized:
            return None, 'phaseKeys must include at least one phase'
        ordered = [k for k in valid if k in normalized]
        return ordered, None

    @extend_schema(
        responses=inline_serializer(
            name='AutoHoursTemplateDetail',
            fields={
                'id': serializers.IntegerField(),
                'name': serializers.CharField(),
                'description': serializers.CharField(),
                'excludedRoleIds': serializers.ListField(child=serializers.IntegerField()),
                'excludedDepartmentIds': serializers.ListField(child=serializers.IntegerField()),
                'isActive': serializers.BooleanField(),
                'phaseKeys': serializers.ListField(child=serializers.CharField()),
                'weeksByPhase': serializers.DictField(child=serializers.IntegerField()),
                'createdAt': serializers.DateTimeField(),
                'updatedAt': serializers.DateTimeField(),
            },
        ),
    )
    def get(self, request, template_id: int):
        obj = AutoHoursTemplate.objects.filter(id=template_id).first()
        if not obj:
            return Response({'error': 'template not found'}, status=404)
        return Response({
            'id': obj.id,
            'name': obj.name,
            'description': obj.description or '',
            'excludedRoleIds': list(obj.excluded_roles.values_list('id', flat=True)),
            'excludedDepartmentIds': list(obj.excluded_departments.values_list('id', flat=True)),
            'isActive': obj.is_active,
            'phaseKeys': obj.phase_keys or [],
            'weeksByPhase': self._weeks_by_phase_response(obj),
            'createdAt': obj.created_at,
            'updatedAt': obj.updated_at,
        })

    @extend_schema(
        request=inline_serializer(
            name='AutoHoursTemplateUpdate',
            fields={
                'name': serializers.CharField(required=False),
                'description': serializers.CharField(required=False),
                'excludedRoleIds': serializers.ListField(child=serializers.IntegerField(), required=False),
                'excludedDepartmentIds': serializers.ListField(child=serializers.IntegerField(), required=False),
                'isActive': serializers.BooleanField(required=False),
                'phaseKeys': serializers.ListField(child=serializers.CharField(), required=False),
                'weeksByPhase': serializers.DictField(child=serializers.IntegerField(), required=False),
            },
        ),
        responses=inline_serializer(
            name='AutoHoursTemplateUpdateResponse',
            fields={
                'id': serializers.IntegerField(),
                'name': serializers.CharField(),
                'description': serializers.CharField(),
                'excludedRoleIds': serializers.ListField(child=serializers.IntegerField()),
                'excludedDepartmentIds': serializers.ListField(child=serializers.IntegerField()),
                'isActive': serializers.BooleanField(),
                'phaseKeys': serializers.ListField(child=serializers.CharField()),
                'weeksByPhase': serializers.DictField(child=serializers.IntegerField()),
                'createdAt': serializers.DateTimeField(),
                'updatedAt': serializers.DateTimeField(),
            },
        ),
    )
    def put(self, request, template_id: int):
        obj = AutoHoursTemplate.objects.filter(id=template_id).first()
        if not obj:
            return Response({'error': 'template not found'}, status=404)
        data = request.data or {}
        if 'name' in data:
            name = str(data.get('name') or '').strip()
            if not name:
                return Response({'error': 'name is required'}, status=400)
            if AutoHoursTemplate.objects.filter(name__iexact=name).exclude(id=obj.id).exists():
                return Response({'error': 'template name already exists'}, status=400)
            obj.name = name
        if 'description' in data:
            obj.description = str(data.get('description') or '').strip()
        excluded_roles, excluded_departments, excl_err = self._parse_exclusions(data)
        if excl_err:
            return Response({'error': excl_err}, status=400)
        if 'isActive' in data:
            obj.is_active = bool(data.get('isActive'))
        phase_keys, phase_err = self._parse_phase_keys(data)
        if phase_err:
            return Response({'error': phase_err}, status=400)
        weeks_by_phase, weeks_err = self._normalize_weeks_by_phase(data)
        if weeks_err:
            return Response({'error': weeks_err}, status=400)
        if phase_keys is not None:
            obj.phase_keys = phase_keys
        if weeks_by_phase is not None:
            next_weeks = obj.weeks_by_phase or {}
            next_weeks.update(weeks_by_phase)
            obj.weeks_by_phase = next_weeks
        obj.save(update_fields=['name', 'description', 'is_active', 'phase_keys', 'weeks_by_phase', 'updated_at'])
        if excluded_roles is not None:
            obj.excluded_roles.set(excluded_roles)
        if excluded_departments is not None:
            obj.excluded_departments.set(excluded_departments)
        return Response({
            'id': obj.id,
            'name': obj.name,
            'description': obj.description or '',
            'excludedRoleIds': list(obj.excluded_roles.values_list('id', flat=True)),
            'excludedDepartmentIds': list(obj.excluded_departments.values_list('id', flat=True)),
            'isActive': obj.is_active,
            'phaseKeys': obj.phase_keys or [],
            'weeksByPhase': self._weeks_by_phase_response(obj),
            'createdAt': obj.created_at,
            'updatedAt': obj.updated_at,
        })

    @extend_schema(
        responses=inline_serializer(
            name='AutoHoursTemplateDeleteResponse',
            fields={'detail': serializers.CharField()},
        ),
    )
    def delete(self, request, template_id: int):
        obj = AutoHoursTemplate.objects.filter(id=template_id).first()
        if not obj:
            return Response({'error': 'template not found'}, status=404)
        if obj.projects.exists():
            return Response({'error': 'template is assigned to one or more projects'}, status=400)
        obj.delete()
        return Response({'detail': 'deleted'})


class AutoHoursTemplateDuplicateView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrManager]

    @extend_schema(
        request=inline_serializer(
            name='AutoHoursTemplateDuplicate',
            fields={
                'name': serializers.CharField(),
            },
        ),
        responses=inline_serializer(
            name='AutoHoursTemplateDuplicateResponse',
            fields={
                'id': serializers.IntegerField(),
                'name': serializers.CharField(),
                'description': serializers.CharField(),
                'excludedRoleIds': serializers.ListField(child=serializers.IntegerField()),
                'excludedDepartmentIds': serializers.ListField(child=serializers.IntegerField()),
                'isActive': serializers.BooleanField(),
                'phaseKeys': serializers.ListField(child=serializers.CharField()),
                'weeksByPhase': serializers.DictField(child=serializers.IntegerField()),
                'createdAt': serializers.DateTimeField(),
                'updatedAt': serializers.DateTimeField(),
            },
        ),
    )
    def post(self, request, template_id: int):
        base = AutoHoursTemplate.objects.filter(id=template_id).first()
        if not base:
            return Response({'error': 'template not found'}, status=404)
        name = str((request.data or {}).get('name') or '').strip()
        if not name:
            return Response({'error': 'name is required'}, status=400)
        if AutoHoursTemplate.objects.filter(name__iexact=name).exists():
            return Response({'error': 'template name already exists'}, status=400)

        with transaction.atomic():
            obj = AutoHoursTemplate.objects.create(
                name=name,
                description=base.description or '',
                is_active=base.is_active,
                phase_keys=base.phase_keys or [],
                weeks_by_phase=base.weeks_by_phase or {},
            )
            obj.excluded_roles.set(base.excluded_roles.all())
            obj.excluded_departments.set(base.excluded_departments.all())

            base_settings = AutoHoursTemplateRoleSetting.objects.filter(template_id=base.id)
            clone_settings = [
                AutoHoursTemplateRoleSetting(
                    template_id=obj.id,
                    role_id=setting.role_id,
                    ramp_percent_by_phase=setting.ramp_percent_by_phase or {},
                    role_count_by_phase=setting.role_count_by_phase or {},
                )
                for setting in base_settings
            ]
            if clone_settings:
                AutoHoursTemplateRoleSetting.objects.bulk_create(clone_settings)

        return Response({
            'id': obj.id,
            'name': obj.name,
            'description': obj.description or '',
            'excludedRoleIds': list(obj.excluded_roles.values_list('id', flat=True)),
            'excludedDepartmentIds': list(obj.excluded_departments.values_list('id', flat=True)),
            'isActive': obj.is_active,
            'phaseKeys': obj.phase_keys or [],
            'weeksByPhase': self._weeks_by_phase_response(obj),
            'createdAt': obj.created_at,
            'updatedAt': obj.updated_at,
        })


class AutoHoursTemplateDuplicateDefaultView(AutoHoursTemplatesView):
    permission_classes = [IsAuthenticated, IsAdminOrManager]
    MAX_WEEKS_BEFORE = AUTO_HOURS_MAX_WEEKS_BEFORE

    def _empty_hours_by_week(self) -> dict:
        return {str(i): 0 for i in range(self.MAX_WEEKS_BEFORE + 1)}

    def _resolve_hours_by_week(self, setting: AutoHoursRoleSetting | None, phase: str | None) -> dict:
        hours_by_week = self._empty_hours_by_week()
        if not setting:
            return hours_by_week
        raw = None
        if phase:
            raw_phase = (setting.ramp_percent_by_phase or {}).get(phase)
            if isinstance(raw_phase, dict) or isinstance(raw_phase, list):
                raw = raw_phase
        if raw is None:
            raw = setting.ramp_percent_by_week or {}
        if isinstance(raw, dict):
            for key, value in raw.items():
                if str(key) in hours_by_week:
                    try:
                        hours_by_week[str(int(key))] = float(Decimal(str(value)))
                    except Exception:  # nosec B110
                        pass
        if not raw:
            try:
                hours_by_week['0'] = float(setting.standard_percent_of_capacity)
            except Exception:  # nosec B110
                pass
        return hours_by_week

    @extend_schema(
        request=inline_serializer(
            name='AutoHoursTemplateDuplicateDefault',
            fields={
                'name': serializers.CharField(),
                'description': serializers.CharField(required=False),
                'excludedRoleIds': serializers.ListField(child=serializers.IntegerField(), required=False),
                'excludedDepartmentIds': serializers.ListField(child=serializers.IntegerField(), required=False),
                'isActive': serializers.BooleanField(required=False),
                'phaseKeys': serializers.ListField(child=serializers.CharField(), required=False),
            },
        ),
        responses=inline_serializer(
            name='AutoHoursTemplateDuplicateDefaultResponse',
            fields={
                'id': serializers.IntegerField(),
                'name': serializers.CharField(),
                'description': serializers.CharField(),
                'excludedRoleIds': serializers.ListField(child=serializers.IntegerField()),
                'excludedDepartmentIds': serializers.ListField(child=serializers.IntegerField()),
                'isActive': serializers.BooleanField(),
                'phaseKeys': serializers.ListField(child=serializers.CharField()),
                'weeksByPhase': serializers.DictField(child=serializers.IntegerField()),
                'createdAt': serializers.DateTimeField(),
                'updatedAt': serializers.DateTimeField(),
            },
        ),
    )
    def post(self, request):
        data = request.data or {}
        name = str(data.get('name') or '').strip()
        if not name:
            return Response({'error': 'name is required'}, status=400)
        if AutoHoursTemplate.objects.filter(name__iexact=name).exists():
            return Response({'error': 'template name already exists'}, status=400)
        description = str(data.get('description') or '').strip()
        is_active = bool(data.get('isActive', True))
        excluded_roles, excluded_departments, excl_err = self._parse_exclusions(data)
        if excl_err:
            return Response({'error': excl_err}, status=400)
        phase_keys, phase_err = self._parse_phase_keys(data)
        if phase_err:
            return Response({'error': phase_err}, status=400)
        if phase_keys is None:
            phase_keys = self._valid_phase_keys()
        if not phase_keys:
            return Response({'error': 'phaseKeys must include at least one phase'}, status=400)

        excluded_role_set = set(excluded_roles or [])
        excluded_department_set = set(excluded_departments or [])

        roles = list(DepartmentProjectRole.objects.select_related('department').order_by('department_id', 'sort_order', 'name'))
        role_ids = [r.id for r in roles]
        settings_map = {
            s.role_id: s for s in AutoHoursRoleSetting.objects.filter(role_id__in=role_ids)
        }

        global_settings = AutoHoursGlobalSettings.get_active()
        with transaction.atomic():
            obj = AutoHoursTemplate.objects.create(
                name=name,
                description=description,
                is_active=is_active,
                phase_keys=phase_keys,
                weeks_by_phase=global_settings.weeks_by_phase or {},
            )
            if excluded_roles is not None:
                obj.excluded_roles.set(excluded_roles)
            if excluded_departments is not None:
                obj.excluded_departments.set(excluded_departments)

            new_settings = []
            for role in roles:
                if role.id in excluded_role_set or role.department_id in excluded_department_set:
                    continue
                setting = settings_map.get(role.id)
                by_phase = {}
                for phase in phase_keys:
                    by_phase[phase] = self._resolve_hours_by_week(setting, phase)
                new_settings.append(AutoHoursTemplateRoleSetting(
                    template_id=obj.id,
                    role_id=role.id,
                    ramp_percent_by_phase=by_phase,
                    role_count_by_phase={phase: 1 for phase in phase_keys},
                ))
            if new_settings:
                AutoHoursTemplateRoleSetting.objects.bulk_create(new_settings)

        return Response({
            'id': obj.id,
            'name': obj.name,
            'description': obj.description or '',
            'excludedRoleIds': list(obj.excluded_roles.values_list('id', flat=True)),
            'excludedDepartmentIds': list(obj.excluded_departments.values_list('id', flat=True)),
            'isActive': obj.is_active,
            'phaseKeys': obj.phase_keys or [],
            'weeksByPhase': self._weeks_by_phase_response(obj),
            'createdAt': obj.created_at,
            'updatedAt': obj.updated_at,
        })


class AutoHoursTemplateRoleSettingsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrManager]
    MAX_WEEKS_BEFORE = AUTO_HOURS_MAX_WEEKS_BEFORE

    def _coerce_weeks_count(self, value) -> tuple[int | None, str | None]:
        try:
            count = int(value)
        except Exception:
            return None, 'weeksCount must be an integer'
        if count < 0 or count > (self.MAX_WEEKS_BEFORE + 1):
            return None, f'weeksCount must be between 0 and {self.MAX_WEEKS_BEFORE + 1}'
        return count, None

    def _get_weeks_count(self, template: AutoHoursTemplate, phase: str) -> int:
        raw = (template.weeks_by_phase or {}).get(phase)
        try:
            return int(raw)
        except Exception:
            return AUTO_HOURS_DEFAULT_WEEKS_COUNT

    def _set_weeks_count(self, template: AutoHoursTemplate, phase: str, count: int) -> None:
        weeks_by_phase = template.weeks_by_phase or {}
        weeks_by_phase[str(phase).strip().lower()] = int(count)
        template.weeks_by_phase = weeks_by_phase
        template.save(update_fields=['weeks_by_phase', 'updated_at'])

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

    def _parse_phase(self, request) -> tuple[str | None, str | None]:
        phase = request.query_params.get('phase')
        if not phase:
            return None, 'phase is required'
        norm = str(phase).strip().lower()
        valid = set(DeliverablePhaseDefinition.objects.values_list('key', flat=True))
        if norm in valid:
            return norm, None
        return None, 'phase must match an existing phase mapping'

    @extend_schema(
        responses=inline_serializer(
            name='AutoHoursTemplateRoleSettingItem',
            fields={
                'roleId': serializers.IntegerField(),
                'roleName': serializers.CharField(),
                'departmentId': serializers.IntegerField(),
                'departmentName': serializers.CharField(),
                'percentByWeek': serializers.DictField(child=serializers.FloatField()),
                'roleCount': serializers.IntegerField(),
                'weeksCount': serializers.IntegerField(),
                'isActive': serializers.BooleanField(),
                'sortOrder': serializers.IntegerField(),
            },
            many=True,
        ),
    )
    def get(self, request, template_id: int):
        phase, phase_err = self._parse_phase(request)
        if phase_err:
            return Response({'error': phase_err}, status=400)
        template = AutoHoursTemplate.objects.filter(id=template_id).first()
        if not template:
            return Response({'error': 'template not found'}, status=404)
        if phase not in (template.phase_keys or []):
            return Response([])
        weeks_count = self._get_weeks_count(template, phase)
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
        excluded_departments = set(template.excluded_departments.values_list('id', flat=True))
        excluded_roles = set(template.excluded_roles.values_list('id', flat=True))
        if excluded_departments:
            roles_qs = roles_qs.exclude(department_id__in=excluded_departments)
        if excluded_roles:
            roles_qs = roles_qs.exclude(id__in=excluded_roles)
        roles = list(roles_qs.order_by('department_id', 'sort_order', 'name'))
        role_ids = [r.id for r in roles]
        settings_map = {
            s.role_id: s for s in AutoHoursTemplateRoleSetting.objects.filter(template_id=template_id, role_id__in=role_ids)
        }
        items = []
        for role in roles:
            setting = settings_map.get(role.id)
            hours_by_week = self._empty_hours_by_week()
            role_count = 1
            if setting:
                raw = (setting.ramp_percent_by_phase or {}).get(phase) or {}
                if isinstance(raw, dict):
                    for key, value in raw.items():
                        if str(key) in hours_by_week:
                            try:
                                hours_by_week[str(int(key))] = float(Decimal(str(value)))
                            except Exception:
                                pass
                try:
                    count_raw = (setting.role_count_by_phase or {}).get(phase)
                    if count_raw is not None:
                        role_count = max(0, int(count_raw))
                except Exception:
                    role_count = 1
            items.append({
                'roleId': role.id,
                'roleName': role.name,
                'departmentId': role.department_id,
                'departmentName': getattr(role.department, 'name', ''),
                'percentByWeek': hours_by_week,
                'roleCount': role_count,
                'weeksCount': weeks_count,
                'isActive': role.is_active,
                'sortOrder': role.sort_order,
            })
        return Response(items)

    @extend_schema(
        request=inline_serializer(
            name='AutoHoursTemplateRoleSettingsUpdate',
            fields={
                'weeksCount': serializers.IntegerField(required=False),
                'settings': inline_serializer(
                    name='AutoHoursTemplateRoleSettingUpdateItem',
                    fields={
                        'roleId': serializers.IntegerField(),
                        'percentByWeek': serializers.DictField(child=serializers.FloatField(), required=False),
                        'roleCount': serializers.IntegerField(required=False),
                    },
                    many=True,
                ),
            },
        ),
        responses=inline_serializer(
            name='AutoHoursTemplateRoleSettingItemResponse',
            fields={
                'roleId': serializers.IntegerField(),
                'roleName': serializers.CharField(),
                'departmentId': serializers.IntegerField(),
                'departmentName': serializers.CharField(),
                'percentByWeek': serializers.DictField(child=serializers.FloatField()),
                'roleCount': serializers.IntegerField(),
                'weeksCount': serializers.IntegerField(),
                'isActive': serializers.BooleanField(),
                'sortOrder': serializers.IntegerField(),
            },
            many=True,
        ),
    )
    def put(self, request, template_id: int):
        phase, phase_err = self._parse_phase(request)
        if phase_err:
            return Response({'error': phase_err}, status=400)
        template = AutoHoursTemplate.objects.filter(id=template_id).first()
        if not template:
            return Response({'error': 'template not found'}, status=404)
        if phase not in (template.phase_keys or []):
            return Response({'error': 'phase is not enabled for this template'}, status=400)
        payload = request.data or {}
        weeks_count = None
        if 'weeksCount' in payload:
            weeks_count, weeks_err = self._coerce_weeks_count(payload.get('weeksCount'))
            if weeks_err:
                return Response({'error': weeks_err}, status=400)
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

        updates: list[tuple[int, dict, int | None]] = []
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
            role_count = None
            if 'roleCount' in item:
                try:
                    role_count = int(item.get('roleCount'))
                except Exception:
                    return Response({'error': f'invalid roleCount for roleId {role_id}'}, status=400)
                if role_count < 0:
                    return Response({'error': 'roleCount must be >= 0'}, status=400)
            updates.append((role_id, hours_by_week, role_count))
            role_ids.append(role_id)

        if role_ids:
            existing_qs = DepartmentProjectRole.objects.filter(id__in=role_ids)
            if dept_id_int is not None:
                existing_qs = existing_qs.filter(department_id=dept_id_int)
            excluded_departments = set(template.excluded_departments.values_list('id', flat=True))
            excluded_roles = set(template.excluded_roles.values_list('id', flat=True))
            if excluded_departments:
                existing_qs = existing_qs.exclude(department_id__in=excluded_departments)
            if excluded_roles:
                existing_qs = existing_qs.exclude(id__in=excluded_roles)
            existing = set(existing_qs.values_list('id', flat=True))
            missing = [rid for rid in role_ids if rid not in existing]
            if missing:
                return Response({'error': f'unknown or excluded roleId(s): {missing}'}, status=400)

        if weeks_count is not None:
            self._set_weeks_count(template, phase, weeks_count)

        with transaction.atomic():
            for role_id, hours_by_week, role_count in updates:
                obj, _ = AutoHoursTemplateRoleSetting.objects.get_or_create(template_id=template_id, role_id=role_id)
                by_phase = obj.ramp_percent_by_phase or {}
                by_phase[phase] = hours_by_week
                obj.ramp_percent_by_phase = by_phase
                if role_count is not None:
                    count_by_phase = obj.role_count_by_phase or {}
                    count_by_phase[phase] = int(role_count)
                    obj.role_count_by_phase = count_by_phase
                    obj.save(update_fields=['ramp_percent_by_phase', 'role_count_by_phase', 'updated_at'])
                else:
                    obj.save(update_fields=['ramp_percent_by_phase', 'updated_at'])

        return self.get(request, template_id=template_id)


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
                'full_capacity_hours': 36,
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
        phases = DeliverablePhaseDefinition.objects.all().order_by('sort_order', 'id')
        payload = {
            'useDescriptionMatch': bool(obj.use_description_match),
            'phases': [
                {
                    'key': p.key,
                    'label': p.label,
                    'descriptionTokens': p.description_tokens or [],
                    'rangeMin': p.range_min,
                    'rangeMax': p.range_max,
                    'sortOrder': p.sort_order,
                }
                for p in phases
            ],
            'updatedAt': obj.updated_at,
        }
        return Response(payload)

    @extend_schema(request=DeliverablePhaseMappingSettingsSerializer, responses=DeliverablePhaseMappingSettingsSerializer)
    def put(self, request):
        obj = DeliverablePhaseMappingSettings.get_active()
        ser = DeliverablePhaseMappingSettingsSerializer(data=request.data, partial=False)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        phases = data.get('phases') or []
        use_desc = bool(data.get('useDescriptionMatch'))

        incoming_keys = []
        for phase in phases:
            key = str(phase.get('key') or '').strip().lower()
            incoming_keys.append(key)

        existing_keys = set(DeliverablePhaseDefinition.objects.values_list('key', flat=True))
        remove_keys = [k for k in existing_keys if k not in set(incoming_keys)]
        if remove_keys:
            from deliverables.models import DeliverableTaskTemplate
            used = set(DeliverableTaskTemplate.objects.filter(phase__in=remove_keys).values_list('phase', flat=True))
            if used:
                return Response({'error': f'Cannot remove phases with existing task templates: {sorted(used)}'}, status=400)

        with transaction.atomic():
            obj.use_description_match = use_desc
            obj.save(update_fields=['use_description_match', 'updated_at'])

            for idx, phase in enumerate(phases):
                key = str(phase.get('key') or '').strip().lower()
                label = str(phase.get('label') or '').strip()
                tokens = phase.get('descriptionTokens') or []
                normalized_tokens = []
                for token in tokens:
                    t = str(token).strip().lower()
                    if not t:
                        continue
                    if t in normalized_tokens:
                        continue
                    normalized_tokens.append(t)
                rmin = phase.get('rangeMin', None)
                rmax = phase.get('rangeMax', None)
                sort_order = phase.get('sortOrder', idx)
                incoming_keys.append(key)
                obj_phase, _ = DeliverablePhaseDefinition.objects.get_or_create(
                    key=key,
                    defaults={
                        'label': label,
                        'description_tokens': normalized_tokens,
                        'range_min': rmin,
                        'range_max': rmax,
                        'sort_order': sort_order,
                    },
                )
                obj_phase.label = label
                obj_phase.description_tokens = normalized_tokens
                obj_phase.range_min = rmin
                obj_phase.range_max = rmax
                obj_phase.sort_order = sort_order
                obj_phase.save(update_fields=['label', 'description_tokens', 'range_min', 'range_max', 'sort_order', 'updated_at'])

            if remove_keys:
                DeliverablePhaseDefinition.objects.filter(key__in=remove_keys).delete()
        # Invalidate classifier cache
        try:
            from core.deliverable_phase import clear_phase_mapping_cache
            clear_phase_mapping_cache()
        except Exception:  # nosec B110
            pass
        return self.get(request)

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
