from __future__ import annotations

from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover
    from assignments.models import Assignment


def normalize_role_name(role_name: str | None) -> str:
    return (role_name or "").strip().lower()


def is_lead_role_name(role_name: str | None) -> bool:
    return "lead" in normalize_role_name(role_name)


def resolve_assignment_role_name(assignment: "Assignment") -> str | None:
    try:
        role_ref = getattr(assignment, "role_on_project_ref", None)
        if role_ref and getattr(role_ref, "name", None):
            return str(role_ref.name).strip() or None
    except Exception:  # nosec B110
        pass
    legacy = getattr(assignment, "role_on_project", None)
    if legacy is None:
        return None
    out = str(legacy).strip()
    return out or None


def resolve_assignment_department_id(assignment: "Assignment") -> Optional[int]:
    person = getattr(assignment, "person", None)
    person_dept_id = getattr(person, "department_id", None) if person is not None else None
    if person_dept_id:
        return int(person_dept_id)
    assignment_dept_id = getattr(assignment, "department_id", None)
    if assignment_dept_id:
        return int(assignment_dept_id)
    role_ref = getattr(assignment, "role_on_project_ref", None)
    role_dept_id = getattr(role_ref, "department_id", None) if role_ref is not None else None
    if role_dept_id:
        return int(role_dept_id)
    return None
