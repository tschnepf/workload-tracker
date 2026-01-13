from datetime import datetime, date as _date
from django.utils.dateparse import parse_date
from django.db.models import Count, Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework import serializers
from drf_spectacular.utils import extend_schema, inline_serializer
from deliverables.models import PreDeliverableItem


class PreDeliverableCompletionView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses=inline_serializer(
            name='PreDeliverableCompletionResponse',
            fields={
                'total': serializers.IntegerField(),
                'completed': serializers.IntegerField(),
                'overdue': serializers.IntegerField(),
                'completionRate': serializers.FloatField(),
                'byProject': inline_serializer(
                    name='PreDeliverableCompletionByProject',
                    fields={
                        'projectId': serializers.IntegerField(allow_null=True),
                        'projectName': serializers.CharField(allow_null=True, required=False),
                        'total': serializers.IntegerField(),
                        'completed': serializers.IntegerField(),
                        'overdue': serializers.IntegerField(),
                        'completionRate': serializers.FloatField(),
                    },
                    many=True,
                ),
                'byType': inline_serializer(
                    name='PreDeliverableCompletionByType',
                    fields={
                        'typeId': serializers.IntegerField(allow_null=True),
                        'typeName': serializers.CharField(allow_null=True, required=False),
                        'total': serializers.IntegerField(),
                        'completed': serializers.IntegerField(),
                        'overdue': serializers.IntegerField(),
                        'completionRate': serializers.FloatField(),
                    },
                    many=True,
                ),
            },
        )
    )
    def get(self, request):
        start = request.query_params.get('date_from')
        end = request.query_params.get('date_to')
        project_id = request.query_params.get('project_id')
        type_id = request.query_params.get('type_id')

        qs = PreDeliverableItem.objects.select_related('deliverable', 'pre_deliverable_type', 'deliverable__project')
        if start:
            d = parse_date(start)
            if d:
                qs = qs.filter(generated_date__gte=d)
        if end:
            d = parse_date(end)
            if d:
                qs = qs.filter(generated_date__lte=d)
        if project_id:
            try:
                qs = qs.filter(deliverable__project_id=int(project_id))
            except ValueError:  # nosec B110
                pass
        if type_id:
            try:
                qs = qs.filter(pre_deliverable_type_id=int(type_id))
            except ValueError:  # nosec B110
                pass

        agg = qs.aggregate(
            total=Count('id'),
            completed=Count('id', filter=Q(is_completed=True)),
            overdue=Count('id', filter=Q(is_completed=False, generated_date__lt=_date.today())),
        )
        total = int(agg.get('total') or 0)
        completed = int(agg.get('completed') or 0)
        overdue = int(agg.get('overdue') or 0)

        proj_rows = (
            qs.values('deliverable__project_id', 'deliverable__project__name')
            .annotate(
                total=Count('id'),
                completed=Count('id', filter=Q(is_completed=True)),
                overdue=Count('id', filter=Q(is_completed=False, generated_date__lt=_date.today())),
            )
            .order_by('deliverable__project__name')
        )
        by_project = []
        for r in proj_rows:
            t = int(r['total'] or 0)
            c = int(r['completed'] or 0)
            o = int(r['overdue'] or 0)
            rate = round((c / t * 100.0), 1) if t else 0.0
            by_project.append({
                'projectId': r['deliverable__project_id'],
                'projectName': r['deliverable__project__name'],
                'total': t,
                'completed': c,
                'overdue': o,
                'completionRate': rate,
            })

        type_rows = (
            qs.values('pre_deliverable_type_id', 'pre_deliverable_type__name')
            .annotate(
                total=Count('id'),
                completed=Count('id', filter=Q(is_completed=True)),
                overdue=Count('id', filter=Q(is_completed=False, generated_date__lt=_date.today())),
            )
            .order_by('pre_deliverable_type__name')
        )
        by_type = []
        for r in type_rows:
            t = int(r['total'] or 0)
            c = int(r['completed'] or 0)
            o = int(r['overdue'] or 0)
            rate = round((c / t * 100.0), 1) if t else 0.0
            by_type.append({
                'typeId': r['pre_deliverable_type_id'],
                'typeName': r['pre_deliverable_type__name'],
                'total': t,
                'completed': c,
                'overdue': o,
                'completionRate': rate,
            })

        data = {
            'total': total,
            'completed': completed,
            'overdue': overdue,
            'completionRate': round((completed / total * 100.0), 1) if total else 0.0,
            'byProject': by_project,
            'byType': by_type,
        }
        return Response(data)


class PreDeliverableTeamPerformanceView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    @extend_schema(
        responses=inline_serializer(
            name='PreDeliverableTeamPerformanceResponse',
            fields={
                'people': inline_serializer(
                    name='PreDeliverableTeamPerformancePerson',
                    fields={
                        'personId': serializers.IntegerField(allow_null=True),
                        'personName': serializers.CharField(allow_null=True, required=False),
                        'assignedItems': serializers.IntegerField(),
                        'completedItems': serializers.IntegerField(),
                        'overdueItems': serializers.IntegerField(),
                        'completionRate': serializers.FloatField(),
                    },
                    many=True,
                ),
            },
        )
    )
    def get(self, request):
        start = request.query_params.get('date_from')
        end = request.query_params.get('date_to')
        qs = PreDeliverableItem.objects.select_related('deliverable').all()
        if start:
            d = parse_date(start)
            if d:
                qs = qs.filter(generated_date__gte=d)
        if end:
            d = parse_date(end)
            if d:
                qs = qs.filter(generated_date__lte=d)
        rows = (
            qs.filter(deliverable__assignments__is_active=True)
            .values('deliverable__assignments__person_id', 'deliverable__assignments__person__name')
            .annotate(
                assigned=Count('id'),
                completed=Count('id', filter=Q(is_completed=True)),
                overdue=Count('id', filter=Q(is_completed=False, generated_date__lt=_date.today())),
            )
            .order_by('deliverable__assignments__person__name')
        )
        people = []
        for r in rows:
            a = int(r['assigned'] or 0)
            c = int(r['completed'] or 0)
            o = int(r['overdue'] or 0)
            rate = round((c / a * 100.0), 1) if a else 0.0
            people.append({
                'personId': r['deliverable__assignments__person_id'],
                'personName': r['deliverable__assignments__person__name'],
                'assignedItems': a,
                'completedItems': c,
                'overdueItems': o,
                'completionRate': rate,
            })
        return Response({'people': people})
