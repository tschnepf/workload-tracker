// Helper utilities for parsing/serializing department filter URL params

export type DeptQueryFilterOp = 'and' | 'or' | 'not';

export type DeptQueryFilter = {
  departmentId: number;
  op: DeptQueryFilterOp;
};

export type DeptQueryState = {
  selectedDepartmentId: number | null;
  includeChildren: boolean;
  filters: DeptQueryFilter[];
};

function parseIntSafe(v: string | null | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function normalizeOp(op: string | null | undefined): DeptQueryFilterOp {
  if (!op) return 'and';
  const v = op.toLowerCase();
  if (v === 'or' || v === 'not') return v;
  return 'and';
}

function parseFilters(raw: string | null): DeptQueryFilter[] {
  if (!raw) return [];
  const tokens = raw.split(',').map((t) => t.trim()).filter(Boolean);
  const seen = new Set<number>();
  const filters: DeptQueryFilter[] = [];
  for (const token of tokens) {
    const [left, right] = token.split(':');
    const op = right == null ? 'and' : normalizeOp(left);
    const idStr = right == null ? left : right;
    const id = parseIntSafe(idStr);
    if (id == null || seen.has(id)) continue;
    seen.add(id);
    filters.push({ departmentId: id, op });
  }
  return filters;
}

// Parse from a search string like '?dept=3&deptChildren=1' or '?deptFilters=and:3,or:7'
export function parseDeptFromSearch(search: string): Partial<DeptQueryState> | null {
  const sp = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  const filtersParam = sp.get('deptFilters');
  const deptParam = sp.get('dept');
  const deptChildrenParam = sp.get('deptChildren');
  if (filtersParam == null && deptParam == null && deptChildrenParam == null) return null;
  if (filtersParam) {
    const filters = parseFilters(filtersParam);
    if (filters.length === 0) return null;
    return { filters };
  }
  const id = parseIntSafe(deptParam);
  const include = deptChildrenParam === '1';
  const res: Partial<DeptQueryState> = {};
  if (id != null) {
    res.selectedDepartmentId = id;
    res.filters = [{ departmentId: id, op: 'and' }];
  }
  if (deptChildrenParam != null) res.includeChildren = include;
  return res;
}

// Apply state to a URL (mutates provided instance) using replace semantics.
// If no department is selected, remove both params.
export function applyDeptToUrl(url: URL, state: DeptQueryState) {
  const sp = url.searchParams;
  const filters = state.filters || [];
  if (filters.length === 0) {
    sp.delete('dept');
    sp.delete('deptChildren');
    sp.delete('deptFilters');
    return;
  }
  if (filters.length === 1 && filters[0].op !== 'not') {
    sp.set('dept', String(filters[0].departmentId));
    sp.set('deptChildren', state.includeChildren ? '1' : '0');
    sp.delete('deptFilters');
    return;
  }
  const encoded = filters.map((f) => `${f.op}:${f.departmentId}`).join(',');
  sp.set('deptFilters', encoded);
  sp.delete('dept');
  sp.delete('deptChildren');
}
