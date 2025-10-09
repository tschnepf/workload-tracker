import createClient from 'openapi-fetch';
import type { paths } from './schema';
import { getAccessToken, refreshAccessToken, waitForAuthReady } from '@/utils/auth';
import { etagStore } from './etagStore';
import { showToast } from '@/lib/toastBus';
import { friendlyErrorMessage } from './errors';

// Prefer relative '/api' so Vite proxy handles routing in dev. If VITE_API_URL
// is set to an absolute URL, we still honor it. When running the dev server on
// host (port 3000) without a working proxy, fall back to http://<host>:8000/api.
const CFG_BASE = (import.meta as any)?.env?.VITE_API_URL as string | undefined;
// Correct behavior:
// - If CFG_BASE is an absolute URL (http/https), honor it.
// - Otherwise, use relative '/api' so the dev proxy (vite.config.ts) forwards to backend.
const API_BASE_URL = (CFG_BASE && /^(https?:)?\/\//i.test(CFG_BASE)) ? CFG_BASE : '/api';

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

let refreshPromise: Promise<string | null> | null = null;

function withAuth(headers?: Record<string, string>): Record<string, string> {
  const token = getAccessToken();
  return { ...(headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function ensureTrailingSlash(path: string): string {
  const [p] = path.split('?');
  return p.endsWith('/') ? path : `${p}/`;
}

// Replace OpenAPI path template placeholders with concrete values
function materializePath(path: string, opts?: any): string {
  try {
    const params = opts?.params?.path || {};
    let out = String(path);
    for (const [k, v] of Object.entries(params)) {
      out = out.replace(`{${k}}`, String(v));
    }
    return out;
  } catch {
    return String(path);
  }
}

// Create a typed OpenAPI client
export const rawClient = createClient<paths>({ baseUrl: API_BASE_URL });

// Thin wrapper maintaining parity with legacy error semantics and ETag behavior
export const apiClient = {
  async GET(path: any, opts?: any) {
    await waitForAuthReady();
    const keyPath = ensureTrailingSlash(materializePath(typeof path === 'string' ? path : String(path), opts));
    const headers = withAuth(opts?.headers);
    const res = await rawClient.GET(path as any, { ...opts, headers });
    if (res.error) return handleError(res);
    // Capture ETag for detail GETs (heuristic: has {id} or ends with '/{number}/')
    try {
      const etag = res.response?.headers?.get?.('etag');
      if (etag) etagStore.set(keyPath, etag);
    } catch {}
    return res;
  },

  async POST(path: any, opts?: any) { return baseWrite('POST', path, opts); },
  async PUT(path: any, opts?: any) { return baseWrite('PUT', path, opts); },
  async PATCH(path: any, opts?: any) { return baseWrite('PATCH', path, opts); },
  async DELETE(path: any, opts?: any) { return baseWrite('DELETE', path, opts); },
};

async function baseWrite(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: any, opts?: any) {
  await waitForAuthReady();
  const keyPath = ensureTrailingSlash(materializePath(typeof path === 'string' ? path : String(path), opts));
  let headers = withAuth(opts?.headers);
  // Inject If-Match for detail mutations when we have an ETag
  if ((method === 'PATCH' || method === 'PUT' || method === 'DELETE') && !headers['If-Match']) {
    const etag = etagStore.get(keyPath);
    if (etag) headers = { ...headers, 'If-Match': etag };
  }
  const req = { ...opts, headers };

  const call = async () => {
    switch (method) {
      case 'POST': return rawClient.POST(path as any, req);
      case 'PUT': return rawClient.PUT(path as any, req);
      case 'PATCH': return rawClient.PATCH(path as any, req);
      case 'DELETE': return rawClient.DELETE(path as any, req);
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
    } else if (status === 412) {
      // ETag mismatch: refresh ETag and retry once
      try {
        const getRes = await rawClient.GET(path as any, { ...opts, headers: withAuth(opts?.headers) });
        const newEtag = getRes.response?.headers?.get?.('etag');
        if (newEtag) etagStore.set(keyPath, newEtag);
        // Rebuild headers with fresh If-Match
        let retryHeaders = withAuth(opts?.headers);
        const etag = etagStore.get(keyPath);
        if (etag) retryHeaders = { ...retryHeaders, 'If-Match': etag };
        res = await (async () => {
          switch (method) {
            case 'POST': return rawClient.POST(path as any, { ...req, headers: retryHeaders });
            case 'PUT': return rawClient.PUT(path as any, { ...req, headers: retryHeaders });
            case 'PATCH': return rawClient.PATCH(path as any, { ...req, headers: retryHeaders });
            case 'DELETE': return rawClient.DELETE(path as any, { ...req, headers: retryHeaders });
          }
        })();
      } catch {}
    }
  }

  if (res.error) return handleError(res);
  // Update stored ETag when server returns new one
  try {
    const etag = res.response?.headers?.get?.('etag');
    if (etag) etagStore.set(keyPath, etag);
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

