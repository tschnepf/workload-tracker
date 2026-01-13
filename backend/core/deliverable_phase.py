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
from core.choices import DeliverablePhase
from core.week_utils import sunday_of_week


def _classify_from_desc_pct(desc: Optional[str], pct: Optional[int]) -> DeliverablePhase:
    d = (desc or '').strip().lower()
    if 'bulletin' in d or 'addendum' in d:
        return DeliverablePhase.BULLETINS
    if 'masterplan' in d or 'master plan' in d or 'masterplanning' in d:
        return DeliverablePhase.MASTERPLAN
    if 'sd' in d or 'schematic' in d:
        return DeliverablePhase.SD
    if 'dd' in d or 'design development' in d:
        return DeliverablePhase.DD
    if 'ifp' in d:
        return DeliverablePhase.IFP
    try:
        if pct is not None:
            p = int(pct)
            if p <= 39:
                return DeliverablePhase.SD
            if 40 <= p <= 80:
                return DeliverablePhase.DD
            if p >= 81:
                return DeliverablePhase.IFP
    except Exception:  # nosec B110
        pass
    return DeliverablePhase.OTHER


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
    rows = _normalize_deliverables(deliverables)
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

