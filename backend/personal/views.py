from __future__ import annotations

from datetime import date, timedelta
import hashlib
from collections import defaultdict
from typing import Dict, List

from django.conf import settings
from django.core.cache import cache
from django.db.models import Max, Q
from django.utils.http import http_date
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema, OpenApiParameter

from accounts.models import UserProfile
from assignments.models import Assignment
from assignments.lead_utils import (
    is_lead_role_name,
    resolve_assignment_department_id,
    resolve_assignment_role_name,
)
from deliverables.models import Deliverable
from deliverables.services import PreDeliverableService
from people.models import Person
from projects.models import Project
from core.week_utils import sunday_of_week

from .serializers import PersonalWorkSerializer, PersonalLeadProjectGridSerializer


class PersonalWorkView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=PersonalWorkSerializer)
    def get(self, request):
        # Resolve person for authenticated user
        try:
            prof = UserProfile.objects.select_related('person').get(user=request.user)
            person: Person | None = prof.person
        except UserProfile.DoesNotExist:
            person = None
        if not person:
            return Response({"detail": "No linked Person for authenticated user"}, status=404)

        # Short TTL cache (optional)
        use_cache = bool(settings.FEATURES.get('SHORT_TTL_AGGREGATES'))
        cache_key = f"personal_dash_v1:{person.id}"
        if use_cache:
            try:
                cached = cache.get(cache_key)
                inm = request.META.get('HTTP_IF_NONE_MATCH')
                if cached is not None and inm and inm.strip('"') == cached.get('etag'):
                    resp = Response(status=304)
                    resp['ETag'] = '"' + str(cached.get('etag')) + '"'
                    if cached.get('last_modified'):
                        resp['Last-Modified'] = http_date(cached['last_modified'])
                    return resp
                if cached is not None:
                    resp = Response(cached['data'])
                    resp['ETag'] = '"' + str(cached.get('etag')) + '"'
                    if cached.get('last_modified'):
                        resp['Last-Modified'] = http_date(cached['last_modified'])
                    return resp
            except Exception:  # nosec B110
                pass

        today = date.today()
        current_sunday = sunday_of_week(today)
        week_keys: List[str] = [(current_sunday + timedelta(weeks=w)).isoformat() for w in range(8)]

        # Assignments for this person
        assignments = list(
            Assignment.objects.filter(person_id=person.id, is_active=True).select_related('project')
        )

        weekly_capacity = int(getattr(person, 'weekly_capacity', 36) or 36)
        week_totals: Dict[str, float] = {wk: 0.0 for wk in week_keys}
        total_allocated_current = 0.0
        for a in assignments:
            wh = a.weekly_hours or {}
            for wk in week_keys:
                try:
                    v = float(wh.get(wk) or 0)
                except Exception:
                    v = 0.0
                week_totals[wk] += v
            try:
                total_allocated_current += float(wh.get(week_keys[0]) or 0)
            except Exception:  # nosec B110
                pass

        utilization_percent = round((total_allocated_current / weekly_capacity * 100) if weekly_capacity else 0.0, 1)
        available_hours = max(0.0, weekly_capacity - total_allocated_current)

        # Projects from assignments
        seen_proj = set()
        projects = []
        for a in assignments:
            p = a.project
            if not p or p.id in seen_proj:
                continue
            seen_proj.add(p.id)
            next_deliv = (
                Deliverable.objects.filter(project_id=p.id, date__gte=today).order_by('date').first()
            )
            projects.append({
                'id': p.id,
                'name': getattr(p, 'name', None),
                'client': getattr(p, 'client', None),
                'status': getattr(p, 'status', None),
                'nextDeliverableDate': getattr(next_deliv, 'date', None)
            })

        # Deliverables list (upcoming only, next few across projects)
        deliverables = list(
            Deliverable.objects
            .filter(
                project_id__in=list(seen_proj),
                is_completed=False,
                date__gte=today,
            )
            .select_related('project')
            .order_by('date')[:20]
        )
        deliv_items = [
            {
                'id': d.id,
                'project': d.project_id,
                'projectName': getattr(d.project, 'name', None) if getattr(d, 'project', None) else None,
                'title': d.description or (f"{d.percentage}%" if d.percentage is not None else 'Milestone'),
                'date': d.date,
                'isCompleted': bool(d.is_completed),
            }
            for d in deliverables
        ]

        # Pre-items via service (two weeks by default)
        pre_items_qs = PreDeliverableService.get_upcoming_for_user(request.user, days_ahead=14)
        from deliverables.serializers import PreDeliverableItemSerializer
        pre_items_data = PreDeliverableItemSerializer(pre_items_qs, many=True).data
        overdue_count = 0
        for it in pre_items_qs:
            if getattr(it, 'is_overdue', False):
                overdue_count += 1

        data = {
            'summary': {
                'personId': person.id,
                'currentWeekKey': week_keys[0],
                'utilizationPercent': float(utilization_percent),
                'allocatedHours': float(total_allocated_current),
                'availableHours': float(available_hours),
            },
            'alerts': {
                'overallocatedNextWeek': (week_totals.get(week_keys[1], 0.0) or 0.0) > weekly_capacity,
                'underutilizedNext4Weeks': (sum(week_totals.get(wk, 0.0) for wk in week_keys[:4]) / (4 or 1)) < (weekly_capacity * 0.7),
                'overduePreItems': overdue_count,
            },
            'projects': projects,
            'deliverables': deliv_items,
            'preItems': pre_items_data,
            'schedule': {
                'weekKeys': week_keys,
                'weekTotals': {k: float(v) for k, v in week_totals.items()},
                'weeklyCapacity': weekly_capacity,
            },
        }

        # ETag / Last-Modified
        asn_lm = Assignment.objects.filter(person_id=person.id).aggregate(Max('updated_at')).get('updated_at__max')
        del_lm = Deliverable.objects.filter(project_id__in=list(seen_proj)).aggregate(Max('updated_at')).get('updated_at__max')
        try:
            from deliverables.models import PreDeliverableItem
            pre_lm = PreDeliverableItem.objects.filter(
                deliverable__assignments__person_id=person.id, deliverable__assignments__is_active=True
            ).aggregate(Max('updated_at')).get('updated_at__max')
        except Exception:
            pre_lm = None
        last_modified_dt = max([d for d in [asn_lm, del_lm, pre_lm] if d is not None], default=None)
        counts_sig = f"{len(assignments)}-{len(deliv_items)}-{len(pre_items_data)}"
        lm_str = last_modified_dt.isoformat() if last_modified_dt else 'none'
        etag_raw = f"personal:{person.id}:{counts_sig}:{lm_str}"
        etag = hashlib.sha256(etag_raw.encode()).hexdigest()

        inm = request.META.get('HTTP_IF_NONE_MATCH')
        if inm and inm.strip('"') == etag:
            resp = Response(status=304)
            resp['ETag'] = f'"{etag}"'
            if last_modified_dt:
                resp['Last-Modified'] = http_date(last_modified_dt.timestamp())
            return resp

        resp = Response(PersonalWorkSerializer(data).data)
        resp['ETag'] = f'"{etag}"'
        if last_modified_dt:
            resp['Last-Modified'] = http_date(last_modified_dt.timestamp())

        if use_cache:
            try:
                ttl = int(getattr(settings, 'AGGREGATE_CACHE_TTL', 30))
                cache.set(cache_key, {
                    'etag': etag,
                    'last_modified': int(last_modified_dt.timestamp()) if last_modified_dt else None,
                    'data': resp.data,
                }, timeout=ttl)
            except Exception:  # nosec B110
                pass

        return resp


class PersonalLeadProjectGridView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses=PersonalLeadProjectGridSerializer,
        parameters=[
            OpenApiParameter(
                name='weeks',
                required=False,
                type=int,
                description='Weeks horizon (default 12, clamp 1..52)',
            ),
        ],
    )
    def get(self, request):
        # Resolve person for authenticated user
        try:
            prof = UserProfile.objects.select_related('person').get(user=request.user)
            person: Person | None = prof.person
        except UserProfile.DoesNotExist:
            person = None
        if not person:
            return Response({"detail": "No linked Person for authenticated user"}, status=404)

        try:
            weeks = int(request.query_params.get('weeks', 12))
        except Exception:
            weeks = 12
        weeks = max(1, min(52, weeks))

        today = date.today()
        current_sunday = sunday_of_week(today)
        week_keys: List[str] = [(current_sunday + timedelta(weeks=w)).isoformat() for w in range(weeks)]

        lead_assignments = list(
            Assignment.objects.filter(
                person_id=person.id,
                is_active=True,
                project_id__isnull=False,
            )
            .select_related('person', 'department', 'role_on_project_ref', 'project')
        )

        scoped_departments_by_project: dict[int, set[int]] = defaultdict(set)
        lead_roles_by_project: dict[int, set[str]] = defaultdict(set)
        for assignment in lead_assignments:
            role_name = resolve_assignment_role_name(assignment)
            if not is_lead_role_name(role_name):
                continue
            dept_id = resolve_assignment_department_id(assignment)
            if dept_id is None or assignment.project_id is None:
                continue
            scoped_departments_by_project[int(assignment.project_id)].add(int(dept_id))
            if role_name:
                lead_roles_by_project[int(assignment.project_id)].add(role_name)

        if not scoped_departments_by_project:
            return Response({
                'weekKeys': week_keys,
                'projects': [],
                'assignmentsByProject': {},
            })

        project_ids = sorted(scoped_departments_by_project.keys())

        scoped_assignments = list(
            Assignment.objects.filter(
                is_active=True,
                project_id__in=project_ids,
            )
            .filter(Q(person__is_active=True) | Q(person__isnull=True))
            .select_related('project', 'person', 'department', 'role_on_project_ref')
        )

        assignments_by_project: dict[str, list[dict]] = defaultdict(list)
        for assignment in scoped_assignments:
            project_id = getattr(assignment, 'project_id', None)
            if project_id is None:
                continue
            scoped_depts = scoped_departments_by_project.get(int(project_id)) or set()
            dept_id = resolve_assignment_department_id(assignment)
            if dept_id is None or dept_id not in scoped_depts:
                continue

            weekly_hours = assignment.weekly_hours or {}
            compact_hours: dict[str, float] = {}
            for wk in week_keys:
                try:
                    val = float(weekly_hours.get(wk) or 0.0)
                except Exception:
                    val = 0.0
                if val:
                    compact_hours[wk] = round(val, 2)

            assignments_by_project[str(project_id)].append({
                'id': int(assignment.id),
                'project': int(project_id),
                'person': int(assignment.person_id) if assignment.person_id else None,
                'personName': getattr(getattr(assignment, 'person', None), 'name', None),
                'personDepartmentId': int(dept_id) if dept_id is not None else None,
                'roleOnProjectId': int(assignment.role_on_project_ref_id) if assignment.role_on_project_ref_id else None,
                'roleName': resolve_assignment_role_name(assignment),
                'weeklyHours': compact_hours,
            })

        for rows in assignments_by_project.values():
            rows.sort(
                key=lambda row: (
                    1 if row.get('person') is None else 0,
                    (row.get('personName') or '').lower(),
                    (row.get('roleName') or '').lower(),
                    int(row.get('id') or 0),
                )
            )

        projects_qs = Project.objects.filter(id__in=project_ids).values('id', 'name', 'client', 'status')
        project_rows = list(projects_qs)
        project_rows.sort(
            key=lambda row: (
                1 if not row.get('client') else 0,
                (row.get('client') or '').lower(),
                (row.get('name') or '').lower(),
                int(row.get('id') or 0),
            )
        )

        projects_payload: list[dict] = []
        for row in project_rows:
            pid = int(row['id'])
            projects_payload.append({
                'id': pid,
                'name': row.get('name'),
                'client': row.get('client'),
                'status': row.get('status'),
                'leadRoleNames': sorted(lead_roles_by_project.get(pid) or []),
                'scopedDepartmentIds': sorted(scoped_departments_by_project.get(pid) or []),
            })
            assignments_by_project.setdefault(str(pid), [])

        payload = {
            'weekKeys': week_keys,
            'projects': projects_payload,
            'assignmentsByProject': assignments_by_project,
        }
        return Response(payload)
