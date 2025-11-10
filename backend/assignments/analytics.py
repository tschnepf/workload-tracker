from __future__ import annotations

from typing import Dict, List, Tuple
from datetime import date
from django.db import connection
from django.db.models import QuerySet

from people.models import Person
from .models import Assignment as Asn
from roles.models import Role


def _python_role_capacity(
    dept_id: int | None,
    week_keys: List[date],
    role_ids: List[int] | None,
) -> Tuple[List[str], List[Dict], List[Dict]]:
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

    series: List[Dict] = []
    for r in roles:
        series.append({
            'roleId': r.id,
            'roleName': r.name,
            'assigned': [float(assigned.get((wk, r.id), 0.0)) for wk in wk_strs],
            'capacity': [float(caps.get((wk, r.id), 0.0)) for wk in wk_strs],
            'people': [int(heads.get((wk, r.id), 0)) for wk in wk_strs],
        })

    return wk_strs, roles_payload, series


def _postgres_role_capacity(
    dept_id: int | None,
    week_keys: List[date],
    role_ids: List[int] | None,
) -> Tuple[List[str], List[Dict], List[Dict]]:
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
        series.append({
            'roleId': r.id,
            'roleName': r.name,
            'assigned': [float(assigned.get((wk, r.id), 0.0)) for wk in wk_strs],
            'capacity': [float(caps.get((wk, r.id), 0.0)) for wk in wk_strs],
            'people': [int(heads.get((wk, r.id), 0)) for wk in wk_strs],
        })

    return wk_strs, roles_payload, series


def compute_role_capacity(
    dept_id: int | None,
    week_keys: List[date],
    role_ids: List[int] | None,
) -> Tuple[List[str], List[Dict], List[Dict]]:
    """Dispatch to the best implementation based on DB vendor.
    Falls back safely to the Python path if Postgres query fails.
    """
    if connection.vendor == 'postgresql':
        try:
            return _postgres_role_capacity(dept_id, week_keys, role_ids)
        except Exception:
            # Fall back to Python path on any SQL/driver error
            return _python_role_capacity(dept_id, week_keys, role_ids)
    return _python_role_capacity(dept_id, week_keys, role_ids)
