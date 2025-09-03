// Helper utilities for parsing/serializing department filter URL params

export type DeptQueryState = {
  selectedDepartmentId: number | null;
  includeChildren: boolean;
};

function parseIntSafe(v: string | null | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Parse from a search string like '?dept=3&deptChildren=1'
export function parseDeptFromSearch(search: string): Partial<DeptQueryState> | null {
  const sp = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  const deptParam = sp.get('dept');
  const deptChildrenParam = sp.get('deptChildren');
  if (deptParam == null && deptChildrenParam == null) return null;
  const id = parseIntSafe(deptParam);
  const include = deptChildrenParam === '1';
  const res: Partial<DeptQueryState> = {};
  if (id != null) res.selectedDepartmentId = id;
  if (deptChildrenParam != null) res.includeChildren = include;
  return res;
}

// Apply state to a URL (mutates provided instance) using replace semantics.
// If no department is selected, remove both params.
export function applyDeptToUrl(url: URL, state: DeptQueryState) {
  const sp = url.searchParams;
  if (state.selectedDepartmentId == null) {
    sp.delete('dept');
    sp.delete('deptChildren');
  } else {
    sp.set('dept', String(state.selectedDepartmentId));
    sp.set('deptChildren', state.includeChildren ? '1' : '0');
  }
}
