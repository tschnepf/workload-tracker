from __future__ import annotations

from typing import Dict, List, Tuple
from datetime import date
from django.db import connection
from django.db.models import Q, QuerySet
from django.conf import settings

from people.models import Person
from .models import Assignment as Asn
from roles.models import Role
from core.models import AutoHoursRoleSetting, AutoHoursTemplateRoleSetting


def _python_role_capacity(
    dept_id: int | None,
    week_keys: List[date],
    role_ids: List[int] | None,
    vertical_id: int | None = None,
) -> Tuple[List[str], List[Dict], List[Dict], Dict]:
    """Optimized Python implementation (portable across DB vendors).

    Returns (week_keys_str, roles_payload, series_payload).
    """
    wk_strs = [wk.strftime('%Y-%m-%d') for wk in week_keys]

    # Roles list (stable order)
    if role_ids:
        roles = list(Role.objects.filter(id__in=role_ids, is_active=True).order_by('sort_order', 'name'))
    else:
        roles = list(Role.objects.filter(is_active=True).order_by('sort_order', 'name'))
        role_ids = [r.id for r in roles]

    roles_payload = [{'id': r.id, 'name': r.name} for r in roles]

    # Capacity per role/week (hire-date gated)
    people_qs: QuerySet[Person] = Person.objects.filter(is_active=True)
    if dept_id is not None:
        people_qs = people_qs.filter(department_id=dept_id)
    if vertical_id is not None:
        people_qs = people_qs.filter(department__vertical_id=vertical_id)
    people_qs = people_qs.only('id', 'role_id', 'weekly_capacity', 'hire_date')
    people_by_role: Dict[int, List[Tuple[int, date | None]]] = {}
    for p in people_qs.iterator():
        rid = getattr(p, 'role_id', None)
        if not rid:
            continue
        if role_ids and rid not in role_ids:
            continue
        people_by_role.setdefault(rid, []).append((int(getattr(p, 'weekly_capacity', 0) or 0), getattr(p, 'hire_date', None)))

    caps: Dict[Tuple[str, int], float] = {}
    heads: Dict[Tuple[str, int], int] = {}
    for rid, lst in people_by_role.items():
        for wk in week_keys:
            total = 0.0
            count = 0
            for cap, hire in lst:
                if hire and hire > wk:
                    continue
                total += float(cap or 0)
                count += 1
            k = (wk.strftime('%Y-%m-%d'), rid)
            caps[k] = total
            heads[k] = count

    # Assigned hours: iterate only requested week keys; string compare for hire gating
    asn_qs = Asn.objects.filter(is_active=True, person__is_active=True)
    if dept_id is not None:
        asn_qs = asn_qs.filter(person__department_id=dept_id)
    if vertical_id is not None:
        asn_qs = asn_qs.filter(project__vertical_id=vertical_id)
    asn_qs = asn_qs.select_related('person').only('id', 'weekly_hours', 'person__id', 'person__role_id', 'person__hire_date', 'person__is_active')
    assigned: Dict[Tuple[str, int], float] = {}
    for a in asn_qs.iterator():
        rid = getattr(a.person, 'role_id', None)
        if not rid:
            continue
        if role_ids and rid not in role_ids:
            continue
        wh = getattr(a, 'weekly_hours', None) or {}
        hire = getattr(a.person, 'hire_date', None)
        hire_str = hire.isoformat() if hire else None
        for k in wk_strs:
            if hire_str and k < hire_str:
                continue
            try:
                v = wh.get(k)
                hours = float(v or 0.0)
            except Exception:
                hours = 0.0
            if hours <= 0:
                continue
            assigned[(k, rid)] = assigned.get((k, rid), 0.0) + hours

    projected: Dict[Tuple[str, int], float] = {}
    mapped_projected_hours = 0.0
    unmapped_project_role_hours = 0.0
    mapped_template_role_pairs_used: set[tuple[int, int]] = set()

    if bool(settings.FEATURES.get('FF_ROLE_CAPACITY_TEMPLATE_ROLE_MAPPING', True)):
        placeholder_qs = Asn.objects.filter(
            is_active=True,
            person_id__isnull=True,
            role_on_project_ref_id__isnull=False,
        )
        if dept_id is not None:
            placeholder_qs = placeholder_qs.filter(
                Q(department_id=dept_id) | Q(role_on_project_ref__department_id=dept_id)
            )
        if vertical_id is not None:
            placeholder_qs = placeholder_qs.filter(project__vertical_id=vertical_id)
        placeholder_qs = placeholder_qs.select_related('project').only(
            'weekly_hours',
            'role_on_project_ref_id',
            'project__auto_hours_template_id',
            'department_id',
        )

        assignments = list(placeholder_qs.iterator())
        template_ids = sorted(
            {
                int(a.project.auto_hours_template_id)
                for a in assignments
                if getattr(a, 'project', None) and getattr(a.project, 'auto_hours_template_id', None)
            }
        )
        project_role_ids = sorted(
            {int(a.role_on_project_ref_id) for a in assignments if getattr(a, 'role_on_project_ref_id', None)}
        )
        template_mapping: Dict[tuple[int, int], List[int]] = {}
        global_mapping: Dict[int, List[int]] = {}
        if template_ids and project_role_ids:
            settings_rows = AutoHoursTemplateRoleSetting.objects.filter(
                template_id__in=template_ids,
                role_id__in=project_role_ids,
            ).prefetch_related('people_roles')
            for row in settings_rows:
                people_role_ids = sorted(int(rid) for rid in row.people_roles.values_list('id', flat=True))
                template_mapping[(int(row.template_id), int(row.role_id))] = people_role_ids
        if project_role_ids:
            global_rows = AutoHoursRoleSetting.objects.filter(
                role_id__in=project_role_ids,
            ).prefetch_related('people_roles')
            for row in global_rows:
                people_role_ids = sorted(int(rid) for rid in row.people_roles.values_list('id', flat=True))
                global_mapping[int(row.role_id)] = people_role_ids

        for asn in assignments:
            project = getattr(asn, 'project', None)
            template_id = int(project.auto_hours_template_id) if project and project.auto_hours_template_id else None
            project_role_id = int(asn.role_on_project_ref_id) if asn.role_on_project_ref_id else None
            if not project_role_id:
                continue
            mapped_people_roles: List[int] = []
            mapped_key: tuple[int, int] | None = None
            if template_id:
                key = (template_id, project_role_id)
                mapped_people_roles = template_mapping.get(key) or []
                if mapped_people_roles:
                    mapped_key = key
            else:
                mapped_people_roles = global_mapping.get(project_role_id) or []
                if mapped_people_roles:
                    mapped_key = (0, project_role_id)
            wh = getattr(asn, 'weekly_hours', None) or {}
            for wk in wk_strs:
                try:
                    hours = float(wh.get(wk) or 0.0)
                except Exception:
                    hours = 0.0
                if hours <= 0:
                    continue
                if not mapped_people_roles:
                    unmapped_project_role_hours += hours
                    continue
                if mapped_key is not None:
                    mapped_template_role_pairs_used.add(mapped_key)
                mapped_projected_hours += hours
                split = hours / float(len(mapped_people_roles))
                for rid in mapped_people_roles:
                    if role_ids and rid not in role_ids:
                        continue
                    projected[(wk, rid)] = projected.get((wk, rid), 0.0) + split

    series: List[Dict] = []
    for r in roles:
        assigned_series = [float(assigned.get((wk, r.id), 0.0)) for wk in wk_strs]
        projected_series = [float(projected.get((wk, r.id), 0.0)) for wk in wk_strs]
        demand_series = [float(assigned_series[i] + projected_series[i]) for i in range(len(wk_strs))]
        series.append({
            'roleId': r.id,
            'roleName': r.name,
            'assigned': assigned_series,
            'projected': projected_series,
            'demand': demand_series,
            'capacity': [float(caps.get((wk, r.id), 0.0)) for wk in wk_strs],
            'people': [int(heads.get((wk, r.id), 0)) for wk in wk_strs],
        })

    summary = {
        'mappedProjectedHours': round(mapped_projected_hours, 2),
        'unmappedProjectRoleHours': round(unmapped_project_role_hours, 2),
        'mappedTemplateRolePairsUsed': len(mapped_template_role_pairs_used),
    }
    return wk_strs, roles_payload, series, summary


def _postgres_role_capacity(
    dept_id: int | None,
    week_keys: List[date],
    role_ids: List[int] | None,
    vertical_id: int | None = None,
) -> Tuple[List[str], List[Dict], List[Dict], Dict]:
    """Postgres JSONB implementation using lateral expansion and GIN prefilter.
    If anything goes wrong, callers should fallback to the Python path.
    """
    wk_strs = [wk.strftime('%Y-%m-%d') for wk in week_keys]

    # Roles
    if role_ids:
        roles = list(Role.objects.filter(id__in=role_ids, is_active=True).order_by('sort_order', 'name'))
    else:
        roles = list(Role.objects.filter(is_active=True).order_by('sort_order', 'name'))
        role_ids = [r.id for r in roles]
    roles_payload = [{'id': r.id, 'name': r.name} for r in roles]

    # Capacity (kept in ORM for clarity/perf suffices)
    people_qs: QuerySet[Person] = Person.objects.filter(is_active=True)
    if dept_id is not None:
        people_qs = people_qs.filter(department_id=dept_id)
    if vertical_id is not None:
        people_qs = people_qs.filter(department__vertical_id=vertical_id)
    people_qs = people_qs.only('id', 'role_id', 'weekly_capacity', 'hire_date')
    people_by_role: Dict[int, List[Tuple[int, date | None]]] = {}
    for p in people_qs.iterator():
        rid = getattr(p, 'role_id', None)
        if not rid:
            continue
        if role_ids and rid not in role_ids:
            continue
        people_by_role.setdefault(rid, []).append((int(getattr(p, 'weekly_capacity', 0) or 0), getattr(p, 'hire_date', None)))

    caps: Dict[Tuple[str, int], float] = {}
    heads: Dict[Tuple[str, int], int] = {}
    for rid, lst in people_by_role.items():
        for wk in week_keys:
            total = 0.0
            count = 0
            for cap, hire in lst:
                if hire and hire > wk:
                    continue
                total += float(cap or 0)
                count += 1
            k = (wk.strftime('%Y-%m-%d'), rid)
            caps[k] = total
            heads[k] = count

    # Assigned hours via raw SQL
    assigned: Dict[Tuple[str, int], float] = {}
    with connection.cursor() as cur:
        base_sql = (
            """
            SELECT j.key AS wk, p.role_id, SUM(GREATEST(0, COALESCE(NULLIF(j.value,'')::numeric, 0))) AS hours
            FROM assignments_assignment a
            JOIN people_person p ON p.id = a.person_id
            WHERE a.is_active = TRUE
              AND p.is_active = TRUE
            
              AND a.weekly_hours ?| %s
            CROSS JOIN LATERAL jsonb_each_text(a.weekly_hours) AS j(key, value)
            WHERE j.key = ANY(%s)
              AND (%s IS NULL OR p.role_id = ANY(%s))
              AND (p.hire_date IS NULL OR j.key >= p.hire_date::text)
            GROUP BY j.key, p.role_id
            """
        )
        # Add department filter dynamically when provided
        if dept_id is not None:
            sql = base_sql.replace("WHERE a.is_active = TRUE\n              AND p.is_active = TRUE\n", "WHERE a.is_active = TRUE\n              AND p.is_active = TRUE\n              AND p.department_id = %s\n")
            params = [wk_strs, wk_strs, None if not role_ids else role_ids, None if not role_ids else role_ids]
            params = [dept_id] + params
        else:
            sql = base_sql
            params = [wk_strs, wk_strs, None if not role_ids else role_ids, None if not role_ids else role_ids]
        cur.execute(sql, params)
        for wk, rid, hours in cur.fetchall():
            if rid is None:
                continue
            assigned[(wk, int(rid))] = float(hours or 0.0)

    series: List[Dict] = []
    for r in roles:
        assigned_series = [float(assigned.get((wk, r.id), 0.0)) for wk in wk_strs]
        series.append({
            'roleId': r.id,
            'roleName': r.name,
            'assigned': assigned_series,
            'projected': [0.0 for _ in wk_strs],
            'demand': assigned_series,
            'capacity': [float(caps.get((wk, r.id), 0.0)) for wk in wk_strs],
            'people': [int(heads.get((wk, r.id), 0)) for wk in wk_strs],
        })

    summary = {
        'mappedProjectedHours': 0.0,
        'unmappedProjectRoleHours': 0.0,
        'mappedTemplateRolePairsUsed': 0,
    }
    return wk_strs, roles_payload, series, summary


def compute_role_capacity(
    dept_id: int | None,
    week_keys: List[date],
    role_ids: List[int] | None,
    vertical_id: int | None = None,
) -> Tuple[List[str], List[Dict], List[Dict], Dict]:
    """Dispatch to the best implementation based on DB vendor.
    Falls back safely to the Python path if Postgres query fails.
    """
    if bool(settings.FEATURES.get('FF_ROLE_CAPACITY_TEMPLATE_ROLE_MAPPING', True)):
        return _python_role_capacity(dept_id, week_keys, role_ids, vertical_id=vertical_id)
    if vertical_id is not None:
        return _python_role_capacity(dept_id, week_keys, role_ids, vertical_id=vertical_id)
    if connection.vendor == 'postgresql':
        try:
            return _postgres_role_capacity(dept_id, week_keys, role_ids, vertical_id=None)
        except Exception:
            # Fall back to Python path on any SQL/driver error
            return _python_role_capacity(dept_id, week_keys, role_ids, vertical_id=None)
    return _python_role_capacity(dept_id, week_keys, role_ids, vertical_id=None)
