/*
  Auth Store
  - Dependency-free observable store for authentication state
  - Keeps accessToken in memory; persists refreshToken in localStorage
  - Provides hydration and cross-tab synchronization
  - Exposes helpers to login, logout, refresh access token, and update settings
*/

type UserSummary = {
  id: number | null;
  username: string | null;
  email: string | null;
};

type PersonSummary = {
  id: number | null;
  name: string | null;
  department: number | null;
} | null;

export type UserSettings = {
  defaultDepartmentId?: number | null;
  includeChildren?: boolean;
  theme?: 'light' | 'dark' | 'system';
  schemaVersion?: number;
};

export type AuthState = {
  hydrating: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  user: UserSummary | null;
  person: PersonSummary;
  settings: UserSettings;
};

const API_BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) || 'http://localhost:8000/api';

const LS_REFRESH = 'auth.refreshToken';

// Internal mutable state
let state: AuthState = {
  hydrating: true,
  accessToken: null,
  refreshToken: null,
  user: null,
  person: null,
  settings: {},
};

const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getState(): AuthState {
  return state;
}

function setState(next: Partial<AuthState>) {
  state = { ...state, ...next };
  notify();
}

function readRefreshFromStorage(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(LS_REFRESH);
  } catch {
    return null;
  }
}

function writeRefreshToStorage(token: string | null) {
  try {
    if (typeof window === 'undefined') return;
    if (!token) window.localStorage.removeItem(LS_REFRESH);
    else window.localStorage.setItem(LS_REFRESH, token);
  } catch {
    // ignore storage failures
  }
}

// Cross-tab synchronization
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== LS_REFRESH) return;
    const newToken = e.newValue;
    // If token cleared in another tab, logout in this one
    if (!newToken) {
      setState({ accessToken: null, refreshToken: null, user: null, person: null, settings: {} });
      return;
    }
    // If token changed in another tab, update and clear access token (will refresh on demand)
    if (newToken !== state.refreshToken) {
      setState({ refreshToken: newToken, accessToken: null });
    }
  });
}

async function http<T>(path: string, opts: RequestInit = {}, withAuth = false): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opts.headers as Record<string, string> || {}) };
  if (withAuth && state.accessToken) headers['Authorization'] = `Bearer ${state.accessToken}`;
  const res = await fetch(`${API_BASE_URL}${path}`, { ...opts, headers });
  if (!res.ok) {
    let data: any = null;
    try { data = await res.json(); } catch {}
    const message = (data && (data.detail || data.message)) || res.statusText || `HTTP ${res.status}`;
    const error: any = new Error(message);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  // May be empty
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function login(usernameOrEmail: string, password: string): Promise<void> {
  // SimpleJWT expects { username, password }
  const body = JSON.stringify({ username: usernameOrEmail, password });
  const tok = await http<{ access: string; refresh: string }>(`/token/`, { method: 'POST', body });
  writeRefreshToStorage(tok.refresh);
  setState({ refreshToken: tok.refresh, accessToken: tok.access });
  await hydrateProfile();
}

export async function logout(): Promise<void> {
  writeRefreshToStorage(null);
  setState({ accessToken: null, refreshToken: null, user: null, person: null, settings: {} });
}

export async function refreshAccessToken(): Promise<string | null> {
  const refresh = readRefreshFromStorage();
  if (!refresh) return null;
  try {
    const body = JSON.stringify({ refresh });
    const data = await http<{ access: string; refresh?: string }>(`/token/refresh/`, { method: 'POST', body });
    // SimpleJWT may return a rotated refresh token when ROTATE_REFRESH_TOKENS is true
    if (data.refresh) {
      writeRefreshToStorage(data.refresh);
      setState({ refreshToken: data.refresh });
    }
    setState({ accessToken: data.access });
    return data.access;
  } catch (e) {
    // If refresh fails (expired/invalid), clear auth state
    writeRefreshToStorage(null);
    setState({ accessToken: null, refreshToken: null, user: null, person: null, settings: {} });
    return null;
  }
}

export async function loadFromStorage(): Promise<void> {
  // Read refresh from localStorage and attempt to obtain a fresh access token
  const refresh = readRefreshFromStorage();
  setState({ refreshToken: refresh });
  if (refresh) {
    await refreshAccessToken();
    await hydrateProfile();
  }
  setState({ hydrating: false });
}

async function hydrateProfile(): Promise<void> {
  if (!state.accessToken) return;
  const profile = await http<{ id: number; user: UserSummary; person: PersonSummary; settings: UserSettings }>(`/auth/me/`, { method: 'GET' }, true);
  setState({ user: profile.user, person: profile.person, settings: profile.settings || {} });
}

export async function setSettings(partial: UserSettings): Promise<void> {
  // Merge current settings with partial and PATCH server
  const current = state.settings || {};
  const next = { ...current, ...partial };
  const body = JSON.stringify({ settings: next });
  const updated = await http<{ id: number; user: UserSummary; person: PersonSummary; settings: UserSettings }>(`/auth/settings/`, { method: 'PATCH', body }, true);
  setState({ settings: updated.settings || {} });
}

// Auto-start hydration when this module is imported in the browser
if (typeof window !== 'undefined') {
  // Fire and forget; callers can subscribe to hydrating state
  loadFromStorage();
}

// Expose a way to reload the profile (e.g., after linking a person)
export async function reloadProfile(): Promise<void> {
  await hydrateProfile();
}
