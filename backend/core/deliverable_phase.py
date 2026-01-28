"""
Deliverable phase classification helper shared between analytics and snapshots.

Rules:
- Forward-select the next deliverable at/after the target week (Sunday key).
- Monday exception: if the chosen deliverable falls on Monday and equals the
  current week, attribute to the next deliverable instead.
- Active-CA override: if project status is 'active_ca' treat the week as 'ca'
  if no next deliverable exists.

Returns phase keys as strings (controlled vocabulary + user-defined phases).
"""
from __future__ import annotations

from datetime import date
from typing import Iterable, List, Optional, Sequence, Tuple, Dict, Any
from django.core.cache import cache
import re
from core.choices import DeliverablePhase
from core.week_utils import sunday_of_week


_PHASE_MAPPING_CACHE_KEY = 'deliverable_phase_mapping_settings'
_PHASE_MAPPING_CACHE_TTL = 300  # seconds


def clear_phase_mapping_cache() -> None:
    try:
        cache.delete(_PHASE_MAPPING_CACHE_KEY)
    except Exception:  # nosec B110
        pass


def _load_phase_mapping() -> Dict[str, Any]:
    cached = cache.get(_PHASE_MAPPING_CACHE_KEY)
    if cached:
        return cached
    try:
        from core.models import DeliverablePhaseMappingSettings, DeliverablePhaseDefinition
        obj = DeliverablePhaseMappingSettings.get_active()
        phases = list(DeliverablePhaseDefinition.objects.all().order_by('sort_order', 'id'))
        data = {
            'use_description_match': bool(obj.use_description_match),
            'phases': [
                {
                    'key': p.key,
                    'label': p.label,
                    'tokens': p.description_tokens or [],
                    'range_min': p.range_min,
                    'range_max': p.range_max,
                    'sort_order': p.sort_order,
                }
                for p in phases
            ],
        }
    except Exception:  # nosec B110
        data = {
            'use_description_match': True,
            'phases': [
                {'key': 'sd', 'label': 'SD', 'tokens': ['sd', 'schematic'], 'range_min': 0, 'range_max': 40, 'sort_order': 0},
                {'key': 'dd', 'label': 'DD', 'tokens': ['dd', 'design development'], 'range_min': 41, 'range_max': 89, 'sort_order': 1},
                {'key': 'ifp', 'label': 'IFP', 'tokens': ['ifp'], 'range_min': 90, 'range_max': 99, 'sort_order': 2},
                {'key': 'ifc', 'label': 'IFC', 'tokens': ['ifc'], 'range_min': 100, 'range_max': 100, 'sort_order': 3},
            ],
        }
    try:
        cache.set(_PHASE_MAPPING_CACHE_KEY, data, _PHASE_MAPPING_CACHE_TTL)
    except Exception:  # nosec B110
        pass
    return data


def _token_match(desc: str, tokens: List[str]) -> bool:
    if not tokens:
        return False
    if not desc:
        return False
    for token in tokens:
        if not token:
            continue
        # Use word boundary for short tokens; substring for multi-word tokens
        if ' ' in token or len(token) > 3:
            if token in desc:
                return True
        else:
            if re.search(rf"\b{re.escape(token)}\b", desc):
                return True
    return False


def _classify_from_desc_pct(desc: Optional[str], pct: Optional[int]) -> str:
    d = (desc or '').strip().lower()
    if d:
        d = re.sub(r'\s+', ' ', d)
    if 'bulletin' in d or 'addendum' in d:
        return DeliverablePhase.BULLETINS.value
    if 'masterplan' in d or 'master plan' in d or 'masterplanning' in d:
        return DeliverablePhase.MASTERPLAN.value

    mapping = _load_phase_mapping()
    phases = mapping.get('phases', []) or []
    phases_sorted = sorted(phases, key=lambda p: p.get('sort_order', 0))
    if mapping.get('use_description_match'):
        for phase in phases_sorted:
            if _token_match(d, phase.get('tokens', [])):
                return str(phase.get('key'))

    try:
        if pct is not None:
            p = int(pct)
            for phase in phases_sorted:
                rmin = phase.get('range_min')
                rmax = phase.get('range_max')
                if rmin is None or rmax is None:
                    continue
                if rmin <= p <= rmax:
                    return str(phase.get('key'))
    except Exception:  # nosec B110
        pass
    return DeliverablePhase.OTHER.value


def classify_deliverable_phase(desc: Optional[str], pct: Optional[int]) -> str:
    """Classify a deliverable directly from description and percentage."""
    return _classify_from_desc_pct(desc, pct)


def _normalize_deliverables(deliverables: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for r in deliverables:
        dt = r.get('date')
        wk = None
        is_monday = False
        if dt:
            try:
                wk = sunday_of_week(dt).isoformat()
                is_monday = (dt.weekday() == 0)
            except Exception:
                wk = None
                is_monday = False
        out.append({
            'wk': wk,
            'pct': r.get('percentage'),
            'desc': (r.get('description') or '').strip(),
            'is_monday': is_monday,
        })
    out.sort(key=lambda x: (x['wk'] or '0000-00-00'))
    return out


def classify_week_for_project(
    week_key: str,
    project_status: Optional[str],
    deliverables: Iterable[Dict[str, Any]],
) -> str:
    """Classify a single Sunday week for a project using forward selection.

    - Uses the Monday exception.
    - If no next deliverable exists and status == 'active_ca', returns CA.
    - Otherwise falls back to the last deliverable's classification if any; if
      no deliverables at all, returns OTHER.
    """
    rows_list = list(deliverables)
    if rows_list and isinstance(rows_list[0], dict) and {'wk', 'pct', 'desc'}.issubset(rows_list[0].keys()):
        rows = rows_list
    else:
        rows = _normalize_deliverables(rows_list)
    # Pointer to first deliverable with week >= target week
    # Build indices array for comparison
    idx_rows: List[Tuple[int, Dict[str, Any]]] = []
    # We don't have week_keys -> construct a synthetic compare index by mapping
    # wk string to relative order: we can compare iso strings directly
    # Find first index with wk >= week_key
    chosen = None
    for i, r in enumerate(rows):
        wk = r.get('wk')
        if wk is None:
            continue
        if wk >= week_key:
            chosen = i
            break
    if chosen is None:
        # No next deliverable
        if (project_status or '').lower() == 'active_ca':
            return DeliverablePhase.CA.value
        # Fallback to last deliverable if any
        if rows:
            last = rows[-1]
            return _classify_from_desc_pct(last.get('desc'), last.get('pct'))
        return DeliverablePhase.OTHER.value

    # Monday exception when chosen deliverable falls on Monday and equals week
    try:
        chosen_row = rows[chosen]
        if chosen_row.get('is_monday') and chosen_row.get('wk') == week_key and chosen < (len(rows) - 1):
            chosen = chosen + 1
            chosen_row = rows[chosen]
    except Exception:
        chosen_row = rows[chosen]
    return _classify_from_desc_pct(chosen_row.get('desc'), chosen_row.get('pct'))


def build_project_week_classification(
    week_keys: Sequence[str],
    project_status: Optional[str],
    deliverables: Iterable[Dict[str, Any]],
) -> List[str]:
    """Return a list of phase keys for each week key."""
    rows = _normalize_deliverables(deliverables)
    out: List[str] = []
    for wk in week_keys:
        # Reuse single-week classifier to avoid duplicating logic.
        phase = classify_week_for_project(wk, project_status, rows)
        out.append(phase)
    return out
