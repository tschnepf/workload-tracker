from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from django.conf import settings
import hashlib
from django.db import transaction

from .serializers import (
    PreDeliverableGlobalSettingsItemSerializer,
    PreDeliverableGlobalSettingsUpdateSerializer,
    UtilizationSchemeSerializer,
    ProjectRoleSerializer,
    CalendarFeedSettingsSerializer,
)
from .models import PreDeliverableGlobalSettings, UtilizationScheme, ProjectRole, CalendarFeedSettings
from accounts.permissions import IsAdminOrManager
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
        except Exception:
            pass

        return Response({'detail': 'deleted', 'removedFromAssignments': removed_count, 'catalogDeleted': catalog_deleted})


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
