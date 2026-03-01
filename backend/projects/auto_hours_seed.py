from __future__ import annotations

from datetime import timedelta
from typing import Any

from django.db import transaction

from assignments.models import Assignment
from core.models import (
    AutoHoursGlobalSettings,
    AutoHoursRoleSetting,
    AutoHoursTemplateRoleSetting,
    DeliverablePhaseDefinition,
    UtilizationScheme,
)
from core.week_utils import sunday_of_week
from projects.models import Project, ProjectRole


_DEFAULT_PHASE_KEYS = ["sd", "dd", "ifp", "ifc"]
_DEFAULT_WEEKS_COUNT = 6
_MAX_WEEKS_COUNT = 18


def _ordered_phase_keys() -> list[str]:
    keys = [
        str(key).strip().lower()
        for key in DeliverablePhaseDefinition.objects.order_by("sort_order", "id").values_list("key", flat=True)
        if str(key).strip()
    ]
    return keys or list(_DEFAULT_PHASE_KEYS)


def _normalize_phase_keys(raw: object) -> list[str]:
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    for item in raw:
        key = str(item).strip().lower()
        if key and key not in out:
            out.append(key)
    return out


def _coerce_weeks_count(raw: object) -> int:
    try:
        value = int(raw)
    except Exception:
        value = _DEFAULT_WEEKS_COUNT
    return max(0, min(_MAX_WEEKS_COUNT, value))


def _coerce_role_count(raw: object) -> int:
    try:
        value = int(raw)
    except Exception:
        value = 1
    return max(0, value)


def _coerce_percent(raw: object) -> float:
    try:
        value = float(raw)
    except Exception:
        value = 0.0
    return max(0.0, min(100.0, value))


def _resolve_weeks_count(project: Project, phase: str, global_settings: AutoHoursGlobalSettings) -> int:
    template = getattr(project, "auto_hours_template", None)
    if template and phase in _normalize_phase_keys(getattr(template, "phase_keys", None)):
        return _coerce_weeks_count((template.weeks_by_phase or {}).get(phase))
    return _coerce_weeks_count((global_settings.weeks_by_phase or {}).get(phase))


def _enabled_phase_keys_for_project(
    project: Project,
    *,
    ordered_phase_keys: list[str],
    global_settings: AutoHoursGlobalSettings,
) -> list[str]:
    template = getattr(project, "auto_hours_template", None)
    template_keys = _normalize_phase_keys(getattr(template, "phase_keys", None)) if template else []
    base = [k for k in ordered_phase_keys if (not template_keys or k in template_keys)]
    if template_keys:
        # Include template keys not present in phase definitions at the tail, preserving template order.
        for key in template_keys:
            if key not in base:
                base.append(key)
    if not base:
        base = list(ordered_phase_keys or _DEFAULT_PHASE_KEYS)
    enabled: list[str] = []
    for phase in base:
        if _resolve_weeks_count(project, phase, global_settings) > 0:
            enabled.append(phase)
    return enabled


def _build_phase_windows(
    project: Project,
    *,
    ordered_phase_keys: list[str],
    global_settings: AutoHoursGlobalSettings,
) -> list[dict[str, Any]]:
    if not getattr(project, "start_date", None):
        return []
    phases = _enabled_phase_keys_for_project(
        project,
        ordered_phase_keys=ordered_phase_keys,
        global_settings=global_settings,
    )
    if not phases:
        return []
    start_week = sunday_of_week(project.start_date)
    cursor = start_week
    windows: list[dict[str, Any]] = []
    for phase in phases:
        weeks_count = _resolve_weeks_count(project, phase, global_settings)
        if weeks_count <= 0:
            continue
        end_week = cursor + timedelta(weeks=weeks_count - 1)
        windows.append(
            {
                "phase": phase,
                "weeksCount": weeks_count,
                "startWeek": cursor,
                "endWeek": end_week,
            }
        )
        cursor = end_week + timedelta(weeks=1)
    return windows


def _resolve_percent_by_week(setting, phase: str, *, template_mode: bool) -> dict[str, float]:
    out: dict[str, float] = {}
    if setting is None:
        return out

    raw = None
    if template_mode:
        raw = (setting.ramp_percent_by_phase or {}).get(phase) or {}
    else:
        raw_phase = (setting.ramp_percent_by_phase or {}).get(phase)
        if isinstance(raw_phase, dict):
            raw = raw_phase
        if raw is None:
            raw = setting.ramp_percent_by_week or {}

    if isinstance(raw, dict):
        for key, value in raw.items():
            key_str = str(key)
            if not key_str.isdigit():
                continue
            idx = int(key_str)
            if 0 <= idx <= (_MAX_WEEKS_COUNT - 1):
                out[str(idx)] = _coerce_percent(value)

    # Backward-compat global fallback when no ramp map is set.
    if (not template_mode) and not out:
        try:
            out["0"] = _coerce_percent(setting.standard_percent_of_capacity)
        except Exception:
            pass

    return out


def _resolve_full_capacity_hours() -> float:
    try:
        scheme = UtilizationScheme.get_active()
        value = float(getattr(scheme, "full_capacity_hours", 36) or 36)
        return max(1.0, value)
    except Exception:
        return 36.0


def _resolve_role_setting_for_phase(
    *,
    role_id: int,
    phase: str,
    template_enabled_phases: set[str],
    template_settings_by_role: dict[int, AutoHoursTemplateRoleSetting],
    global_settings_by_role: dict[int, AutoHoursRoleSetting],
) -> tuple[Any, bool]:
    template_mode = phase in template_enabled_phases
    setting = template_settings_by_role.get(role_id) if template_mode else None
    if setting is None:
        template_mode = False
        setting = global_settings_by_role.get(role_id)
    return setting, template_mode


def _phase_weekly_hours(
    *,
    setting: Any,
    phase: str,
    weeks_count: int,
    full_capacity_hours: float,
    phase_end_week,
    template_mode: bool,
) -> dict[str, float]:
    if setting is None or weeks_count <= 0:
        return {}
    percent_by_week = _resolve_percent_by_week(setting, phase, template_mode=template_mode)
    weekly_hours: dict[str, float] = {}
    for offset in range(weeks_count):
        pct = _coerce_percent(percent_by_week.get(str(offset), 0))
        if pct <= 0:
            continue
        week_key = (phase_end_week - timedelta(weeks=offset)).isoformat()
        weekly_hours[week_key] = round((full_capacity_hours * pct) / 100.0, 2)
    return weekly_hours


def _merge_weekly_hours(target: dict[str, float], src: dict[str, float]) -> None:
    for week_key, value in src.items():
        target[week_key] = round(float(target.get(week_key, 0.0)) + float(value or 0.0), 2)


def _default_percentage_for_phase(phase: str, *, fallback_index: int) -> int | None:
    defaults = {"sd": 35, "dd": 75, "ifp": 95, "ifc": 100}
    if phase in defaults:
        return defaults[phase]
    phase_def = DeliverablePhaseDefinition.objects.filter(key=phase).only("range_max").first()
    if phase_def and phase_def.range_max is not None:
        try:
            return int(phase_def.range_max)
        except Exception:
            return None
    return max(0, min(100, 20 + (fallback_index * 20)))


def _ensure_placeholder_note(notes: object) -> str:
    raw = str(notes or "").strip()
    if not raw:
        return "Placeholder"
    if "placeholder" in raw.lower():
        return raw
    return f"{raw}\nPlaceholder"


def _upsert_placeholder_deliverables(project: Project, phase_windows: list[dict[str, Any]]) -> dict[str, int]:
    if not phase_windows:
        return {"createdPlaceholderDeliverables": 0, "updatedPlaceholderDeliverables": 0}
    from core.deliverable_phase import classify_deliverable_phase
    from deliverables.models import Deliverable

    existing = list(
        Deliverable.objects.filter(project_id=project.id).order_by("sort_order", "id")
    )
    by_phase: dict[str, Any] = {}
    for row in existing:
        phase_key = classify_deliverable_phase(getattr(row, "description", None), getattr(row, "percentage", None))
        if phase_key in by_phase:
            continue
        by_phase[phase_key] = row

    created = 0
    updated = 0
    for idx, window in enumerate(phase_windows):
        phase = str(window["phase"])
        target_date = window["endWeek"] + timedelta(days=6)
        target_sort = (idx + 1) * 10
        target_notes = "Placeholder"
        row = by_phase.get(phase)
        if row is None:
            row = Deliverable.objects.create(
                project=project,
                percentage=_default_percentage_for_phase(phase, fallback_index=idx),
                description=phase.upper(),
                date=target_date,
                notes=target_notes,
                sort_order=target_sort,
            )
            by_phase[phase] = row
            created += 1
            continue

        changed_fields: list[str] = []
        if row.date != target_date:
            row.date = target_date
            changed_fields.append("date")
        if int(row.sort_order or 0) != target_sort:
            row.sort_order = target_sort
            changed_fields.append("sort_order")
        next_notes = _ensure_placeholder_note(getattr(row, "notes", ""))
        if (row.notes or "") != next_notes:
            row.notes = next_notes
            changed_fields.append("notes")
        if changed_fields:
            row.save(update_fields=[*changed_fields, "updated_at"])
            updated += 1
    return {
        "createdPlaceholderDeliverables": created,
        "updatedPlaceholderDeliverables": updated,
    }


def seed_project_auto_hours_placeholders(project: Project) -> int:
    """Create unassigned placeholder assignments from auto-hours settings.

    Seed behavior:
    - Builds sequential phase windows from project start date (SD -> DD -> IFP -> IFC).
    - Anchors week 0 to each phase's deliverable week (end of that phase window).
    - Uses template role settings when available, else global role settings.
    - Creates `roleCount` placeholders per role with merged weekly hours across enabled phases.
    - Skips generation when the project has no start date or already has active assignments.
    """
    if not project or not getattr(project, "id", None):
        return 0
    if not getattr(project, "start_date", None):
        return 0
    if Assignment.objects.filter(project_id=project.id, is_active=True).exists():
        return 0

    project = (
        Project.objects.filter(id=project.id)
        .select_related("auto_hours_template")
        .prefetch_related("auto_hours_template__excluded_roles", "auto_hours_template__excluded_departments")
        .first()
    ) or project

    global_settings = AutoHoursGlobalSettings.get_active()
    phase_windows = _build_phase_windows(
        project,
        ordered_phase_keys=_ordered_phase_keys(),
        global_settings=global_settings,
    )
    if not phase_windows:
        return 0
    _upsert_placeholder_deliverables(project, phase_windows)

    template = getattr(project, "auto_hours_template", None)
    template_enabled_phases = set(_normalize_phase_keys(getattr(template, "phase_keys", None))) if template else set()
    full_capacity_hours = _resolve_full_capacity_hours()
    profiles_by_role = _desired_role_profiles(
        project,
        phase_windows=phase_windows,
        full_capacity_hours=full_capacity_hours,
        template_enabled_phases=template_enabled_phases,
    )
    if not profiles_by_role:
        return 0

    created = 0
    for profile in profiles_by_role.values():
        role = profile["role"]
        role_count = int(profile["roleCount"])
        weekly_hours = dict(profile["weeklyHours"])
        for _ in range(max(0, role_count)):
            Assignment.objects.create(
                person=None,
                project=project,
                project_name=project.name,
                weekly_hours=dict(weekly_hours),
                department_id=role.department_id,
                role_on_project_ref=role,
                role_on_project=role.name,
                start_date=project.start_date,
                is_active=True,
            )
            created += 1

    return created


def _eligible_roles_for_project(project: Project) -> list[ProjectRole]:
    roles_qs = ProjectRole.objects.filter(is_active=True).select_related("department").order_by(
        "department_id", "sort_order", "name"
    )
    template = getattr(project, "auto_hours_template", None)
    if template:
        excluded_role_ids = list(template.excluded_roles.values_list("id", flat=True))
        excluded_department_ids = list(template.excluded_departments.values_list("id", flat=True))
        if excluded_role_ids:
            roles_qs = roles_qs.exclude(id__in=excluded_role_ids)
        if excluded_department_ids:
            roles_qs = roles_qs.exclude(department_id__in=excluded_department_ids)
    return list(roles_qs)


def _desired_role_profiles(
    project: Project,
    *,
    phase_windows: list[dict[str, Any]],
    full_capacity_hours: float,
    template_enabled_phases: set[str],
) -> dict[int, dict]:
    if not phase_windows:
        return {}
    roles = _eligible_roles_for_project(project)
    if not roles:
        return {}
    role_ids = [r.id for r in roles]
    template = getattr(project, "auto_hours_template", None)
    global_settings_by_role = {
        row.role_id: row for row in AutoHoursRoleSetting.objects.filter(role_id__in=role_ids)
    }
    template_settings_by_role = {}
    if template:
        template_settings_by_role = {
            row.role_id: row
            for row in AutoHoursTemplateRoleSetting.objects.filter(template_id=template.id, role_id__in=role_ids)
        }

    profiles: dict[int, dict] = {}
    for role in roles:
        max_role_count = 0
        weekly_hours: dict[str, float] = {}
        for window in phase_windows:
            phase = str(window["phase"])
            weeks_count = int(window["weeksCount"])
            phase_end_week = window["endWeek"]
            setting, template_mode = _resolve_role_setting_for_phase(
                role_id=role.id,
                phase=phase,
                template_enabled_phases=template_enabled_phases,
                template_settings_by_role=template_settings_by_role,
                global_settings_by_role=global_settings_by_role,
            )
            if setting is None:
                continue
            role_count = _coerce_role_count((setting.role_count_by_phase or {}).get(phase))
            max_role_count = max(max_role_count, role_count)
            phase_hours = _phase_weekly_hours(
                setting=setting,
                phase=phase,
                weeks_count=weeks_count,
                full_capacity_hours=full_capacity_hours,
                phase_end_week=phase_end_week,
                template_mode=template_mode,
            )
            _merge_weekly_hours(weekly_hours, phase_hours)
        if max_role_count <= 0 or not weekly_hours:
            continue
        profiles[role.id] = {
            "role": role,
            "roleCount": max_role_count,
            "weeklyHours": weekly_hours,
        }
    return profiles


def reseed_project_assignment_hours(project: Project) -> dict[str, int]:
    """Recompute weekly hours for existing project assignments with project roles.

    Updates active assignments where `role_on_project_ref_id` is present, including
    both placeholders and staffed rows. Does not create/delete assignment rows.
    """
    if not project or not getattr(project, "id", None):
        return {
            "updatedAssignments": 0,
            "updatedPlaceholderAssignments": 0,
            "updatedStaffedAssignments": 0,
            "skippedAssignmentsNoRoleSettings": 0,
            "consideredAssignments": 0,
        }
    if not getattr(project, "start_date", None):
        raise ValueError("project_start_date_required")

    project = (
        Project.objects.filter(id=project.id)
        .select_related("auto_hours_template")
        .first()
    ) or project

    global_settings = AutoHoursGlobalSettings.get_active()
    phase_windows = _build_phase_windows(
        project,
        ordered_phase_keys=_ordered_phase_keys(),
        global_settings=global_settings,
    )
    if not phase_windows:
        return {
            "updatedAssignments": 0,
            "updatedPlaceholderAssignments": 0,
            "updatedStaffedAssignments": 0,
            "skippedAssignmentsNoRoleSettings": 0,
            "consideredAssignments": 0,
        }
    deliverable_summary = _upsert_placeholder_deliverables(project, phase_windows)

    full_capacity_hours = _resolve_full_capacity_hours()
    template_enabled_phases = set(
        _normalize_phase_keys(getattr(getattr(project, "auto_hours_template", None), "phase_keys", None))
    )
    profiles_by_role = _desired_role_profiles(
        project,
        phase_windows=phase_windows,
        full_capacity_hours=full_capacity_hours,
        template_enabled_phases=template_enabled_phases,
    )
    if not profiles_by_role:
        return {
            "updatedAssignments": 0,
            "updatedPlaceholderAssignments": 0,
            "updatedStaffedAssignments": 0,
            "createdAssignments": 0,
            "createdPlaceholderAssignments": 0,
            "skippedAssignmentsNoRoleSettings": 0,
            "consideredAssignments": 0,
            **deliverable_summary,
        }

    assignments = list(
        Assignment.objects.filter(
            project_id=project.id,
            is_active=True,
            role_on_project_ref_id__isnull=False,
        ).only("id", "person_id", "role_on_project_ref_id", "weekly_hours", "start_date", "project_id")
    )
    assignments_by_role: dict[int, list[Assignment]] = {}
    for assignment in assignments:
        role_id = int(assignment.role_on_project_ref_id or 0)
        if role_id <= 0:
            continue
        assignments_by_role.setdefault(role_id, []).append(assignment)

    updated = 0
    updated_placeholders = 0
    updated_staffed = 0
    created = 0
    created_placeholders = 0
    skipped_no_settings = 0

    with transaction.atomic():
        # Backfill missing project-role rows from the selected template/global profile.
        for role_id, profile in profiles_by_role.items():
            role = profile["role"]
            desired_count = int(profile["roleCount"])
            weekly_hours = dict(profile["weeklyHours"])
            existing_count = len(assignments_by_role.get(role_id, []))
            missing = max(0, desired_count - existing_count)
            for _ in range(missing):
                created_assignment = Assignment.objects.create(
                    person=None,
                    project=project,
                    project_name=project.name,
                    weekly_hours=weekly_hours,
                    department_id=role.department_id,
                    role_on_project_ref=role,
                    role_on_project=role.name,
                    start_date=project.start_date,
                    is_active=True,
                )
                assignments.append(created_assignment)
                assignments_by_role.setdefault(role_id, []).append(created_assignment)
                created += 1
                created_placeholders += 1

        for assignment in assignments:
            role_id = int(assignment.role_on_project_ref_id or 0)
            if role_id <= 0:
                continue
            profile = profiles_by_role.get(role_id)
            if not profile:
                skipped_no_settings += 1
                continue
            next_hours = dict(profile["weeklyHours"])

            current_hours = assignment.weekly_hours or {}
            if current_hours == next_hours and assignment.start_date == project.start_date:
                continue

            assignment.weekly_hours = dict(next_hours)
            assignment.start_date = project.start_date
            assignment.save(update_fields=["weekly_hours", "start_date", "updated_at"])
            updated += 1
            if assignment.person_id:
                updated_staffed += 1
            else:
                updated_placeholders += 1

    return {
        "updatedAssignments": updated,
        "updatedPlaceholderAssignments": updated_placeholders,
        "updatedStaffedAssignments": updated_staffed,
        "createdAssignments": created,
        "createdPlaceholderAssignments": created_placeholders,
        "skippedAssignmentsNoRoleSettings": skipped_no_settings,
        "consideredAssignments": len(assignments),
        **deliverable_summary,
    }
