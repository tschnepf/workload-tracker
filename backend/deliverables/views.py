"""
Deliverable views - STANDARDS COMPLIANT API endpoints
Follows R2-REBUILD-STANDARDS.md naming conventions
"""

from rest_framework import viewsets, permissions, status
from core.etag import ETagConditionalMixin
from drf_spectacular.utils import extend_schema, OpenApiParameter, inline_serializer
from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import transaction
from django.db.models import Count, Q, Max
from django.utils.dateparse import parse_date
from django.utils.http import http_date
from datetime import datetime
from collections import defaultdict
import logging
from .models import Deliverable, DeliverableAssignment, ReallocationAudit
from .serializers import (
    DeliverableSerializer,
    DeliverableAssignmentSerializer,
    DeliverableCalendarItemSerializer,
    PreDeliverableItemSerializer,
)
from assignments.models import Assignment
from drf_spectacular.utils import extend_schema, OpenApiParameter, inline_serializer
from rest_framework import serializers
from django.conf import settings

from .reallocation import reallocate_weekly_hours
from datetime import timedelta, date as _date
from core.week_utils import sunday_of_week
from .models import PreDeliverableItem
from .services import PreDeliverableService


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

    def partial_update(self, request, *args, **kwargs):
        """PATCH deliverable. If date changes and feature flag enabled, reallocate hours.

        Response includes optional 'reallocation' summary with keys:
        { deltaWeeks, assignmentsChanged, touchedWeekKeys }
        """
        instance: Deliverable = self.get_object()
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
                except Exception:
                    # Non-blocking: failure to persist audit must not fail request
                    pass

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
            except Exception:
                pass

            data = self.get_serializer(instance).data
            data['reallocation'] = realloc_summary
            return Response(data)

        # Default path: just save and return
        instance = serializer.save()
        return Response(self.get_serializer(instance).data)
    
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
        responses=serializers.DictField(child=DeliverableSerializer(many=True)),
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
                    OpenApiParameter(name='end', type=str, required=False, description='YYYY-MM-DD')],
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
        start_date = parse_date(start_str) if start_str else None
        end_date = parse_date(end_str) if end_str else None

        qs = (
            Deliverable.objects.all()
            .select_related('project')
            .annotate(
                assignmentCount=Count(
                    'assignments', filter=Q(assignments__is_active=True)
                )
            )
        )

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
        etag_val = f"W/\"calendar:{start_str or ''}:{end_str or ''}:{(last_updated.isoformat() if last_updated else '')}:{count}\""
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
        ],
    )
    @action(detail=False, methods=['get'])
    def calendar_with_pre_items(self, request):
        start_str = request.query_params.get('start')
        end_str = request.query_params.get('end')
        mine_only = request.query_params.get('mine_only') in ('1', 'true', 'True')
        type_id = request.query_params.get('type_id')
        start_date = parse_date(start_str) if start_str else None
        end_date = parse_date(end_str) if end_str else None

        qs = (
            Deliverable.objects.all()
            .select_related('project')
            .annotate(
                assignmentCount=Count('assignments', filter=Q(assignments__is_active=True))
            )
        )
        if start_date:
            qs = qs.filter(date__gte=start_date)
        if end_date:
            qs = qs.filter(date__lte=end_date)
        if not start_date and not end_date:
            qs = qs.filter(date__isnull=False)

        items = [{
            'itemType': 'deliverable',
            **DeliverableCalendarItemSerializer(d).data
        } for d in qs]

        pre_qs = PreDeliverableItem.objects.select_related('deliverable', 'deliverable__project', 'pre_deliverable_type')
        if start_date:
            pre_qs = pre_qs.filter(generated_date__gte=start_date)
        if end_date:
            pre_qs = pre_qs.filter(generated_date__lte=end_date)
        if type_id:
            try:
                pre_qs = pre_qs.filter(pre_deliverable_type_id=int(type_id))
            except ValueError:
                pass
        if mine_only:
            from accounts.models import UserProfile
            try:
                prof = UserProfile.objects.select_related('person').get(user=request.user)
                pid = getattr(prof.person, 'id', None)
            except UserProfile.DoesNotExist:
                pid = None
            if pid:
                pre_qs = pre_qs.filter(deliverable__assignments__person_id=pid, deliverable__assignments__is_active=True)
            else:
                pre_qs = pre_qs.none()

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

        return Response(items + pre_items)

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
                except ValueError:
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
            except ValueError:
                pass
        if 'project' in params:
            try:
                qs = qs.filter(deliverable__project_id=int(params.get('project')))
            except ValueError:
                pass
        if 'type_id' in params:
            try:
                qs = qs.filter(pre_deliverable_type_id=int(params.get('type_id')))
            except ValueError:
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

