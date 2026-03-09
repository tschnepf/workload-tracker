from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.conf import settings

from core.models import FeatureToggleSettings
from people.models import Person

from .models import (
    Department,
    DepartmentOrgChartLayout,
    DepartmentReportingGroup,
    DepartmentReportingGroupMember,
)


def reporting_groups_feature_enabled() -> bool:
    if not bool(getattr(settings, 'REPORTING_GROUPS_SYSTEM_ENABLED', True)):
        return False
    try:
        return bool(FeatureToggleSettings.get_active().reporting_groups_enabled)
    except Exception:
        return False


@dataclass
class ReportingGroupSummary:
    department_id: int
    group_count: int
    manager_count: int
    member_count: int
    unassigned_count: int


def person_to_group_index(department: Department) -> dict[int, int]:
    memberships = DepartmentReportingGroupMember.objects.filter(
        department=department,
        reporting_group__is_active=True,
    ).values_list('person_id', 'reporting_group_id')
    return {int(person_id): int(group_id) for person_id, group_id in memberships}


def reporting_group_summary(department: Department) -> ReportingGroupSummary:
    groups = DepartmentReportingGroup.objects.filter(department=department, is_active=True)
    group_ids = set(groups.values_list('id', flat=True))
    manager_ids = set(groups.exclude(manager_id__isnull=True).values_list('manager_id', flat=True))
    members_qs = DepartmentReportingGroupMember.objects.filter(
        department=department,
        reporting_group_id__in=group_ids,
    )
    member_ids = set(members_qs.values_list('person_id', flat=True))
    people_ids = set(
        Person.objects.filter(department=department, is_active=True).values_list('id', flat=True)
    )
    assigned_ids = set(manager_ids) | set(member_ids)
    unassigned_count = max(0, len(people_ids - assigned_ids))
    return ReportingGroupSummary(
        department_id=int(department.id or 0),
        group_count=int(groups.count()),
        manager_count=len(manager_ids),
        member_count=len(member_ids),
        unassigned_count=unassigned_count,
    )


def build_workspace_payload(department: Department, *, can_edit: bool) -> dict[str, Any]:
    layout = DepartmentOrgChartLayout.get_or_create_for_department(department)
    groups = list(
        DepartmentReportingGroup.objects.filter(department=department, is_active=True)
        .select_related('manager')
        .order_by('sort_order', 'id')
    )
    memberships = list(
        DepartmentReportingGroupMember.objects.filter(
            department=department,
            reporting_group__is_active=True,
        )
        .select_related('person', 'person__role')
        .order_by('sort_order', 'id')
    )
    members_by_group: dict[int, list[int]] = {}
    assigned_member_ids: set[int] = set()
    for membership in memberships:
        group_id = int(membership.reporting_group_id)
        person_id = int(membership.person_id)
        members_by_group.setdefault(group_id, []).append(person_id)
        assigned_member_ids.add(person_id)

    manager_ids = {int(group.manager_id) for group in groups if group.manager_id}
    people = list(
        Person.objects.filter(department=department, is_active=True)
        .select_related('role')
        .order_by('name', 'id')
    )
    people_payload = [
        {
            'id': int(person.id),
            'name': person.name,
            'roleName': person.role.name if person.role else None,
            'departmentId': int(person.department_id) if person.department_id else None,
        }
        for person in people
    ]
    all_people_ids = [int(person.id) for person in people if person.id is not None]
    assigned_ids = set(assigned_member_ids) | set(manager_ids)
    unassigned = [person_id for person_id in all_people_ids if person_id not in assigned_ids]

    groups_payload = [
        {
            'id': int(group.id),
            'name': group.name,
            'managerId': int(group.manager_id) if group.manager_id else None,
            'card': {'x': int(group.card_x), 'y': int(group.card_y)},
            'memberIds': members_by_group.get(int(group.id), []),
            'sortOrder': int(group.sort_order or 0),
            'updatedAt': group.updated_at.isoformat() if group.updated_at else None,
        }
        for group in groups
    ]

    return {
        'featureEnabled': reporting_groups_feature_enabled(),
        'canEdit': bool(can_edit),
        'workspaceVersion': int(layout.workspace_version or 1),
        'departmentCard': {'x': int(layout.department_card_x), 'y': int(layout.department_card_y)},
        'groups': groups_payload,
        'people': people_payload,
        'unassignedPersonIds': unassigned,
    }
