"""
Deliverable phase classification helper shared between analytics and snapshots.

Rules:
- Forward-select the next deliverable at/after the target week (Sunday key).
- Monday exception: if the chosen deliverable falls on Monday and equals the
  current week, attribute to the next deliverable instead.
- Active-CA override: if project status is 'active_ca' treat the week as 'ca'
  if no next deliverable exists.

Returns values from DeliverablePhase (controlled vocabulary).
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
        from core.models import DeliverablePhaseMappingSettings
        obj = DeliverablePhaseMappingSettings.get_active()
        data = {
            'use_description_match': bool(obj.use_description_match),
            'desc_sd_tokens': obj.desc_sd_tokens or [],
            'desc_dd_tokens': obj.desc_dd_tokens or [],
            'desc_ifp_tokens': obj.desc_ifp_tokens or [],
            'desc_ifc_tokens': obj.desc_ifc_tokens or [],
            'range_sd_min': int(obj.range_sd_min),
            'range_sd_max': int(obj.range_sd_max),
            'range_dd_min': int(obj.range_dd_min),
            'range_dd_max': int(obj.range_dd_max),
            'range_ifp_min': int(obj.range_ifp_min),
            'range_ifp_max': int(obj.range_ifp_max),
            'range_ifc_exact': int(obj.range_ifc_exact),
        }
    except Exception:  # nosec B110
        data = {
            'use_description_match': True,
            'desc_sd_tokens': ['sd', 'schematic'],
            'desc_dd_tokens': ['dd', 'design development'],
            'desc_ifp_tokens': ['ifp'],
            'desc_ifc_tokens': ['ifc'],
            'range_sd_min': 1,
            'range_sd_max': 40,
            'range_dd_min': 41,
            'range_dd_max': 89,
            'range_ifp_min': 90,
            'range_ifp_max': 99,
            'range_ifc_exact': 100,
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


def _classify_from_desc_pct(desc: Optional[str], pct: Optional[int]) -> DeliverablePhase:
    d = (desc or '').strip().lower()
    if d:
        d = re.sub(r'\s+', ' ', d)
    if 'bulletin' in d or 'addendum' in d:
        return DeliverablePhase.BULLETINS
    if 'masterplan' in d or 'master plan' in d or 'masterplanning' in d:
        return DeliverablePhase.MASTERPLAN

    mapping = _load_phase_mapping()
    if mapping.get('use_description_match'):
        if _token_match(d, mapping.get('desc_sd_tokens', [])):
            return DeliverablePhase.SD
        if _token_match(d, mapping.get('desc_dd_tokens', [])):
            return DeliverablePhase.DD
        if _token_match(d, mapping.get('desc_ifp_tokens', [])):
            return DeliverablePhase.IFP
        if _token_match(d, mapping.get('desc_ifc_tokens', [])):
            return DeliverablePhase.IFC

    try:
        if pct is not None:
            p = int(pct)
            if p == mapping.get('range_ifc_exact'):
                return DeliverablePhase.IFC
            if mapping.get('range_sd_min') <= p <= mapping.get('range_sd_max'):
                return DeliverablePhase.SD
            if mapping.get('range_dd_min') <= p <= mapping.get('range_dd_max'):
                return DeliverablePhase.DD
            if mapping.get('range_ifp_min') <= p <= mapping.get('range_ifp_max'):
                return DeliverablePhase.IFP
    except Exception:  # nosec B110
        pass
    return DeliverablePhase.OTHER


def classify_deliverable_phase(desc: Optional[str], pct: Optional[int]) -> DeliverablePhase:
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
) -> DeliverablePhase:
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
            return DeliverablePhase.CA
        # Fallback to last deliverable if any
        if rows:
            last = rows[-1]
            return _classify_from_desc_pct(last.get('desc'), last.get('pct'))
        return DeliverablePhase.OTHER

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
    """Return a list of DeliverablePhase values for each week key.

    Values are the .value strings of DeliverablePhase for easy JSON usage.
    """
    rows = _normalize_deliverables(deliverables)
    out: List[str] = []
    for wk in week_keys:
        # Reuse single-week classifier to avoid duplicating logic.
        phase = classify_week_for_project(wk, project_status, rows)
        out.append(phase.value)
    return out
