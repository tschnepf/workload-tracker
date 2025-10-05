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
)
from .models import PreDeliverableGlobalSettings, UtilizationScheme
from deliverables.models import PreDeliverableType
from accounts.models import AdminAuditLog  # type: ignore


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
