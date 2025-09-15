import createClient from 'openapi-fetch';
import type { paths } from './schema';
import { getAccessToken, refreshAccessToken } from '@/utils/auth';
import { etagStore } from './etagStore';
import { showToast } from '@/lib/toastBus';

// Prefer relative '/api' so Vite proxy handles routing in dev. If VITE_API_URL
// is set to an absolute URL, we still honor it.
const API_BASE_URL = (import.meta as any)?.env?.VITE_API_URL || '/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public response?: any,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Shared error mapping to keep parity with legacy layer
export function friendlyErrorMessage(status: number, data: any, fallback: string): string {
  const detail = typeof data === 'object' && data ? (data.detail || data.message || data.error) : null;
  const nonField = Array.isArray(data?.non_field_errors) ? data.non_field_errors[0] : null;
  const firstFieldError = (() => {
    if (data && typeof data === 'object') {
      for (const [k, v] of Object.entries(data)) {
        if (k === 'detail' || k === 'message' || k === 'non_field_errors') continue;
        if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'string') return v[0] as string;
      }
    }
    return null;
  })();
  switch (status) {
    case 0:
      return 'Network error - unable to reach the server.';
    case 400:
      return nonField || firstFieldError || detail || 'Please check the form for errors and try again.';
    case 401:
      return 'Your session has expired. Please sign in again.';
    case 403:
      return 'You do not have permission to perform this action.';
    case 404:
      return 'We could not find what you were looking for.';
    case 409:
      return 'A conflict occurred. Please refresh and try again.';
    case 412:
      return 'This record changed since you loaded it. Refresh and retry.';
    case 413:
      return 'The request is too large. Try narrowing your selection.';
    case 429:
      return 'Too many requests. Please slow down and try again soon.';
    case 500:
    case 502:
    case 503:
    case 504:
      return 'Something went wrong on our side. Please try again.';
    default:
      return detail || fallback;
  }
}

let refreshPromise: Promise<string | null> | null = null;

function withAuth(headers?: Record<string, string>): Record<string, string> {
  const token = getAccessToken();
  return { ...(headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function ensureTrailingSlash(path: string): string {
  const [p] = path.split('?');
  return p.endsWith('/') ? path : `${p}/`;
}

// Create a typed OpenAPI client
export const rawClient = createClient<paths>({ baseUrl: API_BASE_URL });

// Thin wrapper maintaining parity with legacy error semantics and ETag behavior
export const apiClient = {
  async GET(path: any, opts?: any) {
    const normalizedPath = ensureTrailingSlash(typeof path === 'string' ? path : String(path));
    const headers = withAuth(opts?.headers);
    const res = await rawClient.GET(normalizedPath as any, { ...opts, headers });
    if (res.error) return handleError(res);
    // Capture ETag for detail GETs (heuristic: has {id} or ends with '/{number}/')
    try {
      const etag = res.response?.headers?.get?.('etag');
      if (etag) etagStore.set(normalizedPath, etag);
    } catch {}
    return res;
  },

  async POST(path: any, opts?: any) { return baseWrite('POST', path, opts); },
  async PUT(path: any, opts?: any) { return baseWrite('PUT', path, opts); },
  async PATCH(path: any, opts?: any) { return baseWrite('PATCH', path, opts); },
  async DELETE(path: any, opts?: any) { return baseWrite('DELETE', path, opts); },
};

async function baseWrite(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: any, opts?: any) {
  const normalizedPath = ensureTrailingSlash(typeof path === 'string' ? path : String(path));
  let headers = withAuth(opts?.headers);
  // Inject If-Match for detail mutations when we have an ETag
  if ((method === 'PATCH' || method === 'PUT' || method === 'DELETE') && !headers['If-Match']) {
    const etag = etagStore.get(normalizedPath);
    if (etag) headers = { ...headers, 'If-Match': etag };
  }
  const req = { ...opts, headers };

  const call = async () => {
    switch (method) {
      case 'POST': return rawClient.POST(normalizedPath as any, req);
      case 'PUT': return rawClient.PUT(normalizedPath as any, req);
      case 'PATCH': return rawClient.PATCH(normalizedPath as any, req);
      case 'DELETE': return rawClient.DELETE(normalizedPath as any, req);
    }
  };

  let res = await call();
  if (res.error) {
    // On 401, coalesce and retry once after refresh
    const status = res.response?.status;
    if (status === 401) {
      try {
        if (!refreshPromise) refreshPromise = refreshAccessToken();
        await refreshPromise;
      } finally {
        refreshPromise = null;
      }
      // Retry once
      res = await call();
    }
  }

  if (res.error) return handleError(res);
  // Update stored ETag when server returns new one
  try {
    const etag = res.response?.headers?.get?.('etag');
    if (etag) etagStore.set(normalizedPath, etag);
  } catch {}
  return res;
}

function handleError(res: any): never {
  const status = res.response?.status ?? 500;
  let data: any = null;
  try { data = res.error; } catch {}
  if (status === 412) {
    showToast('This record changed since you loaded it. Refresh and retry.', 'warning');
  }
  throw new ApiError(friendlyErrorMessage(status, data, `HTTP ${status}`), status, data);
}

// Helper to include Authorization header for requests (for external callers)
export function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
