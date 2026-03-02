from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any

from assignments.models import Assignment
from core.models import AutoHoursRoleSetting, AutoHoursTemplate, AutoHoursTemplateRoleSetting, UtilizationScheme
from departments.models import Department
from people.models import Person
from projects.status_definitions import (
    get_status_definition_index,
    get_status_keys_included_in_analytics,
    normalize_status_key,
)
from roles.models import Role


DEFAULT_WEEKS = 26
MIN_WEEKS = 1
MAX_WEEKS = 52

DEFAULT_THRESHOLDS = {
    "teamUtilizationPct": 95.0,
    "roleUtilizationPct": 100.0,
    "unmappedHoursPerWeek": 20.0,
}


@dataclass
class PlannerScope:
    weeks: int
    week_keys: list[str]
    department_id: int | None
    include_children: bool
    department_ids: set[int] | None
    vertical_id: int | None


@dataclass
class BaselineEvaluation:
    demand_by_role: dict[int, list[float]]
    baseline_total: list[float]
    baseline_unmapped: list[float]
    status_stats: dict[str, dict[str, float]]
    scheduled_included: list[float]
    scheduled_excluded: list[float]
    included_by_status: dict[str, list[float]]
    excluded_by_status: dict[str, list[float]]
    department_included: dict[int, list[float]]
    department_excluded: dict[int, list[float]]


def parse_int(raw: Any, default: int | None = None) -> int | None:
    if raw in (None, ""):
        return default
    try:
        return int(raw)
    except Exception:
        return default


def clamp_weeks(raw: Any, default: int = DEFAULT_WEEKS) -> int:
    parsed = parse_int(raw, default) or default
    return max(MIN_WEEKS, min(MAX_WEEKS, parsed))


def normalize_status_keys(raw_keys: list[str] | None) -> tuple[list[str], list[str]]:
    index = get_status_definition_index()
    valid = set(index.keys())
    out: list[str] = []
    invalid: list[str] = []
    for item in raw_keys or []:
        key = normalize_status_key(item)
        if not key:
            continue
        if key not in valid:
            invalid.append(key)
            continue
        if key not in out:
            out.append(key)
    return out, invalid


def get_default_status_keys() -> list[str]:
    return sorted(get_status_keys_included_in_analytics(active_only=True))


def build_week_keys(weeks: int) -> list[str]:
    today = date.today()
    days_since_sunday = (today.weekday() + 1) % 7
    start_sunday = today - timedelta(days=days_since_sunday)
    return [(start_sunday + timedelta(weeks=i)).isoformat() for i in range(weeks)]


def sunday_for_date(value: date) -> date:
    return value - timedelta(days=(value.weekday() + 1) % 7)


def parse_iso_date(raw: str | None) -> date | None:
    if not raw:
        return None
    try:
        return datetime.strptime(str(raw), "%Y-%m-%d").date()
    except Exception:
        return None


def hours_for_week(weekly_hours: dict[str, Any], sunday_key: str) -> float:
    if not isinstance(weekly_hours, dict):
        return 0.0
    try:
        direct = float(weekly_hours.get(sunday_key) or 0.0)
    except Exception:
        direct = 0.0
    if direct > 0:
        return direct
    try:
        base = datetime.strptime(sunday_key, "%Y-%m-%d").date()
    except Exception:
        return 0.0
    for offset in range(-3, 4):
        alt_key = (base + timedelta(days=offset)).isoformat()
        try:
            value = float(weekly_hours.get(alt_key) or 0.0)
        except Exception:
            value = 0.0
        if value > 0:
            return value
    return 0.0


def expand_department_ids(department_id: int | None, include_children: bool) -> set[int] | None:
    if department_id is None:
        return None
    if not include_children:
        return {department_id}
    ids: set[int] = set()
    stack = [department_id]
    while stack:
        current = stack.pop()
        if current in ids:
            continue
        ids.add(current)
        child_ids = list(Department.objects.filter(parent_department_id=current).values_list("id", flat=True))
        for child_id in child_ids:
            if child_id not in ids:
                stack.append(int(child_id))
    return ids


def build_scope(
    *,
    weeks: int,
    department_id: int | None,
    include_children: bool,
    vertical_id: int | None,
) -> PlannerScope:
    return PlannerScope(
        weeks=weeks,
        week_keys=build_week_keys(weeks),
        department_id=department_id,
        include_children=include_children,
        department_ids=expand_department_ids(department_id, include_children),
        vertical_id=vertical_id,
    )


def _load_role_mapping_for_project_roles(
    project_role_ids: set[int],
    template_ids: set[int],
) -> tuple[dict[tuple[int, int], list[int]], dict[int, list[int]]]:
    template_map: dict[tuple[int, int], list[int]] = {}
    global_map: dict[int, list[int]] = {}

    if project_role_ids and template_ids:
        rows = AutoHoursTemplateRoleSetting.objects.filter(
            template_id__in=list(template_ids),
            role_id__in=list(project_role_ids),
        ).prefetch_related("people_roles")
        for row in rows:
            mapped = sorted(int(role_id) for role_id in row.people_roles.values_list("id", flat=True))
            template_map[(int(row.template_id), int(row.role_id))] = mapped

    if project_role_ids:
        rows = AutoHoursRoleSetting.objects.filter(role_id__in=list(project_role_ids)).prefetch_related("people_roles")
        for row in rows:
            mapped = sorted(int(role_id) for role_id in row.people_roles.values_list("id", flat=True))
            global_map[int(row.role_id)] = mapped

    return template_map, global_map


def _thresholds_with_defaults(raw: dict[str, Any] | None) -> dict[str, float]:
    out = dict(DEFAULT_THRESHOLDS)
    for key in DEFAULT_THRESHOLDS.keys():
        try:
            if raw is not None and key in raw:
                out[key] = float(raw.get(key) or out[key])
        except Exception:
            continue
    out["teamUtilizationPct"] = max(1.0, out["teamUtilizationPct"])
    out["roleUtilizationPct"] = max(1.0, out["roleUtilizationPct"])
    out["unmappedHoursPerWeek"] = max(0.0, out["unmappedHoursPerWeek"])
    return out


def _capacity_by_role_and_team(scope: PlannerScope) -> tuple[dict[int, list[float]], list[float], dict[int, str]]:
    role_names = {int(r.id): r.name for r in Role.objects.filter(is_active=True).only("id", "name")}
    capacity_by_role: dict[int, list[float]] = defaultdict(lambda: [0.0] * scope.weeks)
    team_capacity = [0.0] * scope.weeks

    people_qs = Person.objects.filter(is_active=True)
    if scope.department_ids is not None:
        people_qs = people_qs.filter(department_id__in=list(scope.department_ids))
    if scope.vertical_id is not None:
        people_qs = people_qs.filter(department__vertical_id=scope.vertical_id)
    people_qs = people_qs.only("id", "role_id", "weekly_capacity", "hire_date")

    for person in people_qs.iterator():
        role_id = int(person.role_id) if person.role_id else None
        if role_id is None:
            continue
        hire_key = person.hire_date.isoformat() if person.hire_date else None
        weekly_capacity = float(person.weekly_capacity or 0.0)
        if weekly_capacity <= 0:
            continue
        for idx, week_key in enumerate(scope.week_keys):
            if hire_key and week_key < hire_key:
                continue
            capacity_by_role[role_id][idx] += weekly_capacity
            team_capacity[idx] += weekly_capacity

    return capacity_by_role, team_capacity, role_names


def _map_project_role_to_people_roles(
    *,
    project_role_id: int | None,
    template_id: int | None,
    template_map: dict[tuple[int, int], list[int]],
    global_map: dict[int, list[int]],
) -> list[int]:
    if not project_role_id:
        return []
    if template_id:
        mapped = template_map.get((int(template_id), int(project_role_id))) or []
        if mapped:
            return mapped
    return global_map.get(int(project_role_id)) or []


def _evaluate_baseline(
    *,
    scope: PlannerScope,
    status_keys: set[str],
) -> BaselineEvaluation:
    demand_by_role: dict[int, list[float]] = defaultdict(lambda: [0.0] * scope.weeks)
    total_demand = [0.0] * scope.weeks  # Included statuses only (planner baseline)
    unmapped = [0.0] * scope.weeks  # Included statuses only
    status_stats: dict[str, dict[str, float]] = defaultdict(lambda: {"projectCount": 0.0, "hours": 0.0})
    scheduled_included = [0.0] * scope.weeks
    scheduled_excluded = [0.0] * scope.weeks
    included_by_status: dict[str, list[float]] = defaultdict(lambda: [0.0] * scope.weeks)
    excluded_by_status: dict[str, list[float]] = defaultdict(lambda: [0.0] * scope.weeks)
    department_included: dict[int, list[float]] = defaultdict(lambda: [0.0] * scope.weeks)
    department_excluded: dict[int, list[float]] = defaultdict(lambda: [0.0] * scope.weeks)

    base_qs = Assignment.objects.filter(is_active=True, project__isnull=False).select_related(
        "project",
        "person",
        "role_on_project_ref",
    )
    if scope.vertical_id is not None:
        base_qs = base_qs.filter(project__vertical_id=scope.vertical_id)

    assignments = list(
        base_qs.only(
            "person_id",
            "weekly_hours",
            "department_id",
            "role_on_project_ref_id",
            "project_id",
            "project__status",
            "project__auto_hours_template_id",
            "person__role_id",
            "person__department_id",
            "role_on_project_ref__department_id",
        )
    )
    if not assignments:
        return BaselineEvaluation(
            demand_by_role=demand_by_role,
            baseline_total=total_demand,
            baseline_unmapped=unmapped,
            status_stats=status_stats,
            scheduled_included=scheduled_included,
            scheduled_excluded=scheduled_excluded,
            included_by_status=included_by_status,
            excluded_by_status=excluded_by_status,
            department_included=department_included,
            department_excluded=department_excluded,
        )

    project_role_ids: set[int] = set()
    template_ids: set[int] = set()
    seen_projects_by_status: dict[str, set[int]] = defaultdict(set)
    scoped_assignments: list[tuple[Assignment, str, int | None]] = []

    for assignment in assignments:
        status_key = normalize_status_key(getattr(assignment.project, "status", ""))
        if not status_key:
            continue
        if scope.department_ids is not None:
            in_scope = False
            if assignment.person_id and getattr(assignment.person, "department_id", None) in scope.department_ids:
                in_scope = True
            if assignment.department_id and int(assignment.department_id) in scope.department_ids:
                in_scope = True
            role_department = getattr(getattr(assignment, "role_on_project_ref", None), "department_id", None)
            if role_department and int(role_department) in scope.department_ids:
                in_scope = True
            if not in_scope:
                continue

        dept_id = None
        if assignment.department_id:
            dept_id = int(assignment.department_id)
        elif assignment.person_id and getattr(assignment.person, "department_id", None):
            dept_id = int(getattr(assignment.person, "department_id"))
        else:
            role_department = getattr(getattr(assignment, "role_on_project_ref", None), "department_id", None)
            if role_department:
                dept_id = int(role_department)

        scoped_assignments.append((assignment, status_key, dept_id))
        if assignment.project_id:
            seen_projects_by_status[status_key].add(int(assignment.project_id))
        if status_key in status_keys and assignment.role_on_project_ref_id:
            project_role_ids.add(int(assignment.role_on_project_ref_id))
        template_id = getattr(getattr(assignment, "project", None), "auto_hours_template_id", None)
        if status_key in status_keys and template_id:
            template_ids.add(int(template_id))

    template_map, global_map = _load_role_mapping_for_project_roles(project_role_ids, template_ids)

    for status_key, project_ids in seen_projects_by_status.items():
        status_stats[status_key]["projectCount"] = float(len(project_ids))

    for assignment, status_key, dept_id in scoped_assignments:
        is_included = status_key in status_keys
        weekly_hours = assignment.weekly_hours or {}
        template_id = getattr(getattr(assignment, "project", None), "auto_hours_template_id", None)
        mapped_roles: list[int] = []
        person_role_id = int(getattr(getattr(assignment, "person", None), "role_id", 0) or 0)
        if assignment.person_id:
            mapped_roles = [person_role_id] if person_role_id > 0 else []
        elif is_included:
            mapped_roles = _map_project_role_to_people_roles(
                project_role_id=assignment.role_on_project_ref_id,
                template_id=int(template_id) if template_id else None,
                template_map=template_map,
                global_map=global_map,
            )

        for idx, week_key in enumerate(scope.week_keys):
            value = hours_for_week(weekly_hours, week_key)
            if value <= 0:
                continue

            status_stats[status_key]["hours"] += value
            if is_included:
                scheduled_included[idx] += value
                included_by_status[status_key][idx] += value
                if dept_id is not None:
                    department_included[dept_id][idx] += value
            else:
                scheduled_excluded[idx] += value
                excluded_by_status[status_key][idx] += value
                if dept_id is not None:
                    department_excluded[dept_id][idx] += value

            if not is_included:
                continue
            total_demand[idx] += value
            if not mapped_roles:
                unmapped[idx] += value
                continue
            split = value / float(len(mapped_roles))
            for role_id in mapped_roles:
                demand_by_role[int(role_id)][idx] += split

    return BaselineEvaluation(
        demand_by_role=demand_by_role,
        baseline_total=total_demand,
        baseline_unmapped=unmapped,
        status_stats=status_stats,
        scheduled_included=scheduled_included,
        scheduled_excluded=scheduled_excluded,
        included_by_status=included_by_status,
        excluded_by_status=excluded_by_status,
        department_included=department_included,
        department_excluded=department_excluded,
    )


def _build_template_profile(
    template: AutoHoursTemplate,
    full_capacity_hours: float,
) -> dict[str, Any]:
    role_series: dict[int, list[float]] = defaultdict(list)
    total_series: list[float] = []
    unmapped_series: list[float] = []

    role_settings = list(AutoHoursTemplateRoleSetting.objects.filter(template_id=template.id).prefetch_related("people_roles"))
    if not role_settings:
        return {
            "roleSeries": {},
            "totalSeries": [],
            "unmappedSeries": [],
            "durationWeeks": 0,
        }

    duration_weeks = 0
    for role_setting in role_settings:
        mapped_roles = sorted(int(rid) for rid in role_setting.people_roles.values_list("id", flat=True))
        if not mapped_roles:
            mapped_roles = [int(role_setting.role_id)]
        ramp_by_phase = role_setting.ramp_percent_by_phase or {}
        count_by_phase = role_setting.role_count_by_phase or {}
        phase_keys = list(template.phase_keys or [])
        if not phase_keys:
            phase_keys = sorted((template.weeks_by_phase or {}).keys())
        weeks_by_phase = template.weeks_by_phase or {}
        offset = 0
        role_weeks: dict[int, float] = defaultdict(float)
        for phase in phase_keys:
            phase_weeks = int(weeks_by_phase.get(phase, 0) or 0)
            if phase_weeks <= 0:
                continue
            pct_map = (ramp_by_phase.get(phase) or {}) if isinstance(ramp_by_phase, dict) else {}
            role_count = float(count_by_phase.get(phase, 1) or 1)
            for week_offset in range(phase_weeks):
                pct_value = pct_map.get(str(week_offset), pct_map.get("0", 0))
                try:
                    pct = float(pct_value or 0.0)
                except Exception:
                    pct = 0.0
                hours = max(0.0, (full_capacity_hours * pct / 100.0) * role_count)
                if hours <= 0:
                    continue
                absolute_idx = offset + week_offset
                split = hours / float(len(mapped_roles))
                for people_role_id in mapped_roles:
                    role_weeks[(int(people_role_id), absolute_idx)] += split
            offset += phase_weeks
        duration_weeks = max(duration_weeks, offset)
        for (people_role_id, idx), value in role_weeks.items():
            arr = role_series.setdefault(people_role_id, [])
            while len(arr) <= idx:
                arr.append(0.0)
            arr[idx] += value

    if duration_weeks > 0:
        total_series = [0.0] * duration_weeks
        unmapped_series = [0.0] * duration_weeks
        for arr in role_series.values():
            for idx in range(min(len(arr), duration_weeks)):
                total_series[idx] += float(arr[idx] or 0.0)

    normalized_role_series = {role_id: [float(v or 0.0) for v in values] for role_id, values in role_series.items()}
    return {
        "roleSeries": normalized_role_series,
        "totalSeries": total_series,
        "unmappedSeries": unmapped_series,
        "durationWeeks": duration_weeks,
    }


def _index_for_start_date(week_keys: list[str], raw_start: str | None) -> int:
    if not week_keys:
        return 0
    start_date = parse_iso_date(raw_start)
    if not start_date:
        return 0
    sunday = sunday_for_date(start_date).isoformat()
    if sunday <= week_keys[0]:
        return 0
    for idx, week_key in enumerate(week_keys):
        if week_key >= sunday:
            return idx
    return len(week_keys)


def _apply_proposed_projects(
    *,
    scope: PlannerScope,
    projects_payload: list[dict[str, Any]],
    use_probability_weighting: bool,
) -> tuple[dict[int, list[float]], list[float], list[float], list[dict[str, Any]]]:
    proposed_by_role: dict[int, list[float]] = defaultdict(lambda: [0.0] * scope.weeks)
    proposed_total = [0.0] * scope.weeks
    proposed_unmapped = [0.0] * scope.weeks
    project_profiles: list[dict[str, Any]] = []

    template_ids: set[int] = set()
    for item in projects_payload:
        try:
            template_ids.add(int(item.get("templateId")))
        except Exception:
            continue
    templates = {int(t.id): t for t in AutoHoursTemplate.objects.filter(id__in=list(template_ids), is_active=True)}

    scheme = UtilizationScheme.get_active()
    full_capacity_hours = float(getattr(scheme, "full_capacity_hours", 36) or 36)

    template_profiles: dict[int, dict[str, Any]] = {}
    for template_id, template in templates.items():
        template_profiles[template_id] = _build_template_profile(template, full_capacity_hours=full_capacity_hours)

    for idx, item in enumerate(projects_payload):
        try:
            template_id = int(item.get("templateId"))
        except Exception:
            continue
        profile = template_profiles.get(template_id)
        if not profile:
            continue
        try:
            quantity = max(1, min(50, int(item.get("quantity") or 1)))
        except Exception:
            quantity = 1
        try:
            probability = float(item.get("probabilityPct") or 100.0)
        except Exception:
            probability = 100.0
        probability = max(0.0, min(100.0, probability))
        weight = (probability / 100.0) if use_probability_weighting else 1.0
        start_idx = _index_for_start_date(scope.week_keys, item.get("startDate"))

        role_series = profile.get("roleSeries") or {}
        total_series = profile.get("totalSeries") or []
        unmapped_series = profile.get("unmappedSeries") or []
        project_name = str(item.get("name") or "").strip() or f"Proposed Project {idx + 1}"

        for clone in range(quantity):
            clone_label = project_name if quantity == 1 else f"{project_name} #{clone + 1}"
            project_profiles.append(
                {
                    "name": clone_label,
                    "templateId": template_id,
                    "requestedStartDate": item.get("startDate"),
                    "startIndex": start_idx,
                    "probabilityPct": probability,
                    "durationWeeks": int(profile.get("durationWeeks") or len(total_series)),
                    "roleSeries": role_series,
                    "totalSeries": total_series,
                    "unmappedSeries": unmapped_series,
                }
            )
            for role_id, values in role_series.items():
                target = proposed_by_role[int(role_id)]
                for rel_idx, value in enumerate(values):
                    abs_idx = start_idx + rel_idx
                    if abs_idx < 0 or abs_idx >= scope.weeks:
                        continue
                    target[abs_idx] += float(value or 0.0) * weight
            for rel_idx, value in enumerate(total_series):
                abs_idx = start_idx + rel_idx
                if abs_idx < 0 or abs_idx >= scope.weeks:
                    continue
                proposed_total[abs_idx] += float(value or 0.0) * weight
            for rel_idx, value in enumerate(unmapped_series):
                abs_idx = start_idx + rel_idx
                if abs_idx < 0 or abs_idx >= scope.weeks:
                    continue
                proposed_unmapped[abs_idx] += float(value or 0.0) * weight

    return proposed_by_role, proposed_total, proposed_unmapped, project_profiles


def _round_series(values: list[float]) -> list[float]:
    return [round(float(v or 0.0), 2) for v in values]


def _month_key_for_week_key(week_key: str) -> str:
    if isinstance(week_key, str) and len(week_key) >= 7:
        return week_key[:7]
    return str(week_key)


def _build_month_buckets(week_keys: list[str]) -> tuple[list[str], list[list[int]]]:
    month_keys: list[str] = []
    buckets: list[list[int]] = []
    index: dict[str, int] = {}
    for week_idx, week_key in enumerate(week_keys):
        month_key = _month_key_for_week_key(week_key)
        bucket_idx = index.get(month_key)
        if bucket_idx is None:
            index[month_key] = len(month_keys)
            month_keys.append(month_key)
            buckets.append([])
            bucket_idx = len(month_keys) - 1
        buckets[bucket_idx].append(week_idx)
    return month_keys, buckets


def _rollup_sum(values: list[float], month_buckets: list[list[int]]) -> list[float]:
    out: list[float] = []
    for bucket in month_buckets:
        total = 0.0
        for idx in bucket:
            if 0 <= idx < len(values):
                total += float(values[idx] or 0.0)
        out.append(total)
    return out


def _rollup_avg(values: list[float], month_buckets: list[list[int]]) -> list[float]:
    out: list[float] = []
    for bucket in month_buckets:
        if not bucket:
            out.append(0.0)
            continue
        total = 0.0
        for idx in bucket:
            if 0 <= idx < len(values):
                total += float(values[idx] or 0.0)
        out.append(total / float(len(bucket)))
    return out


def _rollup_series_map(series_map: dict[str, list[float]], month_buckets: list[list[int]]) -> dict[str, list[float]]:
    return {key: _round_series(_rollup_sum(values or [], month_buckets)) for key, values in series_map.items()}


def _series_add(left: list[float], right: list[float]) -> list[float]:
    size = max(len(left), len(right))
    return [
        float(left[idx] if idx < len(left) else 0.0) + float(right[idx] if idx < len(right) else 0.0)
        for idx in range(size)
    ]


def _series_subtract(left: list[float], right: list[float]) -> list[float]:
    size = max(len(left), len(right))
    return [
        float(left[idx] if idx < len(left) else 0.0) - float(right[idx] if idx < len(right) else 0.0)
        for idx in range(size)
    ]


def _series_ratio_pct(numerator: list[float], denominator: list[float]) -> list[float]:
    size = max(len(numerator), len(denominator))
    out: list[float] = []
    for idx in range(size):
        num = float(numerator[idx] if idx < len(numerator) else 0.0)
        den = float(denominator[idx] if idx < len(denominator) else 0.0)
        out.append((num / den * 100.0) if den > 0 else (100.0 if num > 0 else 0.0))
    return out


def _build_recommendation(
    *,
    week_keys: list[str],
    team_utilization: list[float],
    role_rows: list[dict[str, Any]],
    total_unmapped: list[float],
    thresholds: dict[str, float],
) -> dict[str, Any]:
    first_team_over = None
    first_role_over = None
    first_unmapped_over = None
    for idx, value in enumerate(team_utilization):
        if value > thresholds["teamUtilizationPct"]:
            first_team_over = idx
            break
    for idx, value in enumerate(total_unmapped):
        if value > thresholds["unmappedHoursPerWeek"]:
            first_unmapped_over = idx
            break
    role_overages: list[dict[str, Any]] = []
    for row in role_rows:
        utilizations = row.get("utilization") or []
        peak = max((float(v or 0.0) for v in utilizations), default=0.0)
        if peak > thresholds["roleUtilizationPct"]:
            role_overages.append(
                {
                    "roleId": row.get("roleId"),
                    "roleName": row.get("roleName"),
                    "peakUtilizationPct": round(peak, 2),
                }
            )
            if first_role_over is None:
                for idx, value in enumerate(utilizations):
                    if float(value or 0.0) > thresholds["roleUtilizationPct"]:
                        first_role_over = idx
                        break

    role_overages.sort(key=lambda item: float(item.get("peakUtilizationPct") or 0.0), reverse=True)
    top_bottlenecks = role_overages[:3]

    peak_team_util = max((float(v or 0.0) for v in team_utilization), default=0.0)
    peak_unmapped = max((float(v or 0.0) for v in total_unmapped), default=0.0)

    decision = "Go"
    reasons: list[str] = []
    if (
        peak_team_util > thresholds["teamUtilizationPct"] + 10.0
        or (top_bottlenecks and float(top_bottlenecks[0]["peakUtilizationPct"]) > thresholds["roleUtilizationPct"] + 10.0)
        or peak_unmapped > (thresholds["unmappedHoursPerWeek"] * 2.0)
    ):
        decision = "No-Go"
    elif (
        peak_team_util > thresholds["teamUtilizationPct"]
        or bool(top_bottlenecks)
        or peak_unmapped > thresholds["unmappedHoursPerWeek"]
    ):
        decision = "Caution"

    if first_team_over is not None and first_team_over < len(week_keys):
        reasons.append(f"Team utilization exceeds threshold on week {week_keys[first_team_over]}.")
    if first_role_over is not None and first_role_over < len(week_keys):
        reasons.append(f"Role utilization exceeds threshold on week {week_keys[first_role_over]}.")
    if first_unmapped_over is not None and first_unmapped_over < len(week_keys):
        reasons.append(f"Unmapped demand exceeds threshold on week {week_keys[first_unmapped_over]}.")
    if not reasons:
        reasons.append("No threshold exceedances detected in the selected horizon.")

    return {
        "decision": decision,
        "peakTeamUtilizationPct": round(peak_team_util, 2),
        "peakUnmappedHoursPerWeek": round(peak_unmapped, 2),
        "firstOverloadedWeek": (
            week_keys[min(v for v in [first_team_over, first_role_over, first_unmapped_over] if v is not None)]
            if any(v is not None for v in [first_team_over, first_role_over, first_unmapped_over])
            else None
        ),
        "bottleneckRoles": top_bottlenecks,
        "reasons": reasons,
    }


def _earliest_feasible_for_project(
    *,
    project_profile: dict[str, Any],
    week_keys: list[str],
    baseline_total: list[float],
    baseline_unmapped: list[float],
    baseline_by_role: dict[int, list[float]],
    capacity_total: list[float],
    capacity_by_role: dict[int, list[float]],
    thresholds: dict[str, float],
    start_idx_min: int,
) -> str | None:
    total_series = project_profile.get("totalSeries") or []
    role_series = project_profile.get("roleSeries") or {}
    unmapped_series = project_profile.get("unmappedSeries") or []
    if not total_series and not role_series:
        return week_keys[start_idx_min] if 0 <= start_idx_min < len(week_keys) else None

    for candidate_idx in range(max(0, start_idx_min), len(week_keys)):
        feasible = True
        for wk_idx in range(len(week_keys)):
            add_total = 0.0
            rel_idx = wk_idx - candidate_idx
            if 0 <= rel_idx < len(total_series):
                add_total = float(total_series[rel_idx] or 0.0)
            total_demand = float(baseline_total[wk_idx] or 0.0) + add_total
            cap = float(capacity_total[wk_idx] or 0.0)
            util = (total_demand / cap * 100.0) if cap > 0 else (100.0 if total_demand > 0 else 0.0)
            if util > thresholds["teamUtilizationPct"]:
                feasible = False
                break

            add_unmapped = 0.0
            if 0 <= rel_idx < len(unmapped_series):
                add_unmapped = float(unmapped_series[rel_idx] or 0.0)
            if float(baseline_unmapped[wk_idx] or 0.0) + add_unmapped > thresholds["unmappedHoursPerWeek"]:
                feasible = False
                break

            for role_id, series in role_series.items():
                role_add = float(series[rel_idx] or 0.0) if 0 <= rel_idx < len(series) else 0.0
                role_total = float((baseline_by_role.get(int(role_id)) or [0.0] * len(week_keys))[wk_idx] or 0.0) + role_add
                role_cap = float((capacity_by_role.get(int(role_id)) or [0.0] * len(week_keys))[wk_idx] or 0.0)
                role_util = (role_total / role_cap * 100.0) if role_cap > 0 else (100.0 if role_total > 0 else 0.0)
                if role_util > thresholds["roleUtilizationPct"]:
                    feasible = False
                    break
            if not feasible:
                break
        if feasible:
            return week_keys[candidate_idx]
    return None


def evaluate_forecast_planner(
    *,
    scope: PlannerScope,
    status_keys: list[str],
    projects_payload: list[dict[str, Any]],
    thresholds_payload: dict[str, Any] | None,
    use_probability_weighting: bool,
) -> dict[str, Any]:
    thresholds = _thresholds_with_defaults(thresholds_payload)
    status_key_set = set(status_keys)
    capacity_by_role, team_capacity, role_names = _capacity_by_role_and_team(scope)
    baseline_eval = _evaluate_baseline(
        scope=scope,
        status_keys=status_key_set,
    )
    baseline_by_role = baseline_eval.demand_by_role
    baseline_total = baseline_eval.baseline_total
    baseline_unmapped = baseline_eval.baseline_unmapped
    status_stats = baseline_eval.status_stats
    proposed_by_role, proposed_total, proposed_unmapped, project_profiles = _apply_proposed_projects(
        scope=scope,
        projects_payload=projects_payload,
        use_probability_weighting=use_probability_weighting,
    )
    if use_probability_weighting:
        _, proposed_total_conservative, _, _ = _apply_proposed_projects(
            scope=scope,
            projects_payload=projects_payload,
            use_probability_weighting=False,
        )
    else:
        proposed_total_conservative = list(proposed_total)

    role_ids = sorted(set(capacity_by_role.keys()) | set(baseline_by_role.keys()) | set(proposed_by_role.keys()))
    role_rows: list[dict[str, Any]] = []
    role_raw_rows: list[dict[str, Any]] = []
    for role_id in role_ids:
        cap_series = [float(v or 0.0) for v in (capacity_by_role.get(role_id) or [0.0] * scope.weeks)]
        base_series = [float(v or 0.0) for v in (baseline_by_role.get(role_id) or [0.0] * scope.weeks)]
        prop_series = [float(v or 0.0) for v in (proposed_by_role.get(role_id) or [0.0] * scope.weeks)]
        total_series = [float(base_series[i] or 0.0) + float(prop_series[i] or 0.0) for i in range(scope.weeks)]
        util_series = _series_ratio_pct(total_series, cap_series)
        role_name = role_names.get(role_id) or f"Role {role_id}"
        role_rows.append(
            {
                "roleId": role_id,
                "roleName": role_name,
                "capacity": _round_series(cap_series),
                "baselineDemand": _round_series(base_series),
                "proposedDemand": _round_series(prop_series),
                "totalDemand": _round_series(total_series),
                "utilization": _round_series(util_series),
            }
        )
        role_raw_rows.append(
            {
                "roleId": role_id,
                "roleName": role_name,
                "capacity": cap_series,
                "baselineDemand": base_series,
                "proposedDemand": prop_series,
                "totalDemand": total_series,
                "utilization": util_series,
            }
        )

    total_demand = [float(baseline_total[i] or 0.0) + float(proposed_total[i] or 0.0) for i in range(scope.weeks)]
    total_unmapped = [float(baseline_unmapped[i] or 0.0) + float(proposed_unmapped[i] or 0.0) for i in range(scope.weeks)]
    team_utilization = _series_ratio_pct(total_demand, team_capacity)

    recommendation = _build_recommendation(
        week_keys=scope.week_keys,
        team_utilization=team_utilization,
        role_rows=role_rows,
        total_unmapped=total_unmapped,
        thresholds=thresholds,
        )

    start_options: list[dict[str, Any]] = []
    feasible_start_rows: list[dict[str, Any]] = []
    week_index = {key: idx for idx, key in enumerate(scope.week_keys)}
    for project_profile in project_profiles:
        start_idx = int(project_profile.get("startIndex") or 0)
        earliest = _earliest_feasible_for_project(
            project_profile=project_profile,
            week_keys=scope.week_keys,
            baseline_total=baseline_total,
            baseline_unmapped=baseline_unmapped,
            baseline_by_role=baseline_by_role,
            capacity_total=team_capacity,
            capacity_by_role=capacity_by_role,
            thresholds=thresholds,
            start_idx_min=start_idx,
        )
        start_options.append(
            {
                "name": project_profile.get("name"),
                "templateId": project_profile.get("templateId"),
                "requestedStartDate": project_profile.get("requestedStartDate"),
                "earliestFeasibleStartDate": earliest,
            }
        )
        requested_start = project_profile.get("requestedStartDate")
        requested_idx = _index_for_start_date(scope.week_keys, requested_start)
        earliest_idx = week_index.get(str(earliest or ""), None)
        delay_weeks = (earliest_idx - requested_idx) if (earliest_idx is not None and earliest_idx >= requested_idx) else None
        feasible_start_rows.append(
            {
                "name": project_profile.get("name"),
                "templateId": project_profile.get("templateId"),
                "requestedStartDate": requested_start,
                "earliestFeasibleStartDate": earliest,
                "delayWeeks": delay_weeks,
            }
        )

    scheduled_included = [float(v or 0.0) for v in baseline_eval.scheduled_included]
    scheduled_excluded = [float(v or 0.0) for v in baseline_eval.scheduled_excluded]
    scheduled_total = _series_add(scheduled_included, scheduled_excluded)
    chart_total_demand = _series_add(scheduled_total, proposed_total)
    chart_team_utilization = _series_ratio_pct(chart_total_demand, team_capacity)

    confidence_expected = list(chart_total_demand)
    confidence_high = _series_add(scheduled_total, proposed_total_conservative)
    confidence_low = [
        max(float(scheduled_total[idx] or 0.0), (2.0 * float(confidence_expected[idx] or 0.0)) - float(confidence_high[idx] or 0.0))
        for idx in range(len(confidence_expected))
    ]
    if not use_probability_weighting:
        confidence_low = list(confidence_expected)
        confidence_high = list(confidence_expected)

    month_keys, month_buckets = _build_month_buckets(scope.week_keys)
    team_capacity_month = _rollup_sum(team_capacity, month_buckets)
    scheduled_included_month = _rollup_sum(scheduled_included, month_buckets)
    scheduled_excluded_month = _rollup_sum(scheduled_excluded, month_buckets)
    proposed_month = _rollup_sum(proposed_total, month_buckets)
    chart_total_demand_month = _rollup_sum(chart_total_demand, month_buckets)
    chart_team_utilization_month = _series_ratio_pct(chart_total_demand_month, team_capacity_month)
    baseline_unmapped_month = _rollup_sum(baseline_unmapped, month_buckets)
    proposed_unmapped_month = _rollup_sum(proposed_unmapped, month_buckets)
    total_unmapped_month = _rollup_sum(total_unmapped, month_buckets)
    delta_demand_weekly = _series_subtract(total_demand, baseline_total)
    delta_demand_month = _rollup_sum(delta_demand_weekly, month_buckets)
    confidence_expected_month = _rollup_sum(confidence_expected, month_buckets)
    confidence_low_month = _rollup_sum(confidence_low, month_buckets)
    confidence_high_month = _rollup_sum(confidence_high, month_buckets)

    department_ids = sorted(set(baseline_eval.department_included.keys()) | set(baseline_eval.department_excluded.keys()))
    department_name_by_id = {int(d.id): d.name for d in Department.objects.filter(id__in=department_ids).only("id", "name")}
    department_weekly: list[dict[str, Any]] = []
    department_monthly: list[dict[str, Any]] = []
    for dept_id in department_ids:
        included_series = baseline_eval.department_included.get(dept_id) or [0.0] * scope.weeks
        excluded_series = baseline_eval.department_excluded.get(dept_id) or [0.0] * scope.weeks
        total_series = _series_add(included_series, excluded_series)
        department_weekly.append(
            {
                "departmentId": int(dept_id),
                "departmentName": department_name_by_id.get(int(dept_id), f"Department {dept_id}"),
                "included": _round_series(included_series),
                "excluded": _round_series(excluded_series),
                "total": _round_series(total_series),
            }
        )
        department_monthly.append(
            {
                "departmentId": int(dept_id),
                "departmentName": department_name_by_id.get(int(dept_id), f"Department {dept_id}"),
                "included": _round_series(_rollup_sum(included_series, month_buckets)),
                "excluded": _round_series(_rollup_sum(excluded_series, month_buckets)),
                "total": _round_series(_rollup_sum(total_series, month_buckets)),
            }
        )

    role_rows_monthly: list[dict[str, Any]] = []
    for row in role_raw_rows:
        capacity_month = _rollup_sum(row["capacity"], month_buckets)
        baseline_month = _rollup_sum(row["baselineDemand"], month_buckets)
        proposed_month_role = _rollup_sum(row["proposedDemand"], month_buckets)
        total_month_role = _rollup_sum(row["totalDemand"], month_buckets)
        util_month = _series_ratio_pct(total_month_role, capacity_month)
        role_rows_monthly.append(
            {
                "roleId": row["roleId"],
                "roleName": row["roleName"],
                "capacity": _round_series(capacity_month),
                "baselineDemand": _round_series(baseline_month),
                "proposedDemand": _round_series(proposed_month_role),
                "totalDemand": _round_series(total_month_role),
                "utilization": _round_series(util_month),
            }
        )

    top_bottleneck_role_ids = [
        int(row["roleId"])
        for row in sorted(
            role_rows,
            key=lambda r: max((float(v or 0.0) for v in (r.get("utilization") or [])), default=0.0),
            reverse=True,
        )[:6]
    ]

    return {
        "weekKeys": scope.week_keys,
        "thresholds": thresholds,
        "totals": {
            "teamCapacity": _round_series(team_capacity),
            "baselineDemand": _round_series(baseline_total),
            "proposedDemand": _round_series(proposed_total),
            "totalDemand": _round_series(total_demand),
            "teamUtilization": _round_series(team_utilization),
            "baselineUnmapped": _round_series(baseline_unmapped),
            "proposedUnmapped": _round_series(proposed_unmapped),
            "totalUnmapped": _round_series(total_unmapped),
        },
        "roles": role_rows,
        "recommendation": recommendation,
        "statusStats": {
            key: {
                "projectCount": int(value.get("projectCount") or 0),
                "hours": round(float(value.get("hours") or 0.0), 2),
            }
            for key, value in sorted(status_stats.items(), key=lambda item: item[0])
        },
        "startOptions": start_options,
        "chartData": {
            "timeline": {
                "weekKeys": scope.week_keys,
                "monthKeys": month_keys,
            },
            "teamSeries": {
                "weekly": {
                    "capacity": _round_series(team_capacity),
                    "scheduledIncluded": _round_series(scheduled_included),
                    "scheduledExcluded": _round_series(scheduled_excluded),
                    "proposed": _round_series(proposed_total),
                    "totalDemand": _round_series(chart_total_demand),
                    "teamUtilizationPct": _round_series(chart_team_utilization),
                    "teamUtilizationThresholdPct": float(thresholds["teamUtilizationPct"]),
                },
                "monthly": {
                    "capacity": _round_series(team_capacity_month),
                    "scheduledIncluded": _round_series(scheduled_included_month),
                    "scheduledExcluded": _round_series(scheduled_excluded_month),
                    "proposed": _round_series(proposed_month),
                    "totalDemand": _round_series(chart_total_demand_month),
                    "teamUtilizationPct": _round_series(chart_team_utilization_month),
                    "teamUtilizationThresholdPct": float(thresholds["teamUtilizationPct"]),
                },
            },
            "statusSeries": {
                "weekly": {
                    "scheduledIncludedByWeek": _round_series(scheduled_included),
                    "scheduledExcludedByWeek": _round_series(scheduled_excluded),
                    "includedByStatusKey": {
                        key: _round_series(values)
                        for key, values in sorted(baseline_eval.included_by_status.items(), key=lambda item: item[0])
                    },
                    "excludedByStatusKey": {
                        key: _round_series(values)
                        for key, values in sorted(baseline_eval.excluded_by_status.items(), key=lambda item: item[0])
                    },
                },
                "monthly": {
                    "scheduledIncludedByWeek": _round_series(scheduled_included_month),
                    "scheduledExcludedByWeek": _round_series(scheduled_excluded_month),
                    "includedByStatusKey": _rollup_series_map(
                        dict(sorted(baseline_eval.included_by_status.items(), key=lambda item: item[0])),
                        month_buckets,
                    ),
                    "excludedByStatusKey": _rollup_series_map(
                        dict(sorted(baseline_eval.excluded_by_status.items(), key=lambda item: item[0])),
                        month_buckets,
                    ),
                },
            },
            "roleSeries": {
                "topBottleneckRoleIds": top_bottleneck_role_ids,
                "weekly": role_rows,
                "monthly": role_rows_monthly,
            },
            "departmentSeries": {
                "weekly": department_weekly,
                "monthly": department_monthly,
            },
            "unmappedSeries": {
                "thresholdPerWeek": float(thresholds["unmappedHoursPerWeek"]),
                "thresholdPerMonth": [round(float(thresholds["unmappedHoursPerWeek"]) * float(len(bucket)), 2) for bucket in month_buckets],
                "weekly": {
                    "baselineUnmapped": _round_series(baseline_unmapped),
                    "proposedUnmapped": _round_series(proposed_unmapped),
                    "totalUnmapped": _round_series(total_unmapped),
                },
                "monthly": {
                    "baselineUnmapped": _round_series(baseline_unmapped_month),
                    "proposedUnmapped": _round_series(proposed_unmapped_month),
                    "totalUnmapped": _round_series(total_unmapped_month),
                },
            },
            "impactSeries": {
                "weekly": {
                    "deltaDemand": _round_series(delta_demand_weekly),
                },
                "monthly": {
                    "deltaDemand": _round_series(delta_demand_month),
                },
            },
            "feasibleStarts": {
                "rows": feasible_start_rows,
            },
            "confidenceSeries": {
                "enabled": bool(use_probability_weighting),
                "weekly": {
                    "expectedDemandByWeek": _round_series(confidence_expected),
                    "lowDemandByWeek": _round_series(confidence_low),
                    "highDemandByWeek": _round_series(confidence_high),
                },
                "monthly": {
                    "expectedDemandByWeek": _round_series(confidence_expected_month),
                    "lowDemandByWeek": _round_series(confidence_low_month),
                    "highDemandByWeek": _round_series(confidence_high_month),
                },
            },
        },
    }
