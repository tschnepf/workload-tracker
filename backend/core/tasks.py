"""
Celery background tasks for heavy aggregations.
"""
from __future__ import annotations

from typing import Dict, List, Any, Optional
from datetime import date, timedelta

from celery import shared_task
from django.db.models import Prefetch


@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=2, retry_kwargs={"max_retries": 3}, soft_time_limit=120)
def generate_grid_snapshot_async(self, weeks: int = 12, department: Optional[int] = None, include_children: int = 0) -> Dict[str, Any]:
    """Generate the same payload as /assignments/grid_snapshot/ in the background.

    Returns a dict with keys: { weekKeys, people, hoursByPerson }.
    """
    from people.models import Person  # local import for task autodiscovery safety
    from departments.models import Department
    from assignments.models import Assignment

    # clamp weeks 1..26
    weeks = max(1, min(int(weeks or 12), 26))

    people_qs = Person.objects.filter(is_active=True).select_related('department')
    if department is not None:
        try:
            dept_id = int(department)
        except Exception:
            dept_id = None
        if dept_id is not None:
            if int(include_children or 0) == 1:
                ids = set()
                stack = [dept_id]
                while stack:
                    current = stack.pop()
                    if current in ids:
                        continue
                    ids.add(current)
                    for d in Department.objects.filter(parent_department_id=current).values_list('id', flat=True):
                        if d not in ids:
                            stack.append(d)
                people_qs = people_qs.filter(department_id__in=list(ids))
            else:
                people_qs = people_qs.filter(department_id=dept_id)

    asn_qs = Assignment.objects.filter(is_active=True).only('weekly_hours', 'person_id')
    people_qs = people_qs.prefetch_related(Prefetch('assignments', queryset=asn_qs))

    # Sundays for requested horizon (Sunday-only policy)
    from core.week_utils import sunday_of_week
    today = date.today()
    start_sunday = sunday_of_week(today)
    week_keys = [(start_sunday + timedelta(weeks=w)).isoformat() for w in range(weeks)]

    # helper: tolerate +/- 3 days against provided Monday key
    def hours_for_week_from_json(weekly_hours: dict, sunday_key: str) -> float:
        if not weekly_hours:
            return 0.0
        try:
            return float(weekly_hours.get(sunday_key) or 0)
        except Exception:
            return 0.0

    total = max(1, people_qs.count())
    processed = 0

    people_list: List[Dict[str, Any]] = []
    hours_by_person: Dict[int, Dict[str, float]] = {}

    try:
        for p in people_qs.iterator():
            people_list.append({
                'id': p.id,
                'name': p.name,
                'weeklyCapacity': p.weekly_capacity or 0,
                'department': p.department_id,
            })
            wk_map: Dict[str, float] = {}
            for wk in week_keys:
                wk_total = 0.0
                for a in getattr(p, 'assignments').all():
                    wk_total += hours_for_week_from_json(a.weekly_hours or {}, wk)
                if wk_total != 0.0:
                    wk_map[wk] = round(wk_total, 2)
            hours_by_person[p.id] = wk_map

            processed += 1
            if processed % 25 == 0 or processed == total:
                try:
                    self.update_state(state='PROGRESS', meta={'progress': int(processed * 100 / total), 'message': f'Processed {processed}/{total} people'})
                except Exception:
                    pass
    except Exception as e:
        try:
            import sentry_sdk  # type: ignore
            sentry_sdk.capture_exception(e)
        except Exception:
            pass
        raise

    return {'weekKeys': week_keys, 'people': people_list, 'hoursByPerson': hours_by_person}


@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=2, retry_kwargs={"max_retries": 3}, soft_time_limit=120)
def bulk_skill_matching_async(self, skills: List[str], filters: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Run skill matching in the background with optional availability blending.

    filters may include: department (int), include_children (0|1), limit (int up to 200), week (YYYY-MM-DD).
    """
    from people.models import Person
    from skills.models import PersonSkill, SkillTag
    from assignments.models import Assignment
    from departments.models import Department
    from datetime import datetime as _dt, timedelta as _td

    req_skills = [s.strip().lower() for s in (skills or []) if s and s.strip()]
    if not req_skills:
        return []

    limit = int(filters.get('limit', 50))
    limit = 50 if limit <= 0 else min(limit, 200)

    week_monday = None
    if filters.get('week'):
        try:
            d = _dt.strptime(str(filters['week']), '%Y-%m-%d').date()
            week_monday = d - _td(days=d.weekday())
        except Exception:
            week_monday = None

    people_qs = Person.objects.filter(is_active=True).select_related('department', 'role')
    dept_param = filters.get('department')
    include_children = int(filters.get('include_children') or 0) == 1
    if dept_param not in (None, ""):
        try:
            dept_id = int(dept_param)
            if include_children:
                ids = set()
                stack = [dept_id]
                while stack:
                    current = stack.pop()
                    if current in ids:
                        continue
                    ids.add(current)
                    for d in Department.objects.filter(parent_department_id=current).values_list('id', flat=True):
                        if d not in ids:
                            stack.append(d)
                people_qs = people_qs.filter(department_id__in=list(ids))
            else:
                people_qs = people_qs.filter(department_id=dept_id)
        except Exception:
            pass

    skill_qs = PersonSkill.objects.select_related('skill_tag')
    prefetches = [Prefetch('skills', queryset=skill_qs)]
    if week_monday is not None:
        asn_qs = Assignment.objects.filter(is_active=True).only('weekly_hours', 'person_id')
        prefetches.append(Prefetch('assignments', queryset=asn_qs))
    people_qs = people_qs.prefetch_related(*prefetches)

    results: List[Dict[str, Any]] = []
    total = max(1, people_qs.count())
    processed = 0
    try:
        for p in people_qs.iterator():
            # skills names lower
            skill_names: List[str] = []
            for ps in getattr(p, 'skills').all():
                if ps.skill_tag and ps.skill_tag.name:
                    skill_names.append(ps.skill_tag.name.lower())

            matched: List[str] = []
            missing: List[str] = []
            for rs in req_skills:
                ok = any((rs in sn) or (sn in rs) for sn in skill_names)
                (matched if ok else missing).append(rs)

            base_score = (len(matched) / len(req_skills)) * 100.0 if req_skills else 0.0

            if week_monday is not None:
                cap = float(p.weekly_capacity or 0)
                if cap > 0:
                    wk_key = week_monday.strftime('%Y-%m-%d')
                    allocated = 0.0
                    for a in getattr(p, 'assignments').all():
                        wh = a.weekly_hours or {}
                        val = 0.0
                        if wk_key in wh:
                            try:
                                val = float(wh[wk_key] or 0)
                            except Exception:
                                val = 0.0
                        else:
                            for off in range(-3, 4):
                                d = week_monday + _td(days=off)
                                k = d.strftime('%Y-%m-%d')
                                if k in wh:
                                    try:
                                        val = float(wh[k] or 0)
                                    except Exception:
                                        val = 0.0
                                    break
                        allocated += val
                    avail_pct = max(0.0, (cap - allocated) / cap * 100.0)
                    base_score = 0.7 * base_score + 0.3 * avail_pct

            results.append({
                'personId': p.id,
                'name': p.name,
                'score': round(base_score, 1),
                'matchedSkills': matched,
                'missingSkills': missing,
                'departmentId': p.department_id,
                'roleName': getattr(p.role, 'name', None) if getattr(p, 'role', None) else None,
            })

            processed += 1
            if processed % 50 == 0 or processed == total:
                try:
                    self.update_state(state='PROGRESS', meta={'progress': int(processed * 100 / total)})
                except Exception:
                    pass
    except Exception as e:
        try:
            import sentry_sdk  # type: ignore
            sentry_sdk.capture_exception(e)
        except Exception:
            pass
        raise

    results.sort(key=lambda x: (-x['score'], x['name']))
    return results[:limit]
