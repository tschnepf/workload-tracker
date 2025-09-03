/*
  Global Department Filter Store
  - Dependency-free observable store for selectedDepartmentId (number|null) and includeChildren (boolean)
  - Initializes from URL (dept, deptChildren) once per load with precedence over localStorage
  - Persists to localStorage; updates URL via history.replaceState on user-initiated changes
  - No side effects on import; callers must invoke ensureInitialized() once (the hook does this)
*/

export type DepartmentFilterState = {
  selectedDepartmentId: number | null;
  includeChildren: boolean;
};

const LS_SELECTED_ID = 'deptFilter.selectedId';
const LS_INCLUDE_CHILDREN = 'deptFilter.includeChildren';

// Internal mutable state
let state: DepartmentFilterState = {
  selectedDepartmentId: null,
  includeChildren: false,
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

function readFromLocalStorage(): Partial<DepartmentFilterState> {
  try {
    const idStr = typeof window !== 'undefined' ? window.localStorage.getItem(LS_SELECTED_ID) : null;
    const includeStr = typeof window !== 'undefined' ? window.localStorage.getItem(LS_INCLUDE_CHILDREN) : null;
  const sel = idStr ? Number(idStr) : null;
    return {
      selectedDepartmentId: sel,
      includeChildren: includeStr === '1',
    };
  } catch {
    return {};
  }
}

function writeToLocalStorage(next: DepartmentFilterState) {
  try {
    if (typeof window === 'undefined') return;
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
  state = next;
  writeToLocalStorage(state);
  if (opts.userInitiated) writeUrlFromState(state);
  notify();
}

export function setDepartment(id: number | null) {
  setState({ ...state, selectedDepartmentId: id }, { userInitiated: true });
}

export function clearDepartment() {
  setState({ selectedDepartmentId: null, includeChildren: false }, { userInitiated: true });
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
  state = {
    selectedDepartmentId: ls.selectedDepartmentId ?? null,
    includeChildren: ls.includeChildren ?? false,
  };
  // Override from URL if present
  const fromUrl = readUrlParams();
  if (fromUrl) {
    state = {
      selectedDepartmentId: fromUrl.selectedDepartmentId ?? state.selectedDepartmentId ?? null,
      includeChildren: fromUrl.includeChildren ?? state.includeChildren,
    };
    // Do not echo URL back; treat as non-user change
    writeToLocalStorage(state);
  }
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
