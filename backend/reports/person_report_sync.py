from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from reports.models import PersonReportGoal


def sync_goal_for_person_skill(person_skill) -> None:
    """Create/update linked PersonReportGoal for PersonSkill rows.

    Behavior:
    - skill_type='goals' => upsert active linked goal
    - any other skill_type => close existing linked goal (if present)
    """
    if not person_skill:
        return

    skill_type = getattr(person_skill, 'skill_type', '') or ''
    linked_goal = PersonReportGoal.objects.filter(linked_person_skill_id=person_skill.id).first()

    if skill_type != 'goals':
        if not linked_goal:
            return
        if linked_goal.status != PersonReportGoal.GoalStatus.CANCELLED:
            linked_goal.status = PersonReportGoal.GoalStatus.CANCELLED
            linked_goal.closed_at = timezone.now()
            linked_goal.save(update_fields=['status', 'closed_at', 'updated_at'])
        return

    title = (
        getattr(getattr(person_skill, 'skill_tag', None), 'name', None)
        or f"Skill Goal {person_skill.id}"
    )

    if linked_goal:
        linked_goal.person_id = person_skill.person_id
        linked_goal.title = title
        linked_goal.goal_type = PersonReportGoal.GoalType.SKILL
        linked_goal.skill_tag_id = person_skill.skill_tag_id
        linked_goal.status = PersonReportGoal.GoalStatus.ACTIVE
        linked_goal.closed_at = None
        linked_goal.save(
            update_fields=[
                'person',
                'title',
                'goal_type',
                'skill_tag',
                'status',
                'closed_at',
                'updated_at',
            ]
        )
        return

    PersonReportGoal.objects.create(
        person_id=person_skill.person_id,
        title=title,
        description='',
        goal_type=PersonReportGoal.GoalType.SKILL,
        skill_tag_id=person_skill.skill_tag_id,
        linked_person_skill_id=person_skill.id,
        status=PersonReportGoal.GoalStatus.ACTIVE,
        closed_at=None,
    )


@transaction.atomic
def close_goal_for_deleted_person_skill(person_skill) -> None:
    """When a PersonSkill(goal) is deleted, close linked report goal."""
    if not person_skill:
        return
    now = timezone.now()
    PersonReportGoal.objects.filter(linked_person_skill_id=person_skill.id).update(
        status=PersonReportGoal.GoalStatus.CANCELLED,
        closed_at=now,
        linked_person_skill_id=None,
        updated_at=now,
    )
