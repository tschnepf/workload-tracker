/*
  Auth Store
  - Dependency-free observable store for authentication state
  - Keeps accessToken in memory; persists refreshToken in localStorage
  - Provides hydration and cross-tab synchronization
  - Exposes helpers to login, logout, refresh access token, and update settings
*/

import { etagStore } from '@/api/etagStore';
import { resolveApiBase } from '@/utils/apiBase';

type UserSummary = {
  id: number | null;
  username: string | null;
  email: string | null;
  is_staff?: boolean;
  is_superuser?: boolean;
  accountRole?: 'admin' | 'manager' | 'user';
  groups?: string[];
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
  colorScheme?: string;
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

const API_BASE_URL = resolveApiBase((typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) || undefined);
const OPENAPI_MIGRATION_ENABLED = !!(typeof import.meta !== 'undefined' && import.meta.env && (import.meta.env as any).VITE_OPENAPI_MIGRATION_ENABLED === 'true');
const COOKIE_REFRESH = !!(typeof import.meta !== 'undefined' && import.meta.env && (import.meta.env as any).VITE_COOKIE_REFRESH_AUTH === 'true');

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
const authReadyResolvers = new Set<() => void>();

function beginAuthHydration() {
  authReadyResolvers.clear();
  if (!state.hydrating) {
    setState({ hydrating: true });
  }
}

function markAuthReady() {
  if (state.hydrating) {
    setState({ hydrating: false });
  }
  if (authReadyResolvers.size > 0) {
    const resolvers = Array.from(authReadyResolvers);
    authReadyResolvers.clear();
    for (const resolve of resolvers) {
      resolve();
    }
  }
}

export function waitForAuthReady(): Promise<void> {
  if (!state.hydrating) {
    return Promise.resolve();
  }
  return new Promise(resolve => {
    authReadyResolvers.add(resolve);
  });
}


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
    const v = window.localStorage.getItem(LS_REFRESH);
    // Guard against earlier builds writing literal 'undefined'/'null'
    if (!v) return null;
    const trimmed = v.trim();
    if (trimmed === '' || trimmed === 'undefined' || trimmed === 'null') return null;
    return trimmed;
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
  if (COOKIE_REFRESH) {
    const tok = await http<{ access: string }>(`/token/`, { method: 'POST', body, credentials: 'include' });
    // Refresh is stored as httpOnly cookie by server
    setState({ refreshToken: null, accessToken: tok.access });
  } else {
    const tok = await http<{ access: string; refresh?: string }>(`/token/`, { method: 'POST', body });
    // Some server configs hide refresh in cookie even if client built for localStorage. Be tolerant.
    if (tok.refresh) {
      writeRefreshToStorage(tok.refresh);
      setState({ refreshToken: tok.refresh, accessToken: tok.access });
    } else {
      // No refresh in body; assume cookie mode on server
      setState({ refreshToken: null, accessToken: tok.access });
    }
  }
  await hydrateProfile();
}

export async function logout(): Promise<void> {
  if (COOKIE_REFRESH) {
    try { await http(`/token/logout/`, { method: 'POST', credentials: 'include' }); } catch {}
  }
  writeRefreshToStorage(null);
  setState({ accessToken: null, refreshToken: null, user: null, person: null, settings: {} });
  // Clear any stored ETags on identity change
  etagStore.clear();
}

export async function refreshAccessToken(): Promise<string | null> {
  if (COOKIE_REFRESH) {
    try {
      const data = await http<{ access: string }>(`/token/refresh/`, { method: 'POST', credentials: 'include' });
      setState({ accessToken: data.access });
      return data.access;
    } catch (e) {
      setState({ accessToken: null, user: null, person: null, settings: {} });
      etagStore.clear();
      return null;
    }
  } else {
    let refresh = readRefreshFromStorage();
    if (!refresh) {
      // Fallback: server may be running cookie mode. Try cookie-based refresh once.
      try {
        const data = await http<{ access: string }>(`/token/refresh/`, { method: 'POST', credentials: 'include' });
        setState({ accessToken: data.access });
        return data.access;
      } catch {
        return null;
      }
    }
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
      etagStore.clear();
      return null;
    }
  }
}

export async function loadFromStorage(): Promise<void> {
  beginAuthHydration();
  if (COOKIE_REFRESH) {
    // Attempt refresh using cookie; do not rely on localStorage
    await refreshAccessToken();
    await hydrateProfile();
    setState({ hydrating: false });
    return;
  }
  // Read refresh from localStorage and attempt to obtain a fresh access token
  const refresh = readRefreshFromStorage();
  setState({ refreshToken: refresh });
  if (refresh) {
    await refreshAccessToken();
    await hydrateProfile();
    markAuthReady();
    return;
  }
  // No local refresh token — try cookie-based refresh as a resilience measure
  try {
    const data = await http<{ access: string }>(`/token/refresh/`, { method: 'POST', credentials: 'include' });
    setState({ accessToken: data.access });
    await hydrateProfile();
    setState({ hydrating: false });
    return;
  } catch {
    // fall through
  }
  markAuthReady();
}

// Lightweight typed client (local) to avoid circular deps
import createClient from 'openapi-fetch';
import type { paths } from '@/api/schema';
const typedAuthClient = createClient<paths>({ baseUrl: API_BASE_URL });

async function hydrateProfile(): Promise<void> {
  if (!state.accessToken) return;
  const useTyped = true;
  if (useTyped) {
    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${state.accessToken}` };
      let res = await typedAuthClient.GET('/auth/me/' as any, { headers });
      if (!res.data && res.response && res.response.status === 401) {
        const tok = await refreshAccessToken();
        if (tok) {
          res = await typedAuthClient.GET('/auth/me/' as any, { headers: { Authorization: `Bearer ${tok}` } });
        }
      }
      if (res.data) {
        const profile = res.data as any;
        setState({ user: profile.user, person: profile.person, settings: profile.settings || {} });
        return;
      }
    } catch {
      // fallback to legacy
    }
  }
  const profile = await http<{ id: number; user: UserSummary; person: PersonSummary; settings: UserSettings }>(`/auth/me/`, { method: 'GET' }, true);
  setState({ user: profile.user, person: profile.person, settings: profile.settings || {} });
}

export async function setSettings(partial: UserSettings): Promise<void> {
  // Merge current settings with partial and PATCH server
  const current = state.settings || {};
  const next = { ...current, ...partial };
  const useTyped = true;
  if (useTyped) {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (state.accessToken) headers['Authorization'] = `Bearer ${state.accessToken}`;
      let res = await typedAuthClient.PATCH('/auth/settings/' as any, { body: { settings: next } as any, headers });
      if (!res.data && res.response && res.response.status === 401) {
        const tok = await refreshAccessToken();
        const hdrs: Record<string, string> = { 'Content-Type': 'application/json' };
        if (tok) hdrs['Authorization'] = `Bearer ${tok}`;
        res = await typedAuthClient.PATCH('/auth/settings/' as any, { body: { settings: next } as any, headers: hdrs });
      }
      if (res.data) {
        const updated = res.data as any;
        setState({ settings: updated.settings || {} });
        return;
      }
    } catch {
      // fall back to legacy
    }
  }
  const updated = await http<{ id: number; user: UserSummary; person: PersonSummary; settings: UserSettings }>(`/auth/settings/`, { method: 'PATCH', body: JSON.stringify({ settings: next }) }, true);
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


