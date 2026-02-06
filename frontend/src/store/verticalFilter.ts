/*
  Global Vertical Filter Store
  - Dependency-free observable store for selected vertical
  - Initializes from URL (vertical) once per load with precedence over localStorage
  - Persists to localStorage; updates URL via history.replaceState on user-initiated changes
  - No side effects on import; callers must invoke ensureInitialized() once (the hook does this)
*/

import { parseVerticalFromSearch, applyVerticalToUrl } from '@/utils/verticalQuery';

export type VerticalFilterState = {
  selectedVerticalId: number | null;
};

const LS_SELECTED_ID = 'verticalFilter.selectedId';

let state: VerticalFilterState = {
  selectedVerticalId: null,
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

export function getState(): VerticalFilterState {
  return state;
}

function normalizeState(next: VerticalFilterState): VerticalFilterState {
  const id = next.selectedVerticalId;
  if (id == null) return { selectedVerticalId: null };
  const coerced = Number(id);
  if (!Number.isFinite(coerced) || coerced <= 0) return { selectedVerticalId: null };
  return { selectedVerticalId: coerced };
}

function readFromLocalStorage(): Partial<VerticalFilterState> {
  try {
    if (typeof window === 'undefined') return {};
    const idStr = window.localStorage.getItem(LS_SELECTED_ID);
    const sel = idStr ? Number(idStr) : null;
    if (sel != null && Number.isFinite(sel) && sel > 0) {
      return { selectedVerticalId: sel };
    }
    return {};
  } catch {
    return {};
  }
}

function writeToLocalStorage(next: VerticalFilterState) {
  try {
    if (typeof window === 'undefined') return;
    if (next.selectedVerticalId == null) {
      window.localStorage.removeItem(LS_SELECTED_ID);
      return;
    }
    window.localStorage.setItem(LS_SELECTED_ID, String(next.selectedVerticalId));
  } catch {
    // ignore storage failures
  }
}

function readUrlParams(): number | null {
  if (typeof window === 'undefined') return null;
  return parseVerticalFromSearch(window.location.search);
}

function writeUrlFromState(next: VerticalFilterState) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  applyVerticalToUrl(url, next.selectedVerticalId);
  const nextSearch = url.searchParams.toString();
  const nextUrl = url.pathname + (nextSearch ? `?${nextSearch}` : '') + url.hash;
  const current = window.location.pathname + window.location.search + window.location.hash;
  if (nextUrl !== current) {
    window.history.replaceState(window.history.state, '', nextUrl);
  }
}

function setState(next: VerticalFilterState, opts: { userInitiated?: boolean } = { userInitiated: true }) {
  state = normalizeState(next);
  writeToLocalStorage(state);
  if (opts.userInitiated) writeUrlFromState(state);
  notify();
}

export function setVertical(id: number | null) {
  if (id == null) {
    setState({ selectedVerticalId: null }, { userInitiated: true });
    return;
  }
  setState({ selectedVerticalId: Number(id) }, { userInitiated: true });
}

export function clearVertical() {
  setState({ selectedVerticalId: null }, { userInitiated: true });
}

/**
 * Ensure the store is initialized exactly once per page load.
 * URL has precedence over localStorage on first initialization.
 */
export function ensureInitialized() {
  if (hasInitializedFromUrl) return;
  hasInitializedFromUrl = true;
  const ls = readFromLocalStorage();
  state = normalizeState({
    selectedVerticalId: ls.selectedVerticalId ?? null,
  });
  const fromUrl = readUrlParams();
  if (fromUrl != null) {
    state = normalizeState({
      selectedVerticalId: fromUrl,
    });
    writeToLocalStorage(state);
  }
}
