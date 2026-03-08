from __future__ import annotations

import calendar
from datetime import date

from django.db.models import Count, Sum, Min, Max, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrManager
from assignments.models import AssignmentMembershipEvent, WeeklyAssignmentSnapshot
from departments.models import Department
from people.models import Person
from projects.models import ProjectRole
from reports.models import PersonReportCheckin, PersonReportCheckinGoalSnapshot, PersonReportGoal
from skills.models import PersonSkill, SkillTag


MIN_MONTHS = 1
MAX_MONTHS = 24
DEFAULT_MONTHS = 6


def _parse_int(raw, default: int | None = None) -> int | None:
    try:
        if raw in (None, ''):
            return default
        return int(raw)
    except Exception:
        return default


def _parse_bool(raw, default: bool = False) -> bool:
    if raw in (None, ''):
        return default
    return str(raw).strip().lower() in {'1', 'true', 'yes', 'on'}


def _clamp_months(raw) -> int:
    value = _parse_int(raw, DEFAULT_MONTHS) or DEFAULT_MONTHS
    return max(MIN_MONTHS, min(MAX_MONTHS, value))


def _subtract_months(d: date, months: int) -> date:
    total = (d.year * 12 + (d.month - 1)) - max(1, months)
    y, m = divmod(total, 12)
    m += 1
    day = min(d.day, calendar.monthrange(y, m)[1])
    return date(y, m, day)


def _fmt_date(d: date | None) -> str | None:
    return d.isoformat() if d else None


def _serialize_goal(goal: PersonReportGoal) -> dict:
    return {
        'id': goal.id,
        'personId': goal.person_id,
        'title': goal.title,
        'description': goal.description or '',
        'goalType': goal.goal_type,
        'skillTagId': goal.skill_tag_id,
        'skillTagName': getattr(getattr(goal, 'skill_tag', None), 'name', None),
        'linkedPersonSkillId': goal.linked_person_skill_id,
        'status': goal.status,
        'targetDate': _fmt_date(goal.target_date),
        'closedAt': goal.closed_at.isoformat() if goal.closed_at else None,
        'createdAt': goal.created_at.isoformat() if goal.created_at else None,
        'updatedAt': goal.updated_at.isoformat() if goal.updated_at else None,
    }


def _serialize_snapshot(snapshot: PersonReportCheckinGoalSnapshot) -> dict:
    return {
        'id': snapshot.id,
        'goalId': snapshot.goal_id,
        'titleSnapshot': snapshot.title_snapshot,
        'goalTypeSnapshot': snapshot.goal_type_snapshot,
        'skillTagSnapshot': snapshot.skill_tag_snapshot,
        'outcome': snapshot.outcome,
        'notes': snapshot.notes,
        'createdAt': snapshot.created_at.isoformat() if snapshot.created_at else None,
    }


def _serialize_checkin(checkin: PersonReportCheckin) -> dict:
    snapshots = [
        _serialize_snapshot(item)
        for item in list(checkin.goal_snapshots.all())
    ]
    return {
        'id': checkin.id,
        'personId': checkin.person_id,
        'periodStart': _fmt_date(checkin.period_start),
        'periodEnd': _fmt_date(checkin.period_end),
        'checkinDate': _fmt_date(checkin.checkin_date),
        'summary': checkin.summary or '',
        'createdById': checkin.created_by_id,
        'createdAt': checkin.created_at.isoformat() if checkin.created_at else None,
        'updatedAt': checkin.updated_at.isoformat() if checkin.updated_at else None,
        'goalSnapshots': snapshots,
    }


class PersonReportBootstrapView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrManager]

    @extend_schema(
        parameters=[
            OpenApiParameter(name='vertical', type=int, required=False),
            OpenApiParameter(name='include_inactive', type=bool, required=False),
        ]
    )
    def get(self, request):
        vertical = _parse_int(request.query_params.get('vertical'))
        include_inactive = _parse_bool(request.query_params.get('include_inactive'), False)

        departments_qs = Department.objects.order_by('name')
        if not include_inactive:
            departments_qs = departments_qs.filter(is_active=True)
        if vertical is not None:
            departments_qs = departments_qs.filter(vertical_id=vertical)
        departments = list(departments_qs)
        dept_ids = [d.id for d in departments if d.id is not None]

        person_counts = {}
        if dept_ids:
            people_qs = Person.objects.filter(department_id__in=dept_ids)
            if not include_inactive:
                people_qs = people_qs.filter(is_active=True)
            for row in people_qs.values('department_id').annotate(count=Count('id')):
                person_counts[int(row['department_id'])] = int(row['count'])

        # Skill tags are provided so users can create skill-linked goals inline.
        skill_tags_qs = SkillTag.objects.filter(is_active=True).order_by('name')
        if vertical is not None:
            skill_tags_qs = skill_tags_qs.filter(
                Q(department__vertical_id=vertical) | Q(department__isnull=True)
            )

        payload = {
            'defaults': {
                'monthsDefault': DEFAULT_MONTHS,
                'monthsMin': MIN_MONTHS,
                'monthsMax': MAX_MONTHS,
                'includeInactiveDefault': False,
                'checkinPeriodMonthsDefault': DEFAULT_MONTHS,
            },
            'departments': [
                {
                    'id': d.id,
                    'name': d.name,
                    'peopleCount': person_counts.get(int(d.id), 0) if d.id is not None else 0,
                }
                for d in departments
            ],
            'skillTags': [
                {
                    'id': tag.id,
                    'name': tag.name,
                    'departmentId': tag.department_id,
                }
                for tag in skill_tags_qs[:3000]
            ],
        }
        return Response(payload)


class PersonReportPeopleView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrManager]

    @extend_schema(
        parameters=[
            OpenApiParameter(name='department', type=int, required=True),
            OpenApiParameter(name='search', type=str, required=False),
            OpenApiParameter(name='include_inactive', type=bool, required=False),
            OpenApiParameter(name='limit', type=int, required=False),
        ]
    )
    def get(self, request):
        department_id = _parse_int(request.query_params.get('department'))
        if not department_id:
            return Response({'detail': 'department is required'}, status=status.HTTP_400_BAD_REQUEST)

        include_inactive = _parse_bool(request.query_params.get('include_inactive'), False)
        search = (request.query_params.get('search') or '').strip()
        limit = max(1, min(500, _parse_int(request.query_params.get('limit'), 250) or 250))

        qs = Person.objects.filter(department_id=department_id).select_related('role').order_by('name')
        if not include_inactive:
            qs = qs.filter(is_active=True)
        if search:
            for token in [tok for tok in search.split() if tok.strip()]:
                qs = qs.filter(name__icontains=token)

        people = [
            {
                'id': p.id,
                'name': p.name,
                'departmentId': p.department_id,
                'isActive': bool(p.is_active),
                'roleName': getattr(getattr(p, 'role', None), 'name', None),
            }
            for p in qs[:limit]
        ]
        return Response({'people': people, 'count': len(people)})


class PersonReportProfileView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrManager]

    @extend_schema(
        parameters=[
            OpenApiParameter(name='person', type=int, required=True),
            OpenApiParameter(name='months', type=int, required=False),
        ]
    )
    def get(self, request):
        person_id = _parse_int(request.query_params.get('person'))
        if not person_id:
            return Response({'detail': 'person is required'}, status=status.HTTP_400_BAD_REQUEST)

        months = _clamp_months(request.query_params.get('months'))
        today = date.today()
        start = _subtract_months(today, months)

        person = get_object_or_404(Person.objects.select_related('department', 'role'), id=person_id)

        snapshots_qs = WeeklyAssignmentSnapshot.objects.filter(
            person_id=person_id,
            week_start__gte=start,
            week_start__lte=today,
        )

        summary_aggr = snapshots_qs.aggregate(
            totalHours=Sum('hours'),
            activeWeeks=Count('week_start', distinct=True),
            projectsWorked=Count('project_id', distinct=True),
        )
        total_hours = float(summary_aggr.get('totalHours') or 0.0)
        active_weeks = int(summary_aggr.get('activeWeeks') or 0)
        projects_worked = int(summary_aggr.get('projectsWorked') or 0)

        projects_rows = snapshots_qs.values(
            'project_id',
            'project_name',
            'client',
            'project__start_date',
            'project__end_date',
        ).annotate(
            totalHours=Sum('hours'),
            activeWeeks=Count('week_start', distinct=True),
            firstWeek=Min('week_start'),
            lastWeek=Max('week_start'),
        ).order_by('-totalHours', 'project_name')

        projects = []
        for row in projects_rows:
            p_hours = float(row.get('totalHours') or 0.0)
            p_weeks = int(row.get('activeWeeks') or 0)
            projects.append(
                {
                    'projectId': row.get('project_id'),
                    'projectName': row.get('project_name') or 'Unknown Project',
                    'client': row.get('client') or 'Unknown',
                    'totalHours': round(p_hours, 2),
                    'activeWeeks': p_weeks,
                    'avgWeeklyHours': round((p_hours / p_weeks), 2) if p_weeks > 0 else 0.0,
                    'startDate': _fmt_date(row.get('project__start_date')),
                    'endDate': _fmt_date(row.get('project__end_date')),
                    'firstWeek': _fmt_date(row.get('firstWeek')),
                    'lastWeek': _fmt_date(row.get('lastWeek')),
                }
            )

        top_clients_rows = snapshots_qs.values('client').annotate(
            totalHours=Sum('hours'),
            projectCount=Count('project_id', distinct=True),
            activeWeeks=Count('week_start', distinct=True),
        ).order_by('-totalHours', 'client')[:10]
        top_clients = [
            {
                'client': row.get('client') or 'Unknown',
                'totalHours': round(float(row.get('totalHours') or 0.0), 2),
                'projectCount': int(row.get('projectCount') or 0),
                'activeWeeks': int(row.get('activeWeeks') or 0),
            }
            for row in top_clients_rows
        ]

        role_rows = snapshots_qs.values('role_on_project_id').annotate(
            totalHours=Sum('hours'),
            activeWeeks=Count('week_start', distinct=True),
        ).order_by('-totalHours')
        role_ids = [int(item['role_on_project_id']) for item in role_rows if item.get('role_on_project_id') is not None]
        role_name_map = {
            int(pr['id']): pr.get('name') or f"Role {pr['id']}"
            for pr in ProjectRole.objects.filter(id__in=role_ids).values('id', 'name')
        }
        role_mix = [
            {
                'roleId': row.get('role_on_project_id'),
                'roleName': role_name_map.get(int(row['role_on_project_id']), None)
                if row.get('role_on_project_id') is not None
                else None,
                'totalHours': round(float(row.get('totalHours') or 0.0), 2),
                'activeWeeks': int(row.get('activeWeeks') or 0),
            }
            for row in role_rows
        ]

        events_count = AssignmentMembershipEvent.objects.filter(
            person_id=person_id,
            week_start__gte=start,
            week_start__lte=today,
        ).count()

        skills_qs = PersonSkill.objects.filter(person_id=person_id).select_related('skill_tag').order_by('skill_type', 'skill_tag__name')
        strengths = []
        in_progress = []
        goals = []
        for row in skills_qs:
            item = {
                'personSkillId': row.id,
                'skillTagId': row.skill_tag_id,
                'skillTagName': getattr(getattr(row, 'skill_tag', None), 'name', ''),
                'skillType': row.skill_type,
                'proficiencyLevel': row.proficiency_level,
                'updatedAt': row.updated_at.isoformat() if row.updated_at else None,
            }
            if row.skill_type == 'strength':
                strengths.append(item)
            elif row.skill_type == 'in_progress':
                in_progress.append(item)
            elif row.skill_type == 'goals':
                goals.append(item)

        developed_rows = skills_qs.filter(updated_at__date__gte=start, updated_at__date__lte=today)
        skills_developed = [
            {
                'personSkillId': row.id,
                'skillTagId': row.skill_tag_id,
                'skillTagName': getattr(getattr(row, 'skill_tag', None), 'name', ''),
                'skillType': row.skill_type,
                'proficiencyLevel': row.proficiency_level,
                'updatedAt': row.updated_at.isoformat() if row.updated_at else None,
            }
            for row in developed_rows
        ]

        payload = {
            'window': {
                'start': _fmt_date(start),
                'end': _fmt_date(today),
                'months': months,
            },
            'person': {
                'id': person.id,
                'name': person.name,
                'departmentId': person.department_id,
                'departmentName': getattr(getattr(person, 'department', None), 'name', None),
                'roleName': getattr(getattr(person, 'role', None), 'name', None),
                'isActive': bool(person.is_active),
            },
            'summary': {
                'projectsWorked': projects_worked,
                'totalHours': round(total_hours, 2),
                'activeWeeks': active_weeks,
                'avgWeeklyHours': round((total_hours / active_weeks), 2) if active_weeks > 0 else 0.0,
                'eventsCount': int(events_count),
            },
            'topClients': top_clients,
            'roleMix': role_mix,
            'projects': projects,
            'skills': {
                'strengths': strengths,
                'inProgress': in_progress,
                'goals': goals,
                'developedInWindow': skills_developed,
            },
        }
        return Response(payload)


class PersonReportGoalsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrManager]

    @extend_schema(
        parameters=[
            OpenApiParameter(name='person', type=int, required=True),
            OpenApiParameter(name='status', type=str, required=False),
        ]
    )
    def get(self, request):
        person_id = _parse_int(request.query_params.get('person'))
        if not person_id:
            return Response({'detail': 'person is required'}, status=status.HTTP_400_BAD_REQUEST)

        status_filter = (request.query_params.get('status') or '').strip()
        qs = PersonReportGoal.objects.filter(person_id=person_id).select_related('skill_tag').order_by('-updated_at', '-id')
        if status_filter:
            qs = qs.filter(status=status_filter)

        return Response({'goals': [_serialize_goal(goal) for goal in qs]})

    @extend_schema(request=serializers.DictField())
    def post(self, request):
        data = request.data if isinstance(request.data, dict) else {}

        person_id = _parse_int(data.get('personId'))
        if not person_id:
            return Response({'detail': 'personId is required'}, status=status.HTTP_400_BAD_REQUEST)
        person = get_object_or_404(Person, id=person_id)

        goal_type = str(data.get('goalType') or PersonReportGoal.GoalType.FREEFORM).strip().lower()
        if goal_type not in {PersonReportGoal.GoalType.SKILL, PersonReportGoal.GoalType.FREEFORM}:
            return Response({'detail': 'invalid goalType'}, status=status.HTTP_400_BAD_REQUEST)

        status_value = str(data.get('status') or PersonReportGoal.GoalStatus.ACTIVE).strip().lower()
        allowed_statuses = {choice[0] for choice in PersonReportGoal.GoalStatus.choices}
        if status_value not in allowed_statuses:
            return Response({'detail': 'invalid status'}, status=status.HTTP_400_BAD_REQUEST)

        target_date = None
        if data.get('targetDate'):
            try:
                target_date = date.fromisoformat(str(data.get('targetDate')))
            except Exception:
                return Response({'detail': 'targetDate must be YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)

        description = (str(data.get('description') or '')).strip()
        user = request.user if getattr(request, 'user', None) and request.user.is_authenticated else None

        if goal_type == PersonReportGoal.GoalType.SKILL:
            skill_tag_id = _parse_int(data.get('skillTagId'))
            if not skill_tag_id:
                return Response({'detail': 'skillTagId is required for skill goals'}, status=status.HTTP_400_BAD_REQUEST)
            skill_tag = get_object_or_404(SkillTag, id=skill_tag_id)
            person_skill, _ = PersonSkill.objects.get_or_create(
                person_id=person.id,
                skill_tag_id=skill_tag.id,
                skill_type='goals',
                defaults={
                    'proficiency_level': 'intermediate',
                    'notes': '',
                },
            )

            goal, _ = PersonReportGoal.objects.get_or_create(
                linked_person_skill_id=person_skill.id,
                defaults={
                    'person_id': person.id,
                    'title': skill_tag.name,
                    'description': description,
                    'goal_type': PersonReportGoal.GoalType.SKILL,
                    'skill_tag_id': skill_tag.id,
                    'status': status_value,
                    'target_date': target_date,
                    'created_by_id': getattr(user, 'id', None),
                    'updated_by_id': getattr(user, 'id', None),
                },
            )

            goal.person = person
            goal.title = (str(data.get('title') or '')).strip() or skill_tag.name
            goal.description = description
            goal.goal_type = PersonReportGoal.GoalType.SKILL
            goal.skill_tag = skill_tag
            goal.status = status_value
            goal.target_date = target_date
            goal.updated_by = user
            if status_value in {
                PersonReportGoal.GoalStatus.ACHIEVED,
                PersonReportGoal.GoalStatus.NOT_ACHIEVED,
                PersonReportGoal.GoalStatus.CANCELLED,
            }:
                goal.closed_at = timezone.now()
            else:
                goal.closed_at = None
            goal.save()
            return Response({'goal': _serialize_goal(goal)}, status=status.HTTP_201_CREATED)

        title = (str(data.get('title') or '')).strip()
        if not title:
            return Response({'detail': 'title is required for freeform goals'}, status=status.HTTP_400_BAD_REQUEST)

        goal = PersonReportGoal.objects.create(
            person=person,
            title=title,
            description=description,
            goal_type=PersonReportGoal.GoalType.FREEFORM,
            status=status_value,
            target_date=target_date,
            created_by=user,
            updated_by=user,
            closed_at=(
                timezone.now()
                if status_value
                in {
                    PersonReportGoal.GoalStatus.ACHIEVED,
                    PersonReportGoal.GoalStatus.NOT_ACHIEVED,
                    PersonReportGoal.GoalStatus.CANCELLED,
                }
                else None
            ),
        )
        return Response({'goal': _serialize_goal(goal)}, status=status.HTTP_201_CREATED)


class PersonReportGoalDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrManager]

    @extend_schema(request=serializers.DictField())
    def patch(self, request, goal_id: int):
        goal = get_object_or_404(PersonReportGoal.objects.select_related('linked_person_skill', 'skill_tag'), id=goal_id)
        data = request.data if isinstance(request.data, dict) else {}
        user = request.user if getattr(request, 'user', None) and request.user.is_authenticated else None

        if goal.goal_type == PersonReportGoal.GoalType.SKILL:
            person_skill = goal.linked_person_skill
            if person_skill is None:
                # Ensure skill goals always retain write-through behavior.
                skill_tag_id_existing = goal.skill_tag_id
                if not skill_tag_id_existing:
                    return Response({'detail': 'Skill goal missing skillTag; cannot patch'}, status=status.HTTP_400_BAD_REQUEST)
                person_skill, _ = PersonSkill.objects.get_or_create(
                    person_id=goal.person_id,
                    skill_tag_id=skill_tag_id_existing,
                    skill_type='goals',
                    defaults={'proficiency_level': 'intermediate', 'notes': ''},
                )
                goal.linked_person_skill = person_skill

            new_skill_tag_id = _parse_int(data.get('skillTagId'))
            if new_skill_tag_id:
                skill_tag = get_object_or_404(SkillTag, id=new_skill_tag_id)
                person_skill.skill_tag = skill_tag
                person_skill.skill_type = 'goals'
                person_skill.save(update_fields=['skill_tag', 'skill_type', 'updated_at'])
                goal.skill_tag = skill_tag

        if 'title' in data:
            title = str(data.get('title') or '').strip()
            if title:
                goal.title = title

        if 'description' in data:
            goal.description = str(data.get('description') or '').strip()

        if 'targetDate' in data:
            raw_target = data.get('targetDate')
            if raw_target in (None, ''):
                goal.target_date = None
            else:
                try:
                    goal.target_date = date.fromisoformat(str(raw_target))
                except Exception:
                    return Response({'detail': 'targetDate must be YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)

        if 'status' in data:
            status_value = str(data.get('status') or '').strip().lower()
            allowed_statuses = {choice[0] for choice in PersonReportGoal.GoalStatus.choices}
            if status_value not in allowed_statuses:
                return Response({'detail': 'invalid status'}, status=status.HTTP_400_BAD_REQUEST)
            goal.status = status_value
            if status_value in {
                PersonReportGoal.GoalStatus.ACHIEVED,
                PersonReportGoal.GoalStatus.NOT_ACHIEVED,
                PersonReportGoal.GoalStatus.CANCELLED,
            }:
                goal.closed_at = timezone.now()
            else:
                goal.closed_at = None

        goal.updated_by = user
        goal.save()
        return Response({'goal': _serialize_goal(goal)})


class PersonReportCheckinsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrManager]

    @extend_schema(
        parameters=[
            OpenApiParameter(name='person', type=int, required=True),
        ]
    )
    def get(self, request):
        person_id = _parse_int(request.query_params.get('person'))
        if not person_id:
            return Response({'detail': 'person is required'}, status=status.HTTP_400_BAD_REQUEST)

        checkins = PersonReportCheckin.objects.filter(person_id=person_id).prefetch_related('goal_snapshots').order_by('-checkin_date', '-id')
        return Response({'checkins': [_serialize_checkin(item) for item in checkins]})

    @extend_schema(request=serializers.DictField())
    def post(self, request):
        data = request.data if isinstance(request.data, dict) else {}

        person_id = _parse_int(data.get('personId'))
        if not person_id:
            return Response({'detail': 'personId is required'}, status=status.HTTP_400_BAD_REQUEST)
        person = get_object_or_404(Person, id=person_id)

        try:
            period_start = date.fromisoformat(str(data.get('periodStart')))
            period_end = date.fromisoformat(str(data.get('periodEnd')))
        except Exception:
            return Response({'detail': 'periodStart and periodEnd are required and must be YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)

        if period_start > period_end:
            return Response({'detail': 'periodStart must be <= periodEnd'}, status=status.HTTP_400_BAD_REQUEST)

        checkin_date_raw = data.get('checkinDate')
        if checkin_date_raw:
            try:
                checkin_date = date.fromisoformat(str(checkin_date_raw))
            except Exception:
                return Response({'detail': 'checkinDate must be YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            checkin_date = date.today()

        summary = str(data.get('summary') or '').strip()
        user = request.user if getattr(request, 'user', None) and request.user.is_authenticated else None

        checkin = PersonReportCheckin.objects.create(
            person=person,
            period_start=period_start,
            period_end=period_end,
            checkin_date=checkin_date,
            summary=summary,
            created_by=user,
        )

        active_goals = list(
            PersonReportGoal.objects.filter(
                person_id=person_id,
                status=PersonReportGoal.GoalStatus.ACTIVE,
            ).select_related('skill_tag').order_by('id')
        )

        provided_outcomes = {}
        outcomes_raw = data.get('goalOutcomes')
        if isinstance(outcomes_raw, list):
            for row in outcomes_raw:
                if not isinstance(row, dict):
                    continue
                goal_id = _parse_int(row.get('goalId'))
                if not goal_id:
                    continue
                outcome = str(row.get('outcome') or '').strip().lower()
                note = str(row.get('notes') or '').strip()
                if outcome not in {choice[0] for choice in PersonReportCheckinGoalSnapshot.Outcome.choices}:
                    outcome = PersonReportCheckinGoalSnapshot.Outcome.CARRY_FORWARD
                provided_outcomes[goal_id] = {'outcome': outcome, 'notes': note}

        snapshots = []
        for goal in active_goals:
            supplied = provided_outcomes.get(goal.id, {})
            snapshots.append(
                PersonReportCheckinGoalSnapshot(
                    checkin=checkin,
                    goal=goal,
                    title_snapshot=goal.title,
                    goal_type_snapshot=goal.goal_type,
                    skill_tag_snapshot=getattr(getattr(goal, 'skill_tag', None), 'name', '') or '',
                    outcome=supplied.get('outcome') or PersonReportCheckinGoalSnapshot.Outcome.CARRY_FORWARD,
                    notes=supplied.get('notes') or '',
                )
            )

        if snapshots:
            PersonReportCheckinGoalSnapshot.objects.bulk_create(snapshots)

        checkin = PersonReportCheckin.objects.filter(id=checkin.id).prefetch_related('goal_snapshots').first()
        return Response({'checkin': _serialize_checkin(checkin)}, status=status.HTTP_201_CREATED)
