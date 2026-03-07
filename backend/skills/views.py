"""
Skills views - REST API endpoints for skills management
"""

from django.db import transaction
from django.db.models import Q
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import SAFE_METHODS
from rest_framework.response import Response

from accounts.permissions import IsAdminOrManager
from core.departments import get_descendant_department_ids
from core.etag import ETagConditionalMixin
from people.models import Person
from .models import PersonSkill, SkillTag
from .serializers import PersonSkillSerializer, PersonSkillSummarySerializer, SkillTagSerializer


def _parse_bool(raw, default: bool = False) -> bool:
    if raw in (None, ''):
        return default
    return str(raw).strip().lower() in ('1', 'true', 'yes', 'on')


def _coerce_int_list(raw) -> list[int]:
    if raw is None:
        return []
    values = raw
    if isinstance(values, str):
        values = [part.strip() for part in values.split(',')]
    if not isinstance(values, (list, tuple)):
        return []
    result: list[int] = []
    seen: set[int] = set()
    for item in values:
        try:
            value = int(item)
        except Exception:
            continue
        if value <= 0 or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


class SkillTagViewSet(ETagConditionalMixin, viewsets.ModelViewSet):
    """CRUD operations for skill tags"""

    queryset = SkillTag.objects.filter(is_active=True).select_related('department')
    serializer_class = SkillTagSerializer

    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return super().get_permissions()
        return [permission() for permission in (*self.permission_classes, IsAdminOrManager)]

    def get_queryset(self):
        """Filter by scope/search/department if provided."""
        queryset = super().get_queryset()

        search = (self.request.query_params.get('search') or '').strip()
        if search:
            queryset = queryset.filter(Q(name__icontains=search) | Q(category__icontains=search))

        scope = (self.request.query_params.get('scope') or '').strip().lower()
        include_children = _parse_bool(self.request.query_params.get('include_children'))
        include_global = _parse_bool(self.request.query_params.get('include_global'))
        department_param = self.request.query_params.get('department')

        scoped_department_ids: list[int] | None = None
        if department_param not in (None, ''):
            try:
                department_id = int(department_param)
                scoped_department_ids = (
                    get_descendant_department_ids(department_id) if include_children else [department_id]
                )
            except Exception:
                scoped_department_ids = None

        if scope == 'global':
            queryset = queryset.filter(department__isnull=True)
        elif scope == 'department':
            queryset = queryset.filter(department__isnull=False)
            if scoped_department_ids:
                queryset = queryset.filter(department_id__in=scoped_department_ids)
        else:
            if scoped_department_ids:
                q = Q(department_id__in=scoped_department_ids)
                if include_global:
                    q |= Q(department__isnull=True)
                queryset = queryset.filter(q)

        vertical_param = self.request.query_params.get('vertical')
        if scope != 'global' and vertical_param not in (None, ''):
            try:
                vertical_id = int(vertical_param)
                if include_global and scope != 'department':
                    queryset = queryset.filter(
                        Q(department__vertical_id=vertical_id) | Q(department__isnull=True)
                    )
                else:
                    queryset = queryset.filter(department__vertical_id=vertical_id)
            except Exception:
                pass

        return queryset.order_by('name')


class PersonSkillViewSet(ETagConditionalMixin, viewsets.ModelViewSet):
    """CRUD operations for person skills"""

    queryset = PersonSkill.objects.all()
    serializer_class = PersonSkillSerializer

    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return super().get_permissions()
        return [permission() for permission in (*self.permission_classes, IsAdminOrManager)]

    def get_queryset(self):
        """Filter by person, skill type, department, and bulk id filters."""
        queryset = super().get_queryset()
        person_id = self.request.query_params.get('person')
        skill_type = self.request.query_params.get('skill_type')
        search = (self.request.query_params.get('search') or '').strip()

        if person_id:
            queryset = queryset.filter(person_id=person_id)
        person_ids = _coerce_int_list(self.request.query_params.get('person_ids'))
        if person_ids:
            queryset = queryset.filter(person_id__in=person_ids)

        skill_tag_ids = _coerce_int_list(self.request.query_params.get('skill_tag_ids'))
        if skill_tag_ids:
            queryset = queryset.filter(skill_tag_id__in=skill_tag_ids)

        if skill_type:
            queryset = queryset.filter(skill_type=skill_type)

        department_param = self.request.query_params.get('department')
        include_children = _parse_bool(self.request.query_params.get('include_children'))
        if department_param not in (None, ''):
            try:
                department_id = int(department_param)
                department_ids = (
                    get_descendant_department_ids(department_id) if include_children else [department_id]
                )
                queryset = queryset.filter(person__department_id__in=department_ids)
            except Exception:
                pass

        vertical_param = self.request.query_params.get('vertical')
        if vertical_param not in (None, ''):
            try:
                queryset = queryset.filter(person__department__vertical_id=int(vertical_param))
            except Exception:
                pass
        if search:
            queryset = queryset.filter(
                Q(skill_tag__name__icontains=search) | Q(person__name__icontains=search)
            )

        return queryset.select_related('person', 'skill_tag').order_by('skill_type', 'skill_tag__name', 'id')

    @extend_schema(
        request=inline_serializer(
            name='PersonSkillBulkAssignRequest',
            fields={
                'operation': serializers.ChoiceField(choices=['assign', 'unassign']),
                'personIds': serializers.ListField(child=serializers.IntegerField(min_value=1)),
                'skillTagIds': serializers.ListField(child=serializers.IntegerField(min_value=1)),
                'skillType': serializers.ChoiceField(
                    choices=[choice[0] for choice in PersonSkill.SKILL_TYPE_CHOICES],
                    required=False,
                ),
                'proficiencyLevel': serializers.ChoiceField(
                    choices=[choice[0] for choice in PersonSkill.PROFICIENCY_CHOICES],
                    required=False,
                ),
            },
        ),
        responses=inline_serializer(
            name='PersonSkillBulkAssignResponse',
            fields={
                'processedPairs': serializers.IntegerField(),
                'created': serializers.IntegerField(),
                'deleted': serializers.IntegerField(),
                'skippedExisting': serializers.IntegerField(),
                'skippedMissing': serializers.IntegerField(),
                'errors': serializers.ListField(child=serializers.CharField(), required=False),
            },
        ),
    )
    @action(detail=False, methods=['post'], url_path='bulk_assign', permission_classes=[IsAdminOrManager])
    def bulk_assign(self, request):  # type: ignore[override]
        payload = request.data if isinstance(request.data, dict) else {}
        operation = str(payload.get('operation') or '').strip().lower()
        if operation not in ('assign', 'unassign'):
            return Response({'detail': 'operation must be assign or unassign'}, status=status.HTTP_400_BAD_REQUEST)

        person_ids = _coerce_int_list(payload.get('personIds'))
        skill_tag_ids = _coerce_int_list(payload.get('skillTagIds'))
        if not person_ids or not skill_tag_ids:
            return Response(
                {'detail': 'personIds and skillTagIds are required and must contain positive ids'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        skill_type = str(payload.get('skillType') or 'strength').strip().lower()
        valid_skill_types = {choice[0] for choice in PersonSkill.SKILL_TYPE_CHOICES}
        if skill_type not in valid_skill_types:
            return Response({'detail': 'invalid skillType'}, status=status.HTTP_400_BAD_REQUEST)

        proficiency_level = str(payload.get('proficiencyLevel') or 'beginner').strip().lower()
        valid_proficiency = {choice[0] for choice in PersonSkill.PROFICIENCY_CHOICES}
        if proficiency_level not in valid_proficiency:
            return Response({'detail': 'invalid proficiencyLevel'}, status=status.HTTP_400_BAD_REQUEST)

        errors: list[str] = []
        existing_people_ids = set(Person.objects.filter(id__in=person_ids).values_list('id', flat=True))
        existing_skill_ids = set(
            SkillTag.objects.filter(id__in=skill_tag_ids, is_active=True).values_list('id', flat=True)
        )
        missing_people = sorted(set(person_ids) - existing_people_ids)
        missing_skills = sorted(set(skill_tag_ids) - existing_skill_ids)
        if missing_people:
            errors.append(f"Missing people: {', '.join(str(i) for i in missing_people)}")
        if missing_skills:
            errors.append(f"Missing or inactive skills: {', '.join(str(i) for i in missing_skills)}")

        valid_people = sorted(existing_people_ids)
        valid_skills = sorted(existing_skill_ids)
        if not valid_people or not valid_skills:
            return Response(
                {
                    'processedPairs': 0,
                    'created': 0,
                    'deleted': 0,
                    'skippedExisting': 0,
                    'skippedMissing': 0,
                    'errors': errors or ['No valid people/skills provided'],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        pair_count = len(valid_people) * len(valid_skills)
        existing_rows = list(
            PersonSkill.objects.filter(
                person_id__in=valid_people,
                skill_tag_id__in=valid_skills,
                skill_type=skill_type,
            ).only('id', 'person_id', 'skill_tag_id')
        )
        existing_map = {(row.person_id, row.skill_tag_id): row for row in existing_rows}

        created = 0
        deleted = 0
        skipped_existing = 0
        skipped_missing = 0

        if operation == 'assign':
            to_create: list[PersonSkill] = []
            for person_id in valid_people:
                for skill_id in valid_skills:
                    if (person_id, skill_id) in existing_map:
                        continue
                    to_create.append(
                        PersonSkill(
                            person_id=person_id,
                            skill_tag_id=skill_id,
                            skill_type=skill_type,
                            proficiency_level=proficiency_level,
                        )
                    )
            with transaction.atomic():
                PersonSkill.objects.bulk_create(to_create, ignore_conflicts=True)
            created = len(to_create)
            skipped_existing = max(0, pair_count - created)
        else:
            to_delete_ids = [row.id for row in existing_rows]
            with transaction.atomic():
                if to_delete_ids:
                    PersonSkill.objects.filter(id__in=to_delete_ids).delete()
            deleted = len(to_delete_ids)
            skipped_missing = max(0, pair_count - deleted)

        return Response(
            {
                'processedPairs': pair_count,
                'created': created,
                'deleted': deleted,
                'skippedExisting': skipped_existing,
                'skippedMissing': skipped_missing,
                'errors': errors,
            }
        )

    @extend_schema(
        parameters=[
            OpenApiParameter(name='person', type=int, required=True, description='Person id'),
        ],
        responses=inline_serializer(
            name='PersonSkillSummaryGrouped',
            fields={
                'strengths': serializers.ListField(child=PersonSkillSummarySerializer()),
                'development': serializers.ListField(child=PersonSkillSummarySerializer()),
                'learning': serializers.ListField(child=PersonSkillSummarySerializer()),
            },
        ),
    )
    @action(detail=False, methods=['get'])
    def summary(self, request):  # type: ignore[override]
        """Get skill summary for a person."""
        person_id = request.query_params.get('person')
        if not person_id:
            return Response({'error': 'person parameter required'}, status=status.HTTP_400_BAD_REQUEST)

        skills = self.get_queryset().filter(person_id=person_id)
        serializer = PersonSkillSummarySerializer(skills, many=True)

        grouped_skills = {'strengths': [], 'development': [], 'learning': []}
        bucket_map = {'strength': 'strengths', 'development': 'development', 'learning': 'learning'}
        for skill in serializer.data:
            skill_type = skill.get('skillType')
            bucket = bucket_map.get(skill_type)
            if bucket:
                grouped_skills[bucket].append(skill)

        return Response(grouped_skills)
