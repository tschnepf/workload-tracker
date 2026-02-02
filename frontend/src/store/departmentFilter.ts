/*
  Global Department Filter Store
  - Dependency-free observable store for department filters (AND/OR/NOT) + includeChildren (boolean)
  - Initializes from URL (dept, deptChildren) once per load with precedence over localStorage
  - Persists to localStorage; updates URL via history.replaceState on user-initiated changes
  - No side effects on import; callers must invoke ensureInitialized() once (the hook does this)
*/

export type DepartmentFilterOp = 'and' | 'or' | 'not';

export type DepartmentFilterClause = {
  departmentId: number;
  op: DepartmentFilterOp;
};

export type DepartmentFilterState = {
  selectedDepartmentId: number | null;
  includeChildren: boolean;
  filters: DepartmentFilterClause[];
};

const LS_SELECTED_ID = 'deptFilter.selectedId';
const LS_INCLUDE_CHILDREN = 'deptFilter.includeChildren';
const LS_FILTERS = 'deptFilter.filters.v1';

// Internal mutable state
let state: DepartmentFilterState = {
  selectedDepartmentId: null,
  includeChildren: false,
  filters: [],
};

let hasInitializedFromUrl = false;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getState(): DepartmentFilterState {
  return state;
}

import { parseDeptFromSearch, applyDeptToUrl } from '@/utils/deptQuery';

function normalizeOp(op: any): DepartmentFilterOp {
  if (op === 'or' || op === 'not') return op;
  return 'and';
}

function coerceFilters(input: any): DepartmentFilterClause[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<number>();
  const cleaned: DepartmentFilterClause[] = [];
  for (const raw of input) {
    const id = Number(raw?.departmentId ?? raw?.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    cleaned.push({ departmentId: id, op: normalizeOp(raw?.op) });
  }
  return cleaned;
}

function normalizeState(next: DepartmentFilterState): DepartmentFilterState {
  const filters = coerceFilters(next.filters);
  const selectedDepartmentId = filters.length === 1 && filters[0].op !== 'not'
    ? filters[0].departmentId
    : null;
  const includeChildren = selectedDepartmentId != null ? !!next.includeChildren : false;
  return { filters, selectedDepartmentId, includeChildren };
}

function readFromLocalStorage(): Partial<DepartmentFilterState> {
  try {
    if (typeof window === 'undefined') return {};
    const filtersRaw = window.localStorage.getItem(LS_FILTERS);
    const includeStr = window.localStorage.getItem(LS_INCLUDE_CHILDREN);
    const includeChildren = includeStr === '1';
    if (filtersRaw) {
      const parsed = JSON.parse(filtersRaw);
      const filters = coerceFilters(parsed);
      if (filters.length > 0) {
        return { filters, includeChildren };
      }
    }
    const idStr = window.localStorage.getItem(LS_SELECTED_ID);
    const sel = idStr ? Number(idStr) : null;
    if (sel != null && Number.isFinite(sel)) {
      return { filters: [{ departmentId: sel, op: 'and' }], includeChildren };
    }
    return {};
  } catch {
    return {};
  }
}

function writeToLocalStorage(next: DepartmentFilterState) {
  try {
    if (typeof window === 'undefined') return;
    if (next.filters.length === 0) {
      window.localStorage.removeItem(LS_FILTERS);
      window.localStorage.removeItem(LS_SELECTED_ID);
      window.localStorage.removeItem(LS_INCLUDE_CHILDREN);
      return;
    }
    window.localStorage.setItem(LS_FILTERS, JSON.stringify(next.filters));
    if (next.selectedDepartmentId == null) {
      window.localStorage.removeItem(LS_SELECTED_ID);
      window.localStorage.removeItem(LS_INCLUDE_CHILDREN);
    } else {
      window.localStorage.setItem(LS_SELECTED_ID, String(next.selectedDepartmentId));
      window.localStorage.setItem(LS_INCLUDE_CHILDREN, next.includeChildren ? '1' : '0');
    }
  } catch {
    // ignore storage failures
  }
}

function readUrlParams(): Partial<DepartmentFilterState> | null {
  if (typeof window === 'undefined') return null;
  return parseDeptFromSearch(window.location.search) as Partial<DepartmentFilterState> | null;
}

function writeUrlFromState(next: DepartmentFilterState) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  applyDeptToUrl(url, next);
  // Only call replaceState if the URL actually changed
  const nextSearch = url.searchParams.toString();
  const nextUrl = url.pathname + (nextSearch ? `?${nextSearch}` : '') + url.hash;
  const current = window.location.pathname + window.location.search + window.location.hash;
  if (nextUrl !== current) {
    window.history.replaceState(window.history.state, '', nextUrl);
  }
}

function setState(next: DepartmentFilterState, opts: { userInitiated?: boolean } = { userInitiated: true }) {
  state = normalizeState(next);
  writeToLocalStorage(state);
  if (opts.userInitiated) writeUrlFromState(state);
  notify();
}

export function setDepartment(id: number | null) {
  if (id == null) {
    setState({ ...state, filters: [] }, { userInitiated: true });
    return;
  }
  setState({ ...state, filters: [{ departmentId: id, op: 'and' }] }, { userInitiated: true });
}

export function clearDepartment() {
  setState({ ...state, filters: [], includeChildren: false }, { userInitiated: true });
}

export function setDepartmentFilters(filters: DepartmentFilterClause[]) {
  setState({ ...state, filters }, { userInitiated: true });
}

export function addDepartmentFilter(id: number, op: DepartmentFilterOp = 'and') {
  if (id == null || !Number.isFinite(id)) return;
  const nextFilters = state.filters.filter((f) => f.departmentId !== id);
  nextFilters.push({ departmentId: Number(id), op });
  setState({ ...state, filters: nextFilters }, { userInitiated: true });
}

export function removeDepartmentFilter(id: number) {
  const nextFilters = state.filters.filter((f) => f.departmentId !== id);
  if (nextFilters.length === state.filters.length) return;
  setState({ ...state, filters: nextFilters }, { userInitiated: true });
}

export function setIncludeChildren(v: boolean) {
  if (state.selectedDepartmentId == null) {
    // If no department selected, includeChildren has no effect; keep false to avoid misleading URLs
    setState({ ...state, includeChildren: false }, { userInitiated: true });
  } else {
    setState({ ...state, includeChildren: !!v }, { userInitiated: true });
  }
}

/**
 * Ensure the store is initialized exactly once per page load.
 * URL has precedence over localStorage on first initialization.
 */
export function ensureInitialized() {
  if (hasInitializedFromUrl) return;
  hasInitializedFromUrl = true;
  // Start from localStorage
  const ls = readFromLocalStorage();
  state = normalizeState({
    selectedDepartmentId: ls.selectedDepartmentId ?? null,
    includeChildren: ls.includeChildren ?? false,
    filters: ls.filters ?? [],
  });
  // Override from URL if present
  const fromUrl = readUrlParams();
  if (fromUrl) {
    state = normalizeState({
      selectedDepartmentId: fromUrl.selectedDepartmentId ?? state.selectedDepartmentId ?? null,
      includeChildren: fromUrl.includeChildren ?? state.includeChildren,
      filters: fromUrl.filters ?? state.filters,
    });
    // Do not echo URL back; treat as non-user change
    writeToLocalStorage(state);
  }
}

/**
 * Apply server-provided defaults (used after auth hydration).
 * Respects URL precedence: only applies when no department is currently selected.
 * Does not update the URL (non-user initiated).
 */
export function applyServerDefaults(defaults: Partial<DepartmentFilterState>) {
  if (state.filters.length > 0) return; // already selected via URL or local
  const nextId = defaults.selectedDepartmentId ?? null;
  const nextInclude = defaults.includeChildren ?? false;
  if (nextId == null) return;
  setState(
    { selectedDepartmentId: nextId, includeChildren: !!nextInclude, filters: [{ departmentId: nextId, op: 'and' }] },
    { userInitiated: false }
  );
}

/**
 * UI params helper for pages (keeps undefined when unfiltered)
 */
export function buildDeptUiParams(current: DepartmentFilterState): {
  department?: number;
  includeChildren?: boolean;
} {
  if (current.selectedDepartmentId == null) return {};
  return {
    department: current.selectedDepartmentId,
    includeChildren: current.includeChildren,
  };
}

/**
 * Backend params helper (snake_case), recommended for API clients
 */
export function buildDeptBackendParams(current: DepartmentFilterState): {
  department?: number;
  include_children?: 0 | 1;
} {
  if (current.selectedDepartmentId == null) return {};
  return {
    department: current.selectedDepartmentId,
    include_children: current.includeChildren ? 1 : 0,
  };
}

// Tiny usage example (not executed):
// ensureInitialized();
// subscribe(() => console.log('dept filter changed', getState()));
// setDepartment(3); setIncludeChildren(true); clearDepartment();
