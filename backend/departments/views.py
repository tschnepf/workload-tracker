from rest_framework import viewsets
from rest_framework.response import Response
from django.db import connection
from functools import lru_cache
from .models import Department
from .serializers import DepartmentSerializer


@lru_cache(maxsize=1)
def _has_secondary_manager_m2m_table() -> bool:
    """Best-effort check for the secondary manager m2m table.

    Some running environments may have code deployed before migrations are applied.
    In that case, prefetching the m2m relation raises a database error and breaks
    all department reads.
    """
    try:
        table_name = Department.secondary_managers.through._meta.db_table
        with connection.cursor() as cursor:
            return table_name in set(connection.introspection.table_names(cursor))
    except Exception:
        return False


class DepartmentViewSet(viewsets.ModelViewSet):
    serializer_class = DepartmentSerializer
    # Use global default permissions (IsAuthenticated)

    def get_queryset(self):
        qs = Department.objects.select_related('manager')
        if _has_secondary_manager_m2m_table():
            qs = qs.prefetch_related('secondary_managers')
        qs = qs.order_by('name')
        include_inactive = False
        try:
            raw = self.request.query_params.get('include_inactive') if self.request else None
            if raw is not None and str(raw).strip().lower() in ('1', 'true', 'yes', 'on'):
                include_inactive = True
        except Exception:
            include_inactive = False
        if not include_inactive:
            qs = qs.filter(is_active=True)
        vertical_param = None
        try:
            vertical_param = self.request.query_params.get('vertical') if self.request else None
        except Exception:
            vertical_param = None
        if vertical_param not in (None, ""):
            try:
                qs = qs.filter(vertical_id=int(vertical_param))
            except Exception:
                pass
        return qs
    
    def list(self, request, *args, **kwargs):
        """Get all departments with bulk loading support"""
        # Check if bulk loading is requested
        if request.query_params.get('all') == 'true':
            # Return all departments without pagination (Phase 2 optimization)
            queryset = self.get_queryset()
            serializer = self.get_serializer(queryset, many=True)
            return Response(serializer.data)
        
        # Use default pagination
        return super().list(request, *args, **kwargs)
