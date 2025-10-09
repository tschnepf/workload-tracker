from typing import Iterable
from projects.models import ProjectRole


def list_roles_by_department(dept_id: int, include_inactive: bool = False) -> Iterable[ProjectRole]:
    qs = ProjectRole.objects.filter(department_id=dept_id)
    if not include_inactive:
        qs = qs.filter(is_active=True)
    return qs.order_by('-is_active', 'sort_order', 'name')


def last_updated_timestamp_for_department(dept_id: int):
    try:
        return ProjectRole.objects.filter(department_id=dept_id).order_by('-updated_at').values_list('updated_at', flat=True).first()
    except Exception:
        return None

