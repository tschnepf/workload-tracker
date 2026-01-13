from __future__ import annotations

from datetime import date, timedelta
import hashlib
from typing import Dict, List

from django.conf import settings
from django.core.cache import cache
from django.db.models import Max, Q
from django.utils.http import http_date
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema

from accounts.models import UserProfile
from assignments.models import Assignment
from deliverables.models import Deliverable
from deliverables.services import PreDeliverableService
from people.models import Person
from core.week_utils import sunday_of_week

from .serializers import PersonalWorkSerializer


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
            except Exception:
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
            except Exception:
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
            except Exception:
                pass

        return resp
