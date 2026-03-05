"""
Deliverable views - STANDARDS COMPLIANT API endpoints
Follows R2-REBUILD-STANDARDS.md naming conventions
"""

from rest_framework import viewsets, permissions, status
from core.etag import ETagConditionalMixin
from drf_spectacular.utils import extend_schema, OpenApiParameter, inline_serializer, OpenApiResponse, OpenApiTypes
from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import transaction
from django.db.models import Count, Q, Max, Subquery
from django.utils.dateparse import parse_date
from django.utils.http import http_date
from datetime import datetime
from collections import defaultdict
import json
import re
import logging
from .models import Deliverable, DeliverableAssignment, ReallocationAudit
from .serializers import (
    DeliverableSerializer,
    DeliverableAssignmentSerializer,
    DeliverableCalendarItemSerializer,
    PreDeliverableItemSerializer,
)
from assignments.models import Assignment
from assignments.lead_utils import is_lead_role_name, resolve_assignment_role_name
from drf_spectacular.utils import extend_schema, OpenApiParameter, inline_serializer
from rest_framework import serializers
from django.conf import settings

from .reallocation import reallocate_weekly_hours
from datetime import timedelta, date as _date
from core.week_utils import sunday_of_week
from .models import PreDeliverableItem
from .services import PreDeliverableService
from accounts.permissions import is_admin_or_manager, IsAdminOrManager
from core.job_access import JobAccessRegistrationError, enqueue_user_facing_task
from projects.change_log import record_project_change
try:
    from core.tasks import backfill_pre_deliverables_async  # type: ignore
except Exception:
    backfill_pre_deliverables_async = None  # type: ignore


class DeliverableViewSet(ETagConditionalMixin, viewsets.ModelViewSet):
    """
    CRUD operations for deliverables
    Supports filtering by project and manual reordering
    """
    serializer_class = DeliverableSerializer
    # Use global default permissions (IsAuthenticated)
    
    def get_queryset(self):
        """Filter deliverables by project if specified"""
        queryset = Deliverable.objects.all().order_by('sort_order', 'percentage', 'date')
        
        # Filter by project if provided
        project_id = self.request.query_params.get('project', None)
        if project_id is not None:
            queryset = queryset.filter(project_id=project_id)
        
        return queryset
    
    def list(self, request, *args, **kwargs):
        """Get deliverables with bulk loading support (Phase 2 optimization)"""
        queryset = self.get_queryset()
        
        # Check if bulk loading is requested
        if request.query_params.get('all') == 'true':
            # Return all deliverables without pagination
            serializer = self.get_serializer(queryset, many=True)
            return Response(serializer.data)
        
        # Use default pagination
        return super().list(request, *args, **kwargs)

    def _deliverable_log_fields(self, instance: Deliverable) -> dict:
        return {
            'description': (instance.description or None),
            'percentage': instance.percentage,
            'date': instance.date.isoformat() if instance.date else None,
        }

    def _deliverable_log_payload(self, instance: Deliverable) -> dict:
        data = self._deliverable_log_fields(instance)
        data['id'] = instance.id
        return data

    def _deliverable_log_changes(self, before: dict, after: dict) -> dict:
        changes = {}
        for key in ('description', 'percentage', 'date'):
            if before.get(key) != after.get(key):
                changes[key] = {'from': before.get(key), 'to': after.get(key)}
        return changes

    def perform_create(self, serializer):
        instance = serializer.save()
        record_project_change(
            project=instance.project,
            actor=getattr(self.request, 'user', None),
            action='deliverable.created',
            detail={'deliverable': self._deliverable_log_payload(instance)},
        )

    def partial_update(self, request, *args, **kwargs):
        """PATCH deliverable. If date changes and feature flag enabled, reallocate hours.

        Response includes optional 'reallocation' summary with keys:
        { deltaWeeks, assignmentsChanged, touchedWeekKeys }
        """
        instance: Deliverable = self.get_object()
        old_values = self._deliverable_log_fields(instance)
        old_date = instance.date
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        new_date = serializer.validated_data.get('date', old_date)

        do_realloc = (
            settings.FEATURES.get('AUTO_REALLOCATION') and
            'date' in serializer.validated_data and
            old_date != new_date and
            new_date is not None and old_date is not None
        )

        realloc_summary = None
        if do_realloc:
            # Compute window from neighbors around the old date
            prev = (
                Deliverable.objects.filter(project_id=instance.project_id, date__lt=old_date)
                .exclude(id=instance.id)
                .order_by('-date')
                .first()
            )
            nxt = (
                Deliverable.objects.filter(project_id=instance.project_id, date__gt=old_date)
                .exclude(id=instance.id)
                .order_by('date')
                .first()
            )
            win_start = (prev.date + timedelta(days=1)) if (prev and prev.date) else None
            win_end = (nxt.date - timedelta(days=1)) if (nxt and nxt.date) else None

            # Compute delta weeks
            try:
                dw = (sunday_of_week(new_date) - sunday_of_week(old_date)).days // 7
            except Exception:
                dw = 0

            assignments = Assignment.objects.filter(project_id=instance.project_id, is_active=True)
            changed_objs = []
            touched: set[str] = set()
            changed_count = 0

            with transaction.atomic():
                # Save deliverable first to persist date change in the same transaction
                instance = serializer.save()
                new_values = self._deliverable_log_fields(instance)
                changes = self._deliverable_log_changes(old_values, new_values)
                audit_snapshot = {}
                for a in assignments.select_for_update():
                    wh_before = dict(a.weekly_hours or {})
                    if not wh_before:
                        continue
                    wh_after = reallocate_weekly_hours(wh_before, old_date, new_date, window=(win_start, win_end))
                    if wh_after != wh_before:
                        changed_count += 1
                        a.weekly_hours = wh_after
                        changed_objs.append(a)
                        # Collect touched keys where values changed or moved
                        before_keys = set(wh_before.keys())
                        after_keys = set(wh_after.keys())
                        changed_keys = before_keys.symmetric_difference(after_keys)
                        # Also include keys whose values changed even if keys remain
                        common = before_keys & after_keys
                        for k in common:
                            try:
                                if float(wh_before.get(k) or 0) != float(wh_after.get(k) or 0):
                                    changed_keys.add(k)
                            except Exception:
                                changed_keys.add(k)
                        touched.update(changed_keys)
                        # Store per-assignment diff snapshot (changed keys only)
                        prev_subset = {k: int(wh_before.get(k) or 0) for k in sorted(changed_keys) if k in wh_before}
                        next_subset = {k: int(wh_after.get(k) or 0) for k in sorted(changed_keys) if k in wh_after}
                        audit_snapshot[str(a.id)] = {'prev': prev_subset, 'next': next_subset}

                if changed_objs:
                    # Bulk update weekly_hours
                    Assignment.objects.bulk_update(changed_objs, ['weekly_hours'])

                # Persist audit snapshot for observability and optional undo
                try:
                    ReallocationAudit.objects.create(
                        deliverable=instance,
                        project=instance.project,
                        user_id=getattr(getattr(request, 'user', None), 'id', None),
                        old_date=old_date,
                        new_date=new_date,
                        delta_weeks=dw,
                        assignments_changed=changed_count,
                        touched_week_keys=sorted(touched),
                        snapshot=audit_snapshot,
                    )
                except Exception:  # nosec B110
                    # Non-blocking: failure to persist audit must not fail request
                    pass

                if changes:
                    record_project_change(
                        project=instance.project,
                        actor=getattr(request, 'user', None),
                        action='deliverable.updated',
                        detail={
                            'deliverable': self._deliverable_log_payload(instance),
                            'changes': changes,
                        },
                    )

            realloc_summary = {
                'deltaWeeks': dw,
                'assignmentsChanged': changed_count,
                'touchedWeekKeys': sorted(touched),
            }

            try:
                logging.getLogger('request').info("deliverable_reallocation", extra={
                    'event': 'deliverable_reallocation',
                    'deliverable_id': instance.id,
                    'project_id': instance.project_id,
                    'user_id': getattr(getattr(request, 'user', None), 'id', None),
                    'delta_weeks': dw,
                    'assignments_changed': changed_count,
                    'touched_weeks_count': len(realloc_summary['touchedWeekKeys']),
                })
            except Exception:  # nosec B110
                pass

            data = self.get_serializer(instance).data
            data['reallocation'] = realloc_summary
            return Response(data)

        # Default path: just save and return
        instance = serializer.save()
        new_values = self._deliverable_log_fields(instance)
        changes = self._deliverable_log_changes(old_values, new_values)
        if changes:
            record_project_change(
                project=instance.project,
                actor=getattr(request, 'user', None),
                action='deliverable.updated',
                detail={
                    'deliverable': self._deliverable_log_payload(instance),
                    'changes': changes,
                },
            )
        return Response(self.get_serializer(instance).data)

    def perform_destroy(self, instance):
        detail = {'deliverable': self._deliverable_log_payload(instance)}
        project = instance.project
        super().perform_destroy(instance)
        record_project_change(
            project=project,
            actor=getattr(self.request, 'user', None),
            action='deliverable.deleted',
            detail=detail,
        )
    
    @extend_schema(
        request=inline_serializer(name='DeliverableReorderRequest', fields={
            'project': serializers.IntegerField(),
            'deliverable_ids': serializers.ListField(child=serializers.IntegerField()),
        }),
        responses=inline_serializer(name='DeliverableReorderResponse', fields={'success': serializers.BooleanField()}),
    )
    @action(detail=False, methods=['post'])
    def reorder(self, request):
        """
        Manually reorder deliverables for a project
        Expected payload: {
            "project": project_id,
            "deliverable_ids": [id1, id2, id3, ...]
        }
        """
        project_id = request.data.get('project')
        deliverable_ids = request.data.get('deliverable_ids', [])
        
        if not project_id or not deliverable_ids:
            return Response(
                {"error": "Both 'project' and 'deliverable_ids' are required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            with transaction.atomic():
                # Update sort_order for each deliverable
                for index, deliverable_id in enumerate(deliverable_ids):
                    Deliverable.objects.filter(
                        id=deliverable_id, 
                        project_id=project_id
                    ).update(sort_order=(index + 1) * 10)
                
                return Response({"success": True}, status=status.HTTP_200_OK)
                
        except Exception as e:
            logging.exception("Failed to reorder deliverables")
            return Response(
                {"error": "Failed to reorder deliverables."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @extend_schema(
        parameters=[
            OpenApiParameter(name='project_ids', type=str, required=True, description='Comma-separated project IDs'),
        ],
        responses=OpenApiResponse(
            response=OpenApiTypes.OBJECT,
            description='Map of project_id to list of deliverables.',
        ),
    )
    @action(detail=False, methods=['get'])
    def bulk(self, request):
        """
        Bulk fetch deliverables for multiple projects
        GET /api/deliverables/bulk/?project_ids=1,2,3,4
        
        Returns: { "1": [...], "2": [...], "3": [...], "4": [...] }
        """
        project_ids_param = request.query_params.get('project_ids', '')
        
        if not project_ids_param:
            return Response(
                {"error": "project_ids parameter is required"}, 
                status=status.HTTP_400_BAD_REQUEST
            )

        # Implement bulk fetch with validation and error handling
        try:
            # Parse and validate project IDs
            project_ids = [int(pid.strip()) for pid in project_ids_param.split(',') if pid.strip()]

            if not project_ids:
                return Response(
                    {"error": "At least one valid project ID is required"},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Limit to reasonable number of projects to prevent abuse
            if len(project_ids) > 200:
                return Response(
                    {"error": "Maximum 200 project IDs allowed"},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Single efficient query to get all deliverables
            deliverables = (
                Deliverable.objects
                .filter(project_id__in=project_ids)
                .order_by('sort_order', 'percentage', 'date')
                .select_related('project')
            )

            # Group deliverables by project_id
            grouped_deliverables = defaultdict(list)
            for deliverable in deliverables:
                serialized_data = DeliverableSerializer(deliverable).data
                grouped_deliverables[str(deliverable.project_id)].append(serialized_data)

            # Ensure all requested projects are represented in response
            result = {}
            for pid in project_ids:
                result[str(pid)] = grouped_deliverables.get(str(pid), [])

            return Response(result, status=status.HTTP_200_OK)

        except ValueError:
            return Response(
                {"error": "Invalid project ID format. Use comma-separated integers."},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logging.exception("Failed to fetch bulk deliverables")
            return Response(
                {"error": f"Failed to fetch bulk deliverables: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @extend_schema(
        parameters=[
            OpenApiParameter(name='start', type=str, required=False, description='YYYY-MM-DD'),
            OpenApiParameter(name='end', type=str, required=False, description='YYYY-MM-DD'),
        ],
        responses=DeliverableCalendarItemSerializer(many=True)
    )
    @extend_schema(
        parameters=[OpenApiParameter(name='start', type=str, required=False, description='YYYY-MM-DD'),
                    OpenApiParameter(name='end', type=str, required=False, description='YYYY-MM-DD'),
                    OpenApiParameter(name='vertical', type=int, required=False, description='Filter by vertical id')],
        responses=DeliverableCalendarItemSerializer(many=True)
    )
    @action(detail=False, methods=['get'])
    def calendar(self, request):
        """
        Read-only calendar endpoint returning deliverables within a date range
        with assignmentCount. Missing params tolerated (returns all dated items).

        GET /api/deliverables/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD
        """
        start_str = request.query_params.get('start')
        end_str = request.query_params.get('end')
        vertical_param = request.query_params.get('vertical')
        start_date = parse_date(start_str) if start_str else None
        end_date = parse_date(end_str) if end_str else None

        # Build the main calendar queryset

        qs = (
            Deliverable.objects.all()
            .select_related('project')
            .annotate(
                assignmentCount=Count(
                    'assignments', filter=Q(assignments__is_active=True)
                )
            )
        )
        if vertical_param not in (None, ""):
            try:
                qs = qs.filter(project__vertical_id=int(vertical_param))
            except Exception:  # nosec B110
                pass

        # Apply date filters if provided; otherwise return dated items only
        if start_date:
            qs = qs.filter(date__gte=start_date)
        if end_date:
            qs = qs.filter(date__lte=end_date)
        if not start_date and not end_date:
            qs = qs.filter(date__isnull=False)

        # Compute conditional caching headers (ETag/Last-Modified)
        agg = qs.aggregate(
            max_deliv=Max('updated_at'),
            max_assign=Max('assignments__updated_at'),
            total=Count('id'),
        )
        last_updated = agg['max_assign'] or agg['max_deliv']
        count = agg['total'] or 0
        etag_val = f"W/\"calendar:{start_str or ''}:{end_str or ''}:{vertical_param or ''}:{(last_updated.isoformat() if last_updated else '')}:{count}\""
        if_none_match = request.META.get('HTTP_IF_NONE_MATCH')
        if if_none_match and if_none_match == etag_val:
            return Response(status=status.HTTP_304_NOT_MODIFIED)

        ser = DeliverableCalendarItemSerializer(qs, many=True)
        resp = Response(ser.data)
        if last_updated:
            resp['Last-Modified'] = http_date(int(last_updated.timestamp()))
        resp['ETag'] = etag_val
        return resp

    @extend_schema(
        parameters=[
            OpenApiParameter(name='start', type=str, required=False, description='YYYY-MM-DD'),
            OpenApiParameter(name='end', type=str, required=False, description='YYYY-MM-DD'),
            OpenApiParameter(name='mine_only', type=bool, required=False),
            OpenApiParameter(name='type_id', type=int, required=False),
            OpenApiParameter(name='vertical', type=int, required=False, description='Filter by vertical id'),
            OpenApiParameter(name='include_notes', type=str, required=False, description='none|preview|full (default none)'),
            OpenApiParameter(name='include_project_leads', type=bool, required=False, description='Include department lead names grouped by project'),
        ],
    )
    @action(detail=False, methods=['get'])
    def calendar_with_pre_items(self, request):
        """Calendar view returning deliverables and pre-deliverable items.

        Semantics:
        - When mine_only=true, scope results to the union of:
          (a) deliverables directly linked to the current user via DeliverableAssignment,
          (b) deliverables on projects where the current user has an active project-level Assignment.
        - Duplicates are eliminated via a distinct ID subquery strategy; counts use distinct=True.
        - Optional filters: start, end (dates) and type_id (pre-deliverable type).
        """
        start_str = request.query_params.get('start')
        end_str = request.query_params.get('end')
        mine_only = request.query_params.get('mine_only') in ('1', 'true', 'True')
        type_id = request.query_params.get('type_id')
        vertical_param = request.query_params.get('vertical')
        include_notes_raw = (request.query_params.get('include_notes') or '').strip().lower()
        include_project_leads = request.query_params.get('include_project_leads') in ('1', 'true', 'True')
        start_date = parse_date(start_str) if start_str else None
        end_date = parse_date(end_str) if end_str else None

        if include_notes_raw in ('', '0', 'none', 'false'):
            include_notes = 'none'
        elif include_notes_raw in ('preview', 'full'):
            include_notes = include_notes_raw
        else:
            return Response({'detail': 'include_notes must be one of: none, preview, full'}, status=status.HTTP_400_BAD_REQUEST)

        if include_notes == 'full' and not is_admin_or_manager(getattr(request, 'user', None)):
            return Response({'detail': 'include_notes=full requires admin or manager access'}, status=status.HTTP_403_FORBIDDEN)

        def _sanitize_notes_preview(raw_notes: str | None, limit: int = 280) -> str | None:
            if not raw_notes:
                return None
            text = re.sub(r'<[^>]*>', ' ', raw_notes)
            text = re.sub(r'\s+', ' ', text).strip()
            if not text:
                return None
            if len(text) <= limit:
                return text
            return f"{text[: max(0, limit - 1)].rstrip()}..."

        def _payload_size_bytes(value: object) -> int:
            try:
                return len(json.dumps(value, default=str, separators=(',', ':')).encode('utf-8'))
            except Exception:
                return 0

        def _truncate_text(value: str | None, limit: int) -> str | None:
            if value is None:
                return None
            text = str(value)
            if len(text) <= limit:
                return text
            return f"{text[: max(0, limit - 1)].rstrip()}..."

        def _apply_payload_guardrails(payload: dict) -> dict:
            try:
                max_bytes = int(getattr(settings, 'DELIVERABLES_CALENDAR_MAX_BYTES', 512_000))
            except Exception:
                max_bytes = 512_000
            max_bytes = max(128, max_bytes)
            if _payload_size_bytes(payload) <= max_bytes:
                return payload

            truncation: dict[str, object] = {}
            items_raw = payload.get('items')
            if not isinstance(items_raw, list):
                payload['truncated'] = {'reason': 'payload_cap_exceeded'}
                return payload

            items_list: list[dict] = [dict(item) if isinstance(item, dict) else {'value': item} for item in items_raw]
            notes_mode = payload.get('notesMode')
            if notes_mode == 'full':
                for item in items_list:
                    if item.get('itemType') != 'deliverable':
                        continue
                    if 'notes' in item:
                        item['notes'] = _truncate_text(item.get('notes'), 800)
                truncation['notes'] = 'trimmed_to_800_chars'
            elif notes_mode == 'preview':
                for item in items_list:
                    if item.get('itemType') != 'deliverable':
                        continue
                    if 'notesPreview' in item:
                        item['notesPreview'] = _truncate_text(item.get('notesPreview'), 140)
                truncation['notesPreview'] = 'trimmed_to_140_chars'

            payload['items'] = items_list
            if _payload_size_bytes(payload) <= max_bytes:
                payload['truncated'] = truncation
                return payload

            if 'departmentLeadsByProject' in payload:
                payload.pop('departmentLeadsByProject', None)
                for item in items_list:
                    item.pop('departmentLeads', None)
                truncation['departmentLeadsByProject'] = 'removed'
                if _payload_size_bytes(payload) <= max_bytes:
                    payload['truncated'] = truncation
                    return payload

            def _item_sort_key(item: dict) -> tuple[str, str, int]:
                raw_id = item.get('id')
                try:
                    item_id = int(raw_id)
                except Exception:
                    item_id = 0
                return (
                    str(item.get('date') or ''),
                    str(item.get('itemType') or ''),
                    item_id,
                )

            ordered_items = sorted(items_list, key=_item_sort_key)
            base_payload = {k: v for k, v in payload.items() if k != 'items'}
            kept: list[dict] = []
            omitted = 0
            for item in ordered_items:
                candidate = {**base_payload, 'items': kept + [item]}
                if _payload_size_bytes(candidate) <= max_bytes:
                    kept.append(item)
                else:
                    omitted += 1
            payload['items'] = kept
            truncation['items'] = {
                'returned': len(kept),
                'omitted': omitted,
            }
            payload['truncated'] = truncation
            if _payload_size_bytes(payload) > max_bytes:
                payload.pop('notesMode', None)
                payload['truncated'] = {
                    'reason': 'payload_cap_exceeded',
                    'items': {
                        'returned': len(payload.get('items', [])),
                        'omitted': max(0, len(ordered_items) - len(payload.get('items', []))),
                    },
                }
            if _payload_size_bytes(payload) > max_bytes:
                payload['items'] = []
                payload['truncated'] = {
                    'reason': 'payload_cap_exceeded',
                    'items': {
                        'returned': 0,
                        'omitted': len(ordered_items),
                    },
                }
            return payload

        # Compute allowed deliverable IDs (subquery) for mine_only scoping
        allowed_ids_subq = None
        allowed_ids_list: list[int] = []
        if mine_only:
            from assignments.models import Assignment as _ProjAssign
            from deliverables.models import DeliverableAssignment as _DelAssign
            _prof = getattr(request.user, 'profile', None)
            _pid = getattr(_prof, 'person_id', None)
            if _pid:
                _project_ids_subq = _ProjAssign.objects.filter(
                    is_active=True, person_id=_pid
                ).values('project_id')
                allowed_ids_subq = (
                    Deliverable.objects.filter(
                        Q(assignments__is_active=True, assignments__person_id=_pid)
                        | Q(project_id__in=Subquery(_project_ids_subq))
                    )
                    .values('id')
                    .distinct()
                )
                # Python fallback list for safety/portability
                _direct = list(_DelAssign.objects.filter(is_active=True, person_id=_pid).values_list('deliverable_id', flat=True))
                _proj_ids = list(_ProjAssign.objects.filter(is_active=True, person_id=_pid).values_list('project_id', flat=True))
                _via_proj = list(Deliverable.objects.filter(project_id__in=_proj_ids).values_list('id', flat=True))
                allowed_ids_list = sorted(set(_direct) | set(_via_proj))

        

        # Build deliverables queryset
        base_qs = Deliverable.objects.all().select_related('project')
        if vertical_param not in (None, ""):
            try:
                base_qs = base_qs.filter(project__vertical_id=int(vertical_param))
            except Exception:  # nosec B110
                pass

        # Start from base_qs or restrict by explicit ID allow‑list
        if mine_only:
            if allowed_ids_list:
                scoped_qs = base_qs.filter(id__in=allowed_ids_list)
            elif allowed_ids_subq is not None:
                scoped_qs = base_qs.filter(id__in=Subquery(allowed_ids_subq))
            else:
                scoped_qs = base_qs.none()
        else:
            scoped_qs = base_qs

        # Apply date filters on the already-scoped queryset
        if start_date:
            scoped_qs = scoped_qs.filter(date__gte=start_date)
        if end_date:
            scoped_qs = scoped_qs.filter(date__lte=end_date)
        if not start_date and not end_date:
            scoped_qs = scoped_qs.filter(date__isnull=False)

        # Annotate after filtering; use distinct to avoid overcount when multiple links exist
        qs = (
            scoped_qs
            .annotate(
                assignmentCount=Count('assignments', filter=Q(assignments__is_active=True), distinct=True)
            )
            .distinct()
        )

        items = []
        for d in qs:
            item = {
                'itemType': 'deliverable',
                **DeliverableCalendarItemSerializer(d).data,
            }
            if include_notes == 'preview':
                item['notesPreview'] = _sanitize_notes_preview(getattr(d, 'notes', None))
            elif include_notes == 'full':
                item['notes'] = getattr(d, 'notes', None)
            items.append(item)

        pre_qs = PreDeliverableItem.objects.select_related('deliverable', 'deliverable__project', 'pre_deliverable_type')
        if start_date:
            pre_qs = pre_qs.filter(generated_date__gte=start_date)
        if end_date:
            pre_qs = pre_qs.filter(generated_date__lte=end_date)
        if type_id:
            try:
                pre_qs = pre_qs.filter(pre_deliverable_type_id=int(type_id))
            except ValueError:  # nosec B110
                pass
        if mine_only:
            if allowed_ids_list:
                pre_qs = pre_qs.filter(deliverable_id__in=allowed_ids_list)
            elif allowed_ids_subq is not None:
                pre_qs = pre_qs.filter(deliverable_id__in=Subquery(allowed_ids_subq))
            else:
                pre_qs = pre_qs.none()
        if vertical_param not in (None, ""):
            try:
                pre_qs = pre_qs.filter(deliverable__project__vertical_id=int(vertical_param))
            except Exception:  # nosec B110
                pass

        pre_items = [{
            'itemType': 'pre_deliverable',
            'id': pi.id,
            'parentDeliverableId': pi.deliverable_id,
            'project': pi.deliverable.project_id,
            'projectName': getattr(pi.deliverable.project, 'name', None),
            'projectClient': getattr(pi.deliverable.project, 'client', None),
            'preDeliverableType': getattr(pi.pre_deliverable_type, 'name', None),
            'title': f"PRE: {getattr(pi.pre_deliverable_type, 'name', '')}",
            'date': pi.generated_date,
            'isCompleted': pi.is_completed,
            'isOverdue': pi.is_overdue,
        } for pi in pre_qs]

        department_leads_by_project: dict[int, dict[int, list[str]]] = {}
        if include_project_leads:
            project_ids = sorted(
                {
                    int(item.get('project'))
                    for item in items
                    if isinstance(item.get('project'), int)
                }
            )
            if project_ids:
                grouped: dict[int, dict[int, set[str]]] = defaultdict(lambda: defaultdict(set))
                assignments_qs = (
                    Assignment.objects.filter(is_active=True, project_id__in=project_ids, person__isnull=False)
                    .select_related('person', 'person__department', 'department', 'role_on_project_ref')
                )
                for assignment in assignments_qs:
                    role_name = resolve_assignment_role_name(assignment)
                    if not is_lead_role_name(role_name):
                        continue
                    person_name = None
                    try:
                        person_name = assignment.person.name if assignment.person else None
                    except Exception:  # nosec B110
                        person_name = None
                    if not person_name:
                        continue
                    dept_id = (
                        getattr(assignment.person, 'department_id', None)
                        or getattr(assignment, 'department_id', None)
                        or getattr(getattr(assignment, 'role_on_project_ref', None), 'department_id', None)
                        or -1
                    )
                    if assignment.project_id:
                        grouped[int(assignment.project_id)][int(dept_id)].add(person_name)

                for pid, dept_map in grouped.items():
                    department_leads_by_project[int(pid)] = {
                        int(dept_id): sorted(leads)
                        for dept_id, leads in dept_map.items()
                    }

            for item in items:
                project_id = item.get('project')
                if isinstance(project_id, int):
                    item['departmentLeads'] = department_leads_by_project.get(project_id, {})
                else:
                    item['departmentLeads'] = {}

        combined = items + pre_items
        if include_notes != 'none' or include_project_leads:
            payload = {
                'contractVersion': 1,
                'items': combined,
            }
            if include_notes != 'none':
                payload['notesMode'] = include_notes
            if include_project_leads:
                payload['departmentLeadsByProject'] = department_leads_by_project
            payload = _apply_payload_guardrails(payload)
            return Response(payload)
        return Response(combined)

    @extend_schema(
        parameters=[OpenApiParameter(name='days_ahead', type=int, required=False)],
    )
    @action(detail=False, methods=['get'])
    def personal_pre_deliverables(self, request):
        """Upcoming pre-deliverable items for the authenticated user (default 14 days)."""
        try:
            days = int(request.query_params.get('days_ahead') or 14)
        except Exception:
            days = 14
        from .serializers import PreDeliverableItemSerializer
        from .services import PreDeliverableService
        qs = PreDeliverableService.get_upcoming_for_user(request.user, days_ahead=days)
        ser = PreDeliverableItemSerializer(qs, many=True)
        return Response(ser.data)

    @extend_schema(
        parameters=[OpenApiParameter(name='weeks', type=int, required=False, description='Lookback window in weeks')],
        responses=inline_serializer(name='DeliverableStaffingSummaryItem', fields={
            'linkId': serializers.IntegerField(allow_null=True, required=False),
            'personId': serializers.IntegerField(),
            'personName': serializers.CharField(),
            'roleOnMilestone': serializers.CharField(allow_null=True, required=False),
            'totalHours': serializers.FloatField(),
            'weekBreakdown': serializers.DictField(),
        })
    )
    @action(detail=True, methods=['get'], url_path='staffing_summary', url_name='staffing-summary')
    def staffing_summary(self, request, pk=None):
        """Return derived staffing for a deliverable from Assignment.weekly_hours.

        Default window: 6 weeks prior OR between previous and current deliverable (exclusive→inclusive).
        Optional override: ?weeks=6 to force a fixed lookback window.

        Returns array items per person with >0 hours in window on the deliverable's project:
        { linkId|null, personId, personName, roleOnMilestone|null, totalHours, weekBreakdown }
        """
        try:
            deliverable = Deliverable.objects.select_related('project').get(pk=pk)
        except Deliverable.DoesNotExist:
            return Response({"error": "Deliverable not found"}, status=status.HTTP_404_NOT_FOUND)

        from datetime import timedelta
        end_date = deliverable.date or datetime.utcnow().date()
        weeks_param = request.query_params.get('weeks')

        prev = (
            Deliverable.objects.filter(project_id=deliverable.project_id, date__lt=end_date)
            .order_by('-date')
            .first()
        )
        if weeks_param:
            try:
                lookback_weeks = max(1, int(weeks_param))
            except ValueError:
                lookback_weeks = 6
            start_date = end_date - timedelta(weeks=lookback_weeks)
        else:
            if prev and prev.date:
                start_date = prev.date + timedelta(days=1)
            else:
                start_date = end_date - timedelta(weeks=6)

        # Aggregate assignments for this project within the window
        assignments = (
            Assignment.objects.filter(project_id=deliverable.project_id, is_active=True)
            .select_related('person')
        )

        per_person = {}
        for a in assignments:
            person_id = a.person_id
            person_name = getattr(a.person, 'name', f'Person {person_id}') if getattr(a, 'person', None) else f'Person {person_id}'
            wh = a.weekly_hours or {}
            for key, hours in wh.items():
                try:
                    d = datetime.strptime(key, '%Y-%m-%d').date()
                except ValueError:  # nosec B112
                    continue
                if start_date <= d <= end_date:
                    try:
                        amt = float(hours or 0)
                    except (TypeError, ValueError):
                        amt = 0.0
                    if amt <= 0:
                        continue
                    rec = per_person.setdefault(person_id, {
                        'personId': person_id,
                        'personName': person_name,
                        'totalHours': 0.0,
                        'weekBreakdown': {}
                    })
                    rec['totalHours'] += amt
                    rec['weekBreakdown'][key] = rec['weekBreakdown'].get(key, 0.0) + amt

        # Join with existing links for this deliverable
        links = (
            DeliverableAssignment.objects.filter(deliverable_id=deliverable.id, is_active=True)
            .select_related('person')
        )
        link_map = {link.person_id: link for link in links}

        results = []
        for pid, rec in per_person.items():
            if rec['totalHours'] <= 0:
                continue
            link = link_map.get(pid)
            results.append({
                'linkId': link.id if link else None,
                'personId': pid,
                'personName': getattr(link.person, 'name', rec['personName']) if link else rec['personName'],
                'roleOnMilestone': link.role_on_milestone if link else None,
                'totalHours': round(rec['totalHours'], 1),
                'weekBreakdown': rec['weekBreakdown'],
            })

        # Sort by personName for stable display
        results.sort(key=lambda x: (x['personName'] or '').lower())
        return Response(results)


class DeliverableAssignmentViewSet(ETagConditionalMixin, viewsets.ModelViewSet):
    """CRUD and filter endpoints for deliverable-person weekly hour links."""

    serializer_class = DeliverableAssignmentSerializer
    # Use global default permissions (IsAuthenticated)

    def get_queryset(self):
        return (
            DeliverableAssignment.objects.filter(is_active=True)
            .select_related('deliverable', 'person', 'deliverable__project')
            .order_by('-created_at')
        )

    def list(self, request, *args, **kwargs):
        # Support bulk fetch without pagination for UI convenience
        if request.query_params.get('all') == 'true':
            serializer = self.get_serializer(self.get_queryset(), many=True)
            return Response(serializer.data)
        return super().list(request, *args, **kwargs)

    @extend_schema(
        parameters=[OpenApiParameter(name='deliverable', type=int, required=True)],
        responses=DeliverableAssignmentSerializer(many=True)
    )
    @action(detail=False, methods=['get'])
    def by_deliverable(self, request):
        deliverable_id = request.query_params.get('deliverable')
        if not deliverable_id:
            return Response({"error": "deliverable parameter is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            qs = self.get_queryset().filter(deliverable_id=int(deliverable_id))
        except ValueError:
            return Response({"error": "deliverable must be an integer"}, status=status.HTTP_400_BAD_REQUEST)
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    # Note: Staffing summary is exposed on DeliverableViewSet (detail action)
    # to be accessible at /api/deliverables/{id}/staffing_summary/

    @extend_schema(
        parameters=[OpenApiParameter(name='person', type=int, required=True)],
        responses=DeliverableAssignmentSerializer(many=True)
    )
    @action(detail=False, methods=['get'])
    def by_person(self, request):
        person_id = request.query_params.get('person')
        if not person_id:
            return Response({"error": "person parameter is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            qs = self.get_queryset().filter(person_id=int(person_id))
        except ValueError:
            return Response({"error": "person must be an integer"}, status=status.HTTP_400_BAD_REQUEST)
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)


class PreDeliverableItemViewSet(ETagConditionalMixin, viewsets.ModelViewSet):
    serializer_class = PreDeliverableItemSerializer
    queryset = (
        PreDeliverableItem.objects.select_related('deliverable', 'deliverable__project', 'pre_deliverable_type')
        .order_by('generated_date')
    )

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()
        params = request.query_params
        if 'deliverable' in params:
            try:
                qs = qs.filter(deliverable_id=int(params.get('deliverable')))
            except ValueError:  # nosec B110
                pass
        if 'project' in params:
            try:
                qs = qs.filter(deliverable__project_id=int(params.get('project')))
            except ValueError:  # nosec B110
                pass
        if 'vertical' in params:
            try:
                qs = qs.filter(deliverable__project__vertical_id=int(params.get('vertical')))
            except ValueError:  # nosec B110
                pass
        if 'type_id' in params:
            try:
                qs = qs.filter(pre_deliverable_type_id=int(params.get('type_id')))
            except ValueError:  # nosec B110
                pass
        start = params.get('start')
        if start:
            d = parse_date(start)
            if d:
                qs = qs.filter(generated_date__gte=d)
        end = params.get('end')
        if end:
            d = parse_date(end)
            if d:
                qs = qs.filter(generated_date__lte=d)
        if 'is_completed' in params:
            val = params.get('is_completed') in ('1', 'true', 'True')
            qs = qs.filter(is_completed=val)
        if 'is_active' in params:
            val = params.get('is_active') in ('1', 'true', 'True')
            qs = qs.filter(is_active=val)
        if params.get('mine_only') in ('1', 'true', 'True'):
            from accounts.models import UserProfile
            try:
                prof = UserProfile.objects.select_related('person').get(user=request.user)
                pid = getattr(prof.person, 'id', None)
            except UserProfile.DoesNotExist:
                pid = None
            if pid:
                qs = qs.filter(deliverable__assignments__person_id=pid, deliverable__assignments__is_active=True)
            else:
                qs = qs.none()
        self.queryset = qs
        return super().list(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        data = request.data.copy()
        allowed = {'isCompleted', 'completedDate', 'notes'}
        for k in list(data.keys()):
            if k not in allowed:
                data.pop(k)
        if 'isCompleted' in data:
            data['is_completed'] = data.pop('isCompleted')
        if 'completedDate' in data:
            data['completed_date'] = data.pop('completedDate')
        request._full_data = data  # type: ignore
        return super().partial_update(request, *args, **kwargs)

    @extend_schema(request=None, responses=PreDeliverableItemSerializer)
    @action(detail=True, methods=['post'], url_path='complete')
    def complete(self, request, pk=None):
        obj: PreDeliverableItem = self.get_object()
        obj.mark_completed(request.user)
        return Response(PreDeliverableItemSerializer(obj).data)

    @extend_schema(request=None, responses=PreDeliverableItemSerializer)
    @action(detail=True, methods=['post'], url_path='uncomplete')
    def uncomplete(self, request, pk=None):
        obj: PreDeliverableItem = self.get_object()
        obj.is_completed = False
        obj.completed_date = None
        obj.completed_by = None
        obj.save(update_fields=['is_completed', 'completed_date', 'completed_by', 'updated_at'])
        return Response(PreDeliverableItemSerializer(obj).data)

    @extend_schema(request=inline_serializer(name='BulkCompleteRequest', fields={'ids': serializers.ListField(child=serializers.IntegerField())}),
                   responses=inline_serializer(name='BulkCompleteResponse', fields={'success': serializers.BooleanField(), 'updatedCount': serializers.IntegerField(), 'failed': serializers.ListField(child=serializers.IntegerField())}))
    @action(detail=False, methods=['post'], url_path='bulk_complete')
    def bulk_complete(self, request):
        ids = request.data.get('ids') or []
        ok = 0
        failed = []
        for i in ids:
            try:
                obj = PreDeliverableItem.objects.get(id=i)
                obj.mark_completed(request.user)
                ok += 1
            except Exception:
                failed.append(i)
        return Response({'success': True, 'updatedCount': ok, 'failed': failed})

    @extend_schema(
        request=inline_serializer(
            name='PreItemsBackfillRequest',
            fields={
                'projectId': serializers.IntegerField(required=False),
                'start': serializers.DateField(required=False),
                'end': serializers.DateField(required=False),
                'regenerate': serializers.BooleanField(required=False),
            },
        ),
        responses=inline_serializer(
            name='PreItemsBackfillResponse',
            fields={
                'enqueued': serializers.BooleanField(),
                'jobId': serializers.CharField(required=False),
                'statusUrl': serializers.CharField(required=False),
                'result': serializers.DictField(required=False),
            },
        ),
    )
    @action(detail=False, methods=['post'], url_path='backfill', permission_classes=[permissions.IsAuthenticated, IsAdminOrManager])
    def backfill(self, request):
        """Manager/admin: backfill or regenerate pre-items for a project/date window.

        If ASYNC_JOBS is enabled and Celery task is available, enqueues background job and
        returns 202 with job metadata. Otherwise, runs synchronously and returns a summary.
        """
        params = request.data or {}
        project_id = params.get('projectId')
        start = params.get('start')
        end = params.get('end')
        regenerate = bool(params.get('regenerate'))

        # Async path
        if settings.FEATURES.get('ASYNC_JOBS') and backfill_pre_deliverables_async is not None:
            try:
                task = enqueue_user_facing_task(
                    backfill_pre_deliverables_async,
                    user=request.user,
                    is_admin_only=False,
                    purpose='deliverables_preitems_backfill',
                    args=(project_id, str(start) if start else None, str(end) if end else None, regenerate),
                )
                job_id = task.id
                return Response({
                    'enqueued': True,
                    'jobId': job_id,
                    'statusUrl': request.build_absolute_uri(f"/api/jobs/{job_id}/"),
                }, status=status.HTTP_202_ACCEPTED)
            except JobAccessRegistrationError as exc:
                return Response({'detail': str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
            except Exception:  # nosec B110
                pass

        # Sync path fallback
        from django.utils.dateparse import parse_date
        qs = PreDeliverableItem.objects.none()  # for typing
        from .models import Deliverable as _Deliverable
        dqs = _Deliverable.objects.exclude(date__isnull=True)
        if project_id:
            try:
                dqs = dqs.filter(project_id=int(project_id))
            except Exception:  # nosec B110
                pass
        if start:
            d1 = parse_date(str(start))
            if d1:
                dqs = dqs.filter(date__gte=d1)
        if end:
            d2 = parse_date(str(end))
            if d2:
                dqs = dqs.filter(date__lte=d2)
        total = dqs.count()
        created = 0
        deleted = 0
        preserved = 0
        for d in dqs.iterator():
            if regenerate:
                s = PreDeliverableService.regenerate_pre_deliverables(d)
                created += int(s.created)
                deleted += int(s.deleted)
                preserved += int(s.preserved_completed)
            else:
                created += len(PreDeliverableService.generate_pre_deliverables(d))
        return Response({'enqueued': False, 'result': {'processed': total, 'created': created, 'deleted': deleted, 'preservedCompleted': preserved}})
