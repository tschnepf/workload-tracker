from rest_framework import viewsets
from rest_framework.response import Response
from .models import Vertical
from .serializers import VerticalSerializer
from core.vertical_scope import get_request_enforced_vertical_id


class VerticalViewSet(viewsets.ModelViewSet):
    serializer_class = VerticalSerializer

    def get_queryset(self):
        qs = Vertical.objects.order_by('name')
        enforced_vertical_id = get_request_enforced_vertical_id(getattr(self, 'request', None))
        if enforced_vertical_id is not None:
            qs = qs.filter(id=enforced_vertical_id)
        include_inactive = False
        try:
            raw = self.request.query_params.get('include_inactive') if self.request else None
            if raw is not None and str(raw).strip().lower() in ('1', 'true', 'yes', 'on'):
                include_inactive = True
        except Exception:
            include_inactive = False
        if not include_inactive:
            qs = qs.filter(is_active=True)
        return qs

    def list(self, request, *args, **kwargs):
        """Get all verticals with bulk loading support"""
        if request.query_params.get('all') == 'true':
            queryset = self.get_queryset()
            serializer = self.get_serializer(queryset, many=True)
            return Response(serializer.data)
        return super().list(request, *args, **kwargs)
