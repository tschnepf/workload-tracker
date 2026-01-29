/**
 * API service layer - handles all backend communication
 * Uses naming prevention: frontend camelCase <-> backend snake_case
 */

import {
  Person,
  Project,
  Assignment,
  Department,
  Deliverable,
  DeliverableAssignment,
  DeliverableCalendarItem,
  DeliverableStaffingSummaryItem,
  DeliverableTaskTemplate,
  DeliverableTask,
  DeliverableQATask,
  DeliverablePhaseMappingSettings,
  QATaskSettings,
  AutoHoursTemplate,
  PersonCapacityHeatmapItem,
  WorkloadForecastItem,
  PersonUtilization,
  ApiResponse,
  PaginatedResponse,
  DashboardData,
  SkillTag,
  PersonSkill,
  AssignmentConflictResponse,
  Role,
  ProjectFilterMetadataResponse,
  JobStatus,
  ProjectRisk,
} from '@/types/models';
import type { BackupListResponse, BackupStatus } from '@/types/backup';
import { getAccessToken } from '@/utils/auth';
import { resolveApiBase } from '@/utils/apiBase';
import { apiClient, authHeaders } from '@/api/client';
import { refreshAccessToken as refreshAccessTokenSafe } from '@/store/auth';
import { showToast } from '@/lib/toastBus';
import { etagStore } from '@/api/etagStore';
import { friendlyErrorMessage as _friendlyErrorMessage } from '@/api/errors';

const API_BASE_URL = resolveApiBase((import.meta as any)?.env?.VITE_API_URL as string | undefined);
// Feature flags for OpenAPI migration (scoped + global)
const OPENAPI_MIGRATION_ENABLED = (import.meta.env.VITE_OPENAPI_MIGRATION_ENABLED === 'true');

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public response?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const IS_DEV = import.meta.env && (import.meta.env.DEV ?? false);

export type SystemCapabilities = {
  asyncJobs: boolean;
  aggregates: Record<string, boolean>;
  cache: { shortTtlAggregates: boolean; aggregateTtlSeconds: number };
  projectRolesByDepartment?: boolean;
  personalDashboard?: boolean;
  integrations?: {
    enabled: boolean;
    providers?: Array<{ key: string; displayName: string }>;
    details?: Record<string, unknown>;
  };
};

// Delegate to shared error mapper to avoid duplication
function friendlyErrorMessage(status: number, data: any, fallback: string): string {
  return _friendlyErrorMessage(status, data, fallback);
}

// Lightweight in-memory cache to coalesce duplicate GETs and short-cache results
type CacheEntry<T> = { promise: Promise<T>; timestamp: number; data?: T };
const inflightRequests = new Map<string, CacheEntry<any>>();
const responseCache = new Map<string, CacheEntry<any>>();

// Expose a narrowly scoped cache invalidator for deliverables GET endpoints
export function invalidateDeliverablesCache() {
  try {
    const KEYS = Array.from(responseCache.keys());
    for (const k of KEYS) {
      if (k.includes('/deliverables/')) responseCache.delete(k);
    }
    const INFLIGHT = Array.from(inflightRequests.keys());
    for (const k of INFLIGHT) {
      if (k.includes('/deliverables/')) inflightRequests.delete(k);
    }
  } catch {}
}
// Store ETags by endpoint for conditional requests (detail routes)
// Use shared ETag store to align behavior with typed client
const DEFAULT_TTL_MS = 15000; // 15s TTL is enough to absorb StrictMode double effects

function makeCacheKey(url: string, method?: string) {
  return `${method || 'GET'} ${url}`;
}

let refreshPromise: Promise<string | null> | null = null;

function base64UrlDecode(input: string): string {
  // Replace URL-safe chars
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  try {
    // atob is available in browsers; Node in dev may polyfill via Vite
    return typeof atob !== 'undefined' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary');
  } catch {
    return '';
  }
}

function getTokenExpSeconds(token: string | null): number | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = base64UrlDecode(parts[1]);
    const payload = JSON.parse(json);
    const exp = payload && payload.exp;
    return Number.isFinite(exp) ? exp : null;
  } catch {
    return null;
  }
}

async function ensureAccessTokenFresh(): Promise<void> {
  const token = getAccessToken();
  const exp = getTokenExpSeconds(token);
  if (!exp) return; // no token or can't parse
  const nowSec = Math.floor(Date.now() / 1000);
  // If token expires in less than 120s, refresh proactively
  if (exp - nowSec < 120) {
    if (!refreshPromise) refreshPromise = refreshAccessTokenSafe();
    try {
      await refreshPromise;
    } finally {
      refreshPromise = null;
    }
  }
}

async function doFetch<T>(endpoint: string, options: RequestInit, isRetry = false): Promise<T> {
  await ensureAccessTokenFresh();
  const url = `${API_BASE_URL}${endpoint}`;
  const token = getAccessToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  } as Record<string, string>;
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // Inject If-Match automatically for detail mutations when we have an ETag
  const method = (options.method || 'GET').toUpperCase();
  if (method === 'PATCH' || method === 'PUT' || method === 'DELETE') {
    if (!headers['If-Match']) {
      const etag = etagStore.get(endpoint);
      if (etag) headers['If-Match'] = etag;
    }
  }

  const response = await fetch(url, { ...options, headers });

  if (IS_DEV) {
    console.log(' [DEBUG] fetchApi response:', {
      url,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries()),
    });
  }

  if (response.status === 401 && !isRetry) {
    try {
      if (!refreshPromise) refreshPromise = (async () => {
        try {
          return await refreshAccessTokenSafe();
        } catch {
          // minimal backoff retry
          await new Promise((r) => setTimeout(r, 300));
          return await refreshAccessTokenSafe();
        }
      })();
      await refreshPromise;
    } finally {
      refreshPromise = null;
    }
    // Retry once with new token
    return doFetch<T>(endpoint, options, true);
  }

  // Capture ETag from successful GET responses
  if (response.ok && method === 'GET') {
    const etag = response.headers.get('etag');
    if (etag) {
      try {
        // Preserve ETag exactly as returned (including quotes) for correct If-Match semantics
        etagStore.set(endpoint, etag);
      } catch {}
    }
  }

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    let errorData: any = null;
    try {
      errorData = await response.json();
      errorMessage = friendlyErrorMessage(response.status, errorData, errorMessage);
      if (IS_DEV) console.error(' [DEBUG] API Error Response:', errorData);
    } catch (e) {
      errorMessage = friendlyErrorMessage(response.status, null, response.statusText || errorMessage);
      if (IS_DEV) console.error(' [DEBUG] API Error (no JSON):', errorMessage);
    }
    if (response.status === 412) {
      showToast('This record changed since you loaded it. Refresh and retry.', 'warning');
    }
    throw new ApiError(errorMessage, response.status, errorData);
  }

  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    return undefined as T;
  }
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  if (IS_DEV) {
    try {
      console.log(' [DEBUG] fetchApi called:', {
        url,
        method: options.method || 'GET',
        headers: options.headers,
        body: options.body,
        bodyParsed: typeof options.body === 'string' ? JSON.parse(options.body) : null,
      });
    } catch {}
  }
  try {
    return await doFetch<T>(endpoint, options);
  } catch (error) {
    if (IS_DEV) console.error(' [DEBUG] Fetch error:', error);
    if (error instanceof TypeError && (error as any).message?.includes('fetch')) {
      throw new ApiError('Network error - unable to reach server', 0);
    }
    throw error;
  }
}

// Cached variant for idempotent GET endpoints
async function fetchApiCached<T>(endpoint: string, ttlMs = DEFAULT_TTL_MS): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const key = makeCacheKey(url, 'GET');
  const now = Date.now();

  const cached = responseCache.get(key);
  if (cached && cached.data !== undefined && (now - cached.timestamp) < ttlMs) {
    return cached.data as T;
  }

  const inflight = inflightRequests.get(key);
  if (inflight) return inflight.promise as Promise<T>;

  const promise = fetchApi<T>(endpoint, { method: 'GET' })
    .then((data) => {
      responseCache.set(key, { promise, timestamp: Date.now(), data });
      inflightRequests.delete(key);
      return data;
    })
    .catch((err) => {
      inflightRequests.delete(key);
      throw err;
    });

  inflightRequests.set(key, { promise, timestamp: now });
  return promise;
}

// Helper to append query params from a record where undefined/null values are skipped
function appendQueryParams(sp: URLSearchParams, params: Record<string, string | number | boolean | undefined | null>) {
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
}

// People API
export const peopleApi = {
  // Get all people with pagination support
  list: async (params?: { page?: number; page_size?: number; search?: string; department?: number; include_children?: 0 | 1; include_inactive?: 0 | 1 }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.page_size) queryParams.set('page_size', params.page_size.toString());
    if (params?.search) queryParams.set('search', params.search);
    if (params?.department != null) queryParams.set('department', String(params.department));
    if (params?.include_children != null) queryParams.set('include_children', String(params.include_children));
    if (params?.include_inactive != null) queryParams.set('include_inactive', String(params.include_inactive));
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';

    const res = await apiClient.GET(`/people/${queryString}` as any, { headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as PaginatedResponse<Person>;
  },

  // Get all people (bulk API - Phase 2 optimization)
  // NOTE (OpenAPI Phase 0.7): Keep legacy for ?all=true bulk responses until bulk endpoints are annotated.
  listAll: async (filters?: { department?: number; include_children?: 0 | 1 }): Promise<Person[]> => {
    const sp = new URLSearchParams();
    sp.set('all', 'true');
    if (filters?.department != null) sp.set('department', String(filters.department));
    if (filters?.include_children != null) sp.set('include_children', String(filters.include_children));
    const qs = sp.toString();
  return fetchApiCached<Person[]>(`/people/?${qs}`);
  },

  // Server-side search for people (typeahead)
  search: async (
    q: string,
    limit = 20,
    filters?: { department?: number }
  ): Promise<Array<{ id: number; name: string; department?: number; roleName?: string | null }>> => {
    const query: Record<string, any> = { q };
    if (limit) query.limit = limit;
    if (filters?.department != null) query.department = filters.department;
    const res = await apiClient.GET('/people/search/' as any, { params: { query }, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as Array<{ id: number; name: string; department?: number; roleName?: string | null }>;
  },

  // Autocomplete endpoint (Phase 3/4 wiring)
  autocomplete: async (search?: string, limit?: number): Promise<Array<{ id: number; name: string; department: number | null }>> => {
    const sp = new URLSearchParams();
    if (search) sp.set('search', search);
    if (limit != null) sp.set('limit', String(limit));
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    const res = await apiClient.GET(`/people/autocomplete/${qs}` as any, { headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as Array<{ id: number; name: string; department: number | null }>;
  },

  // Get single person
  get: async (id: number) => {
    const res = await apiClient.GET('/people/{id}/' as any, { params: { path: { id } }, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as Person;
  },

  // Create person
  create: async (data: Omit<Person, 'id' | 'createdAt' | 'updatedAt'>) => {
    const res = await apiClient.POST('/people/' as any, { body: data as any, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as Person;
  },

  // Update person
  update: async (id: number, data: Partial<Person>) => {
    console.log(' [DEBUG] peopleApi.update called with:', {
      id,
      data,
      dataJSON: JSON.stringify(data, null, 2),
      endpoint: `/people/${id}/`
    });
    const res = await apiClient.PATCH(
      '/people/{id}/' as any,
      { params: { path: { id } }, body: data as any, headers: authHeaders(), skipIfMatch: true } as any
    );
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    // Capture optional async job headers (when backend enqueues background work)
    let jobId: string | undefined;
    let jobStatusUrl: string | undefined;
    try {
      const h = res.response?.headers;
      jobId = h?.get?.('X-Job-Id') ?? undefined;
      jobStatusUrl = h?.get?.('X-Job-Status-Url') ?? undefined;
    } catch {}
    const person = res.data as unknown as Person;
    return { ...(person as any), _jobId: jobId, _jobStatusUrl: jobStatusUrl } as Person & { _jobId?: string; _jobStatusUrl?: string };
  },

  // Delete person
  delete: async (id: number) => {
    const res = await apiClient.DELETE('/people/{id}/' as any, { params: { path: { id } }, headers: authHeaders() });
    if (res.error || (res.response && !res.response.ok)) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return;
  },

  // Get person utilization for specific week (optimized to prevent N+1 queries)
  getPersonUtilization: async (personId: number, week?: string): Promise<PersonUtilization> => {
    const queryParams = new URLSearchParams();
    if (week) queryParams.set('week', week);
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return fetchApi<PersonUtilization>(`/people/${personId}/utilization/${queryString}`);
  },

  // Capacity heatmap (supports department/include_children)
  capacityHeatmap: (
    params?: { weeks?: number; department?: string | number; include_children?: 0 | 1 },
    options?: RequestInit
  ) => {
    const query = new URLSearchParams();
    if (params?.weeks) query.set('weeks', String(params.weeks));
    if (params?.department !== undefined && params.department !== '') {
      query.set('department', String(params.department));
    }
    if (params?.include_children != null) query.set('include_children', String(params.include_children));
    const qs = query.toString() ? `?${query.toString()}` : '';
    return fetchApi<PersonCapacityHeatmapItem[]>(`/people/capacity_heatmap/${qs}`, options);
  },

  // Team workload forecast
  workloadForecast: (opts?: { weeks?: number; department?: number; include_children?: 0 | 1 }) => {
    const sp = new URLSearchParams();
    if (opts?.weeks) sp.set('weeks', String(opts.weeks));
    if (opts?.department != null) sp.set('department', String(opts.department));
    if (opts?.include_children != null) sp.set('include_children', String(opts.include_children));
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    return fetchApi<WorkloadForecastItem[]>(`/people/workload_forecast/${qs}`);
  },
  
  // Skill match (server-side ranking)
  skillMatch: (skills: string[], opts?: { department?: number; include_children?: 0 | 1; limit?: number; week?: string }) => {
    const sp = new URLSearchParams();
    if (skills && skills.length) sp.set('skills', skills.join(','));
    if (opts?.department != null) sp.set('department', String(opts.department));
    if (opts?.include_children != null) sp.set('include_children', String(opts.include_children));
    if (opts?.limit != null) sp.set('limit', String(opts.limit));
    if (opts?.week) sp.set('week', opts.week);
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    return fetchApi<Array<{ personId: number; name: string; score: number; matchedSkills: string[]; missingSkills: string[]; departmentId: number | null; roleName?: string | null }>>(`/people/skill_match/${qs}`);
  },

  // Async skill match (returns job id)
  skillMatchAsync: async (skills: string[], opts?: { department?: number; include_children?: 0 | 1; limit?: number; week?: string }) => {
    const sp = new URLSearchParams();
    if (skills && skills.length) sp.set('skills', skills.join(','));
    if (opts?.department != null) sp.set('department', String(opts.department));
    if (opts?.include_children != null) sp.set('include_children', String(opts.include_children));
    if (opts?.limit != null) sp.set('limit', String(opts.limit));
    if (opts?.week) sp.set('week', opts.week);
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    return fetchApi<{ jobId: string }>(`/people/skill_match_async/${qs}`);
  },

  // Find available (availability + skills)
  findAvailable: (
    skills: string[] | undefined,
    opts?: { week?: string; department?: number; include_children?: 0 | 1; limit?: number; minAvailableHours?: number }
  ) => {
    const sp = new URLSearchParams();
    if (skills && skills.length) sp.set('skills', skills.join(','));
    if (opts?.week) sp.set('week', opts.week);
    if (opts?.department != null) sp.set('department', String(opts.department));
    if (opts?.include_children != null) sp.set('include_children', String(opts.include_children));
    if (opts?.limit != null) sp.set('limit', String(opts.limit));
    if (opts?.minAvailableHours != null) sp.set('minAvailableHours', String(opts.minAvailableHours));
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    return fetchApi<Array<{ personId: number; name: string; availableHours: number; capacity: number; utilizationPercent: number; skillScore: number; matchedSkills: string[]; missingSkills: string[]; departmentId: number | null; roleName?: string | null }>>(`/people/find_available/${qs}`);
  },
};

// Core API — Utilization Scheme (Phase 2/3)
export type UtilizationScheme = {
  mode: 'absolute_hours' | 'percent';
  blue_min: number;
  blue_max: number;
  green_min: number;
  green_max: number;
  orange_min: number;
  orange_max: number;
  red_min: number;
  full_capacity_hours: number;
  zero_is_blank: boolean;
  version: number;
  updated_at: string;
};

export const utilizationSchemeApi = {
  get: async (): Promise<UtilizationScheme> => {
    const res = await apiClient.GET('/core/utilization_scheme/' as any, { headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as UtilizationScheme;
  },
  update: async (payload: Omit<UtilizationScheme, 'version' | 'updated_at'>): Promise<UtilizationScheme> => {
    // If-Match header is injected automatically by apiClient based on stored ETag from GET
    const res = await apiClient.PUT('/core/utilization_scheme/' as any, { body: payload as any, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as UtilizationScheme;
  },
};

export const deliverablePhaseMappingApi = {
  get: async (): Promise<DeliverablePhaseMappingSettings> => {
    const res = await apiClient.GET('/core/deliverable_phase_mapping/' as any, { headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as DeliverablePhaseMappingSettings;
  },
  update: async (payload: DeliverablePhaseMappingSettings): Promise<DeliverablePhaseMappingSettings> => {
    const res = await apiClient.PUT('/core/deliverable_phase_mapping/' as any, { body: payload as any, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as DeliverablePhaseMappingSettings;
  },
};

export const qaTaskSettingsApi = {
  get: async (): Promise<QATaskSettings> => {
    const res = await apiClient.GET('/core/qa_task_settings/' as any, { headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as QATaskSettings;
  },
  update: async (payload: Pick<QATaskSettings, 'defaultDaysBefore'>): Promise<QATaskSettings> => {
    const res = await apiClient.PUT('/core/qa_task_settings/' as any, { body: payload as any, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as QATaskSettings;
  },
};

export type AutoHoursRoleSetting = {
  roleId: number;
  roleName: string;
  departmentId: number;
  departmentName: string;
  percentByWeek: Record<string, number>;
  isActive: boolean;
  sortOrder: number;
};

export const autoHoursSettingsApi = {
  list: async (departmentId?: number | null, phase?: string | null): Promise<AutoHoursRoleSetting[]> => {
    const sp = new URLSearchParams();
    if (departmentId != null) sp.set('department_id', String(departmentId));
    if (phase) sp.set('phase', phase);
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    return fetchApi<AutoHoursRoleSetting[]>(`/core/auto-hours-settings/${qs}`, { headers: authHeaders() });
  },
  update: async (
    departmentId: number | null | undefined,
    settings: Array<{ roleId: number; percentByWeek: Record<string, number> }>,
    phase?: string | null
  ): Promise<AutoHoursRoleSetting[]> => {
    const sp = new URLSearchParams();
    if (departmentId != null) sp.set('department_id', String(departmentId));
    if (phase) sp.set('phase', phase);
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    return fetchApi<AutoHoursRoleSetting[]>(`/core/auto-hours-settings/${qs}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ settings }),
    });
  },
};

export const autoHoursTemplatesApi = {
  list: async (): Promise<AutoHoursTemplate[]> => {
    return fetchApi<AutoHoursTemplate[]>(`/core/auto-hours-templates/`, { headers: authHeaders() });
  },
  create: async (payload: { name: string; isActive?: boolean; phaseKeys?: string[] }): Promise<AutoHoursTemplate> => {
    return fetchApi<AutoHoursTemplate>(`/core/auto-hours-templates/`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
  },
  update: async (templateId: number, payload: { name?: string; isActive?: boolean; phaseKeys?: string[] }): Promise<AutoHoursTemplate> => {
    return fetchApi<AutoHoursTemplate>(`/core/auto-hours-templates/${templateId}/`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
  },
  delete: async (templateId: number): Promise<void> => {
    await fetchApi<void>(`/core/auto-hours-templates/${templateId}/`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
  },
  listSettings: async (templateId: number, phase: string, departmentId?: number | null): Promise<AutoHoursRoleSetting[]> => {
    const sp = new URLSearchParams();
    if (phase) sp.set('phase', phase);
    if (departmentId != null) sp.set('department_id', String(departmentId));
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    return fetchApi<AutoHoursRoleSetting[]>(`/core/auto-hours-templates/${templateId}/settings/${qs}`, { headers: authHeaders() });
  },
  updateSettings: async (
    templateId: number,
    settings: Array<{ roleId: number; percentByWeek: Record<string, number> }>,
    phase: string,
    departmentId?: number | null
  ): Promise<AutoHoursRoleSetting[]> => {
    const sp = new URLSearchParams();
    if (phase) sp.set('phase', phase);
    if (departmentId != null) sp.set('department_id', String(departmentId));
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    return fetchApi<AutoHoursRoleSetting[]>(`/core/auto-hours-templates/${templateId}/settings/${qs}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ settings }),
    });
  },
};

// Projects API
export const projectsApi = {
  // Get all projects with pagination support
  list: async (params?: { page?: number; page_size?: number; ordering?: string }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.page_size) queryParams.set('page_size', params.page_size.toString());
    if (params?.ordering) queryParams.set('ordering', params.ordering);
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    const res = await apiClient.GET(`/projects/${queryString}` as any, { headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as PaginatedResponse<Project>;
  },

  // Availability snapshot for a project context
  getAvailability: async (
    projectId: number,
    week?: string,
    opts?: { department?: number; include_children?: 0 | 1; candidates_only?: 0 | 1 }
  ) => {
    const sp = new URLSearchParams();
    if (week) sp.set('week', week);
    if (opts?.department != null) sp.set('department', String(opts.department));
    if (opts?.include_children != null) sp.set('include_children', String(opts.include_children));
    if (opts?.candidates_only != null) sp.set('candidates_only', String(opts.candidates_only));
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    return fetchApi<Array<{ personId: number; personName: string; totalHours: number; capacity: number; availableHours: number; utilizationPercent: number }>>(`/projects/${projectId}/availability/${qs}`);
  },

  // Deliverable tasks for a project
  deliverableTasks: async (projectId: number): Promise<DeliverableTask[]> => {
    const res = await apiClient.GET('/projects/{id}/deliverable_tasks/' as any, { params: { path: { id: projectId } }, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as DeliverableTask[];
  },

  // QA checklist tasks for a project
  qaTasks: async (projectId: number): Promise<DeliverableQATask[]> => {
    const res = await apiClient.GET('/projects/{id}/qa_tasks/' as any, { params: { path: { id: projectId } }, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as DeliverableQATask[];
  },

  // Get all projects (bulk API - Phase 2 optimization)
  // NOTE (OpenAPI Phase 0.7): Keep legacy for ?all=true bulk responses until bulk endpoints are annotated.
  listAll: async (): Promise<Project[]> => {
    return fetchApi<Project[]>(`/projects/?all=true`);
  },

  // Get single project
  get: async (id: number) => {
    const res = await apiClient.GET('/projects/{id}/' as any, { params: { path: { id } }, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as Project;
  },

  // Create project
  create: async (data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => {
    const res = await apiClient.POST('/projects/' as any, { body: data as any, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as Project;
  },

  // Update project
  update: async (id: number, data: Partial<Project>) => {
    const res = await apiClient.PATCH('/projects/{id}/' as any, { params: { path: { id } }, body: data as any, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as Project;
  },

  // Delete project
  delete: async (id: number) => {
    const res = await apiClient.DELETE('/projects/{id}/' as any, { params: { path: { id } }, headers: authHeaders() });
    if (res.error || (res.response && !res.response.ok)) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return;
  },

  // Project audit logs (admin only)
  listProjectAudit: async (limit = 50) => {
    const res = await apiClient.GET(`/projects/audit/?limit=${encodeURIComponent(String(limit))}` as any, { headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as Array<{ id: number; action: string; created_at: string; detail: any; actor?: { username?: string } }>;
  },

  // Get unique clients for autocomplete
  getClients: async (): Promise<string[]> => {
    // Use first page to avoid heavy bulk fetch; adjust if needed
    const page = await projectsApi.list({ page: 1, page_size: 200 });
    const clients = [...new Set((page.results || []).map(p => p.client).filter(Boolean))];
    return clients.sort();
  },

  /**
   * Fetch optimized filter metadata for Projects page.
   * Returns per-project assignment counts and future deliverables flags.
   * Includes a 30s timeout and leverages server-side ETag/Last-Modified.
   */
  getFilterMetadata: async (): Promise<ProjectFilterMetadataResponse> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await apiClient.GET('/projects/filter-metadata/' as any, { headers: authHeaders(), signal: controller.signal });
      if (!res.data) {
        const status = res.response?.status ?? 500;
        throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
      }
      return res.data as unknown as ProjectFilterMetadataResponse;
    } finally {
      clearTimeout(timeout);
    }
  },

};

// Project Risks API
export const projectRisksApi = {
  list: async (projectId: number): Promise<PaginatedResponse<ProjectRisk>> => {
    const res = await fetchApi<PaginatedResponse<ProjectRisk>>(`/projects/${projectId}/risks/`, { headers: authHeaders() });
    return res as PaginatedResponse<ProjectRisk>;
  },
  create: async (projectId: number, formData: FormData): Promise<ProjectRisk> => {
    const url = `${API_BASE_URL}/projects/${projectId}/risks/`;
    const token = getAccessToken();
    const res = await fetch(url, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    });
    if (!res.ok) {
      const status = res.status || 500;
      let data: any = null;
      try { data = await res.json(); } catch {}
      throw new ApiError(friendlyErrorMessage(status, data, `HTTP ${status}`), status, data);
    }
    return (await res.json()) as ProjectRisk;
  },
  update: async (projectId: number, riskId: number, formData: FormData): Promise<ProjectRisk> => {
    const url = `${API_BASE_URL}/projects/${projectId}/risks/${riskId}/`;
    const token = getAccessToken();
    const res = await fetch(url, {
      method: 'PATCH',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    });
    if (!res.ok) {
      const status = res.status || 500;
      let data: any = null;
      try { data = await res.json(); } catch {}
      throw new ApiError(friendlyErrorMessage(status, data, `HTTP ${status}`), status, data);
    }
    return (await res.json()) as ProjectRisk;
  },
  delete: async (projectId: number, riskId: number) => {
    const res = await fetchApi<void>(`/projects/${projectId}/risks/${riskId}/`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return res;
  },
  downloadAttachment: async (projectId: number, riskId: number): Promise<Blob> => {
    const url = `${API_BASE_URL}/projects/${projectId}/risks/${riskId}/attachment/`;
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) {
      const status = res.status || 500;
      throw new ApiError(`Failed to download attachment (HTTP ${status})`, status);
    }
    return res.blob();
  },
};

// Departments API
export const departmentsApi = {
  // Get all departments with pagination support
  list: async (params?: { page?: number; page_size?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.page_size) queryParams.set('page_size', params.page_size.toString());
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    const res = await apiClient.GET(`/departments/${queryString}` as any, { headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as PaginatedResponse<Department>;
  },

  // Get all departments (bulk API - Phase 2 optimization)
  // NOTE (OpenAPI Phase 0.7): Keep legacy for ?all=true bulk responses until bulk endpoints are annotated.
  listAll: async (): Promise<Department[]> => {
    return fetchApiCached<Department[]>(`/departments/?all=true`);
  },

  // Get single department
  get: (id: number) => 
    fetchApi<Department>(`/departments/${id}/`),

  // Create department
  create: (data: Omit<Department, 'id' | 'managerName' | 'createdAt' | 'updatedAt'>) => 
    fetchApi<Department>('/departments/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Update department
  update: (id: number, data: Partial<Department>) => 
    fetchApi<Department>(`/departments/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Delete department
  delete: (id: number) => 
    fetchApi<void>(`/departments/${id}/`, {
      method: 'DELETE',
    }),
};

// Assignment API
export const assignmentsApi = {
  // Get all assignments with pagination support and optional project filtering
  list: (params?: { page?: number; page_size?: number; project?: number; department?: number; include_children?: 0 | 1 }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.page_size) queryParams.set('page_size', params.page_size.toString());
    if (params?.project) queryParams.set('project', params.project.toString());
    if (params?.department != null) queryParams.set('department', String(params.department));
    if (params?.include_children != null) queryParams.set('include_children', String(params.include_children));
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    // Avoid any intermediate caching layers returning stale data after writes
    return fetchApi<PaginatedResponse<Assignment>>(`/assignments/${queryString}`, { headers: { 'Cache-Control': 'no-cache' } });
  },

  // Start async grid snapshot job (returns jobId)
  getGridSnapshotAsync: async (
    opts?: { weeks?: number; department?: number; include_children?: 0 | 1 }
  ): Promise<{ jobId: string }> => {
    const sp = new URLSearchParams();
    if (opts?.weeks != null) sp.set('weeks', String(opts.weeks));
    if (opts?.department != null) sp.set('department', String(opts.department));
    if (opts?.include_children != null) sp.set('include_children', String(opts.include_children));
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    return fetchApi<{ jobId: string }>(`/assignments/grid_snapshot_async/${qs}`);
  },

  // Grid snapshot (server-side aggregation for grid)
  getGridSnapshot: (
    opts?: { weeks?: number; department?: number; include_children?: 0 | 1 },
    options?: RequestInit
  ) => {
    const sp = new URLSearchParams();
    if (opts?.weeks != null) sp.set('weeks', String(opts.weeks));
    if (opts?.department != null) sp.set('department', String(opts.department));
    if (opts?.include_children != null) sp.set('include_children', String(opts.include_children));
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    return fetchApi<{ weekKeys: string[]; people: Array<{ id: number; name: string; weeklyCapacity: number; department: number | null }>; hoursByPerson: Record<string, Record<string, number>> }>(`/assignments/grid_snapshot/${qs}`, options);
  },

  // Bulk weekly hours update
  bulkUpdateHours: async (
    updates: Array<{ assignmentId: number; weeklyHours: Record<string, number> }>
  ) => {
    const res = await apiClient.PATCH('/assignments/bulk_update_hours/' as any, { body: { updates } as any, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as { success: boolean; results: Array<{ assignmentId: number; status: string; etag: string }> };
  },

  // Get all assignments (bulk API - Phase 2 optimization)
  listAll: async (
    filters?: { department?: number; include_children?: 0 | 1 },
    options?: { noCache?: boolean }
  ): Promise<Assignment[]> => {
    const sp = new URLSearchParams();
    sp.set('all', 'true');
    if (filters?.department != null) sp.set('department', String(filters.department));
    if (filters?.include_children != null) sp.set('include_children', String(filters.include_children));
    const qs = sp.toString();
    if (options?.noCache) {
      return fetchApi<Assignment[]>(`/assignments/?${qs}`, { headers: { 'Cache-Control': 'no-cache' } });
    }
    return fetchApiCached<Assignment[]>(`/assignments/?${qs}`);
  },

  // Get assignments for specific person
  byPerson: (personId: number) => 
    fetchApi<Assignment[]>(`/assignments/by_person/?person_id=${personId}`),

  // Get single assignment (detail) to seed ETag for optimistic concurrency
  get: async (id: number): Promise<Assignment> => {
    const res = await apiClient.GET('/assignments/{id}/' as any, { params: { path: { id } }, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as Assignment;
  },

  // Create assignment
  create: async (data: Omit<Assignment, 'id' | 'createdAt' | 'updatedAt' | 'personName'>) => {
    const res = await apiClient.POST('/assignments/' as any, { body: data as any, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as Assignment;
  },

  // Update assignment
  update: async (id: number, data: Partial<Assignment>) => {
    const res = await apiClient.PATCH('/assignments/{id}/' as any, { params: { path: { id } }, body: data as any, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as Assignment;
  },

  // Delete assignment
  delete: async (id: number) => {
    const res = await apiClient.DELETE('/assignments/{id}/' as any, { params: { path: { id } }, headers: authHeaders() });
    if (res.error || (res.response && !res.response.ok)) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return;
  },

  // Check assignment conflicts (optimized to prevent N+1 queries)
  checkConflicts: async (
    personId: number,
    projectId: number,
    weekKey: string,
    proposedHours: number
  ): Promise<AssignmentConflictResponse> => {
    const payload = { personId, projectId, weekKey, proposedHours } as any;
    const res = await apiClient.POST('/assignments/check_conflicts/' as any, { body: payload, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as AssignmentConflictResponse;
  },
}; 

// Person utilization API
export const utilizationApi = {
  // Get person utilization
  getPersonUtilization: (personId: number) =>
    fetchApi<PersonUtilization>(`/people/${personId}/utilization/`),
};

// Note: jobsApi is defined below (typed-client backed). We'll extend it with a simple poller after its declaration.

// Deliverables API - STANDARDS COMPLIANT
export const deliverablesApi = {
  // Get all deliverables or filter by project with pagination support
  list: async (projectId?: number, params?: { page?: number; page_size?: number }) => {
    const queryParams = new URLSearchParams();
    if (projectId) queryParams.set('project', projectId.toString());
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.page_size) queryParams.set('page_size', params.page_size.toString());
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    const res = await apiClient.GET(`/deliverables/${queryString}` as any, { headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as PaginatedResponse<Deliverable>;
  },

  // Get all deliverables (bulk API - Phase 2 optimization)
  listAll: async (projectId?: number): Promise<Deliverable[]> => {
    const queryParams = new URLSearchParams();
    if (projectId) queryParams.set('project', projectId.toString());
    queryParams.set('all', 'true');
    const queryString = queryParams.toString();
    return fetchApi<Deliverable[]>(`/deliverables/?${queryString}`);
  },

  // Get single deliverable  
  get: async (id: number) => {
    const res = await apiClient.GET('/deliverables/{id}/' as any, { params: { path: { id } }, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as Deliverable;
  },

  // Create deliverable
  create: async (data: Omit<Deliverable, 'id' | 'createdAt' | 'updatedAt'>) => {
    const res = await apiClient.POST('/deliverables/' as any, { body: data as any, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    try { invalidateDeliverablesCache(); } catch {}
    return res.data as unknown as Deliverable;
  },

  // Update deliverable
  update: async (id: number, data: Partial<Deliverable>) => {
    const res = await apiClient.PATCH('/deliverables/{id}/' as any, { params: { path: { id } }, body: data as any, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    try { invalidateDeliverablesCache(); } catch {}
    return res.data as unknown as Deliverable;
  },

  // Delete deliverable
  delete: async (id: number) => {
    const res = await apiClient.DELETE('/deliverables/{id}/' as any, { params: { path: { id } }, headers: authHeaders() });
    if (res.error || (res.response && !res.response.ok)) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    try { invalidateDeliverablesCache(); } catch {}
    return;
  },

  // Bulk fetch deliverables for multiple projects (Phase 2 optimization)
  bulkList: async (projectIds: number[]): Promise<{ [projectId: string]: Deliverable[] }> => {
    if (projectIds.length === 0) return {};
    
    const projectIdsString = projectIds.join(',');
    return fetchApi<{ [projectId: string]: Deliverable[] }>(`/deliverables/bulk/?project_ids=${projectIdsString}`);
  },

  // Reorder deliverables for a project
  reorder: (projectId: number, deliverableIds: number[]) =>
    fetchApi<void>('/deliverables/reorder/', {
      method: 'POST',
      body: JSON.stringify({ 
        project: projectId, 
        deliverable_ids: deliverableIds 
      }),
    }),

  // Milestone calendar within date range
  calendar: async (start?: string, end?: string) => {
    const params = new URLSearchParams();
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await apiClient.GET(`/deliverables/calendar/${qs}` as any, { headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as DeliverableCalendarItem[];
  },

  // Deliverable staffing summary (derived hours) for a given deliverable
  staffingSummary: async (deliverableId: number, weeks?: number) => {
    const qs = weeks ? `?weeks=${weeks}` : '';
    const res = await apiClient.GET(`/deliverables/{id}/staffing_summary/${qs}` as any, { params: { path: { id: deliverableId } }, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as DeliverableStaffingSummaryItem[];
  },

  // Staff-only: trigger pre-deliverables backfill
  backfillPreItems: async (opts: { projectId?: number; start?: string; end?: string; regenerate?: boolean }) => {
    const body: any = {};
    if (opts?.projectId != null) body.projectId = opts.projectId;
    if (opts?.start) body.start = opts.start;
    if (opts?.end) body.end = opts.end;
    if (opts?.regenerate != null) body.regenerate = !!opts.regenerate;
    const res = await apiClient.POST('/deliverables/pre_deliverable_items/backfill/' as any, { body, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, res.error, `HTTP ${status}`), status);
    }
    return res.data as unknown as { enqueued: boolean; jobId?: string; statusUrl?: string; result?: any };
  },
};

export const deliverableTaskTemplatesApi = {
  list: async (params?: { page?: number; page_size?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.page_size) queryParams.set('page_size', params.page_size.toString());
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    const res = await apiClient.GET(`/deliverables/task_templates/${queryString}` as any, { headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as PaginatedResponse<DeliverableTaskTemplate>;
  },
  create: async (data: Omit<DeliverableTaskTemplate, 'id' | 'createdAt' | 'updatedAt' | 'departmentName'>) => {
    const res = await apiClient.POST('/deliverables/task_templates/' as any, { body: data as any, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as DeliverableTaskTemplate;
  },
  update: async (id: number, data: Partial<DeliverableTaskTemplate>) => {
    const res = await apiClient.PATCH('/deliverables/task_templates/{id}/' as any, { params: { path: { id } }, body: data as any, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as DeliverableTaskTemplate;
  },
  delete: async (id: number) => {
    const res = await apiClient.DELETE('/deliverables/task_templates/{id}/' as any, { params: { path: { id } }, headers: authHeaders() });
    if (res.error || (res.response && !res.response.ok)) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return;
  },
};

export const deliverableTasksApi = {
  list: async (params?: { project?: number; deliverable?: number; page?: number; page_size?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.project) queryParams.set('project', params.project.toString());
    if (params?.deliverable) queryParams.set('deliverable', params.deliverable.toString());
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.page_size) queryParams.set('page_size', params.page_size.toString());
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    const res = await apiClient.GET(`/deliverables/tasks/${queryString}` as any, { headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as PaginatedResponse<DeliverableTask>;
  },
  update: async (id: number, data: Partial<DeliverableTask>) => {
    const res = await apiClient.PATCH('/deliverables/tasks/{id}/' as any, { params: { path: { id } }, body: data as any, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as DeliverableTask;
  },
};

export const deliverableQaTasksApi = {
  update: async (id: number, data: Partial<DeliverableQATask>) => {
    const res = await apiClient.PATCH('/deliverables/qa_tasks/{id}/' as any, { params: { path: { id } }, body: data as any, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as DeliverableQATask;
  },
};

// Dashboard API
export const dashboardApi = {
  // Get dashboard data with optional weeks and department parameters
  getDashboard: async (weeks?: number, department?: string) => {
    const params = new URLSearchParams();
    if (weeks && weeks !== 1) params.set('weeks', weeks.toString());
    if (department) params.set('department', department);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    const res = await apiClient.GET(`/dashboard/${queryString}` as any, { headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as DashboardData;
  },
};

// Skills API
export const skillTagsApi = {
  // List skill tags
  list: (params?: { search?: string }) => {
    const queryParams = params ? new URLSearchParams(
      Object.entries(params).filter(([_, value]) => value !== undefined && value !== '')
        .map(([key, value]) => [key, String(value)])
    ).toString() : '';
    const url = queryParams ? `/skills/skill-tags/?${queryParams}` : '/skills/skill-tags/';
    return fetchApi<PaginatedResponse<SkillTag>>(url);
  },

  // Get skill tag
  get: (id: number) =>
    fetchApi<SkillTag>(`/skills/skill-tags/${id}/`),

  // Create skill tag
  create: async (data: Omit<SkillTag, 'id' | 'isActive' | 'createdAt' | 'updatedAt'>) => {
    const res = await apiClient.POST('/skills/skill-tags/' as any, { body: data as any, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as SkillTag;
  },

  // Update skill tag
  update: async (id: number, data: Partial<SkillTag>) => {
    const res = await apiClient.PATCH('/skills/skill-tags/{id}/' as any, { params: { path: { id } }, body: data as any, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as SkillTag;
  },

  // Delete skill tag
  delete: async (id: number) => {
    const res = await apiClient.DELETE('/skills/skill-tags/{id}/' as any, { params: { path: { id } }, headers: authHeaders() });
    if (res.error || (res.response && !res.response.ok)) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return;
  },
};

export const personSkillsApi = {
  // List person skills
  list: (params?: { person?: number; skill_type?: string; search?: string; page_size?: number }) => {
    const queryParams = params ? new URLSearchParams(
      Object.entries(params).filter(([_, value]) => value !== undefined && value !== '')
        .map(([key, value]) => [key, String(value)])
    ).toString() : '';
    const url = queryParams ? `/skills/person-skills/?${queryParams}` : '/skills/person-skills/';
    return fetchApi<PaginatedResponse<PersonSkill>>(url);
  },

  // Get person skill
  get: (id: number) =>
    fetchApi<PersonSkill>(`/skills/person-skills/${id}/`),

  // Create person skill
  create: async (data: Omit<PersonSkill, 'id' | 'skillTagName' | 'createdAt' | 'updatedAt'>) => {
    const res = await apiClient.POST('/skills/person-skills/' as any, { body: data as any, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as PersonSkill;
  },

  // Update person skill
  update: async (id: number, data: Partial<PersonSkill>) => {
    const res = await apiClient.PATCH('/skills/person-skills/{id}/' as any, { params: { path: { id } }, body: data as any, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as PersonSkill;
  },

  // Delete person skill
  delete: async (id: number) => {
    const res = await apiClient.DELETE('/skills/person-skills/{id}/' as any, { params: { path: { id } }, headers: authHeaders() });
    if (res.error || (res.response && !res.response.ok)) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return;
  },

  // Get skill summary for a person
  summary: (personId: number) =>
    fetchApi<{
      strengths: Array<{ skillTagName: string; skillType: string; proficiencyLevel: string }>;
      development: Array<{ skillTagName: string; skillType: string; proficiencyLevel: string }>;
      learning: Array<{ skillTagName: string; skillType: string; proficiencyLevel: string }>;
    }>(`/skills/person-skills/summary/?person=${personId}`),
};

// Roles API - for role management and dropdowns
export const rolesApi = {
  // Get all roles (paginated)
  list: async () => {
    const res = await apiClient.GET('/roles/' as any, { headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as PaginatedResponse<Role>;
  },

  // Get all roles (bulk) - for autocomplete/dropdowns
  listAll: () => fetchApi<Role[]>('/roles/bulk/'),

  // Get single role
  get: (id: number) => fetchApi<Role>(`/roles/${id}/`),

  // Create new role
  create: (data: Partial<Role>) =>
    fetchApi<Role>('/roles/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Update role
  update: (id: number, data: Partial<Role>) =>
    fetchApi<Role>(`/roles/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Delete role
  delete: (id: number) =>
    fetchApi<void>(`/roles/${id}/`, {
      method: 'DELETE',
    }),

  // Bulk reorder roles by ids (staff only)
  reorder: async (ids: number[]) => {
    const res = await apiClient.POST('/roles/reorder/' as any, { body: { ids } as any, headers: authHeaders() });
    if (!res.data && (res.response?.status ?? 200) >= 400) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, res.error, `HTTP ${status}`), status);
    }
    return true as const;
  },
};

// Jobs API (async background tasks)
export const jobsApi = {
  // Get job status
  getStatus: async (jobId: string) => {
    const res = await apiClient.GET('/jobs/{job_id}/' as any, { params: { path: { job_id: jobId } }, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as JobStatus;
  },

  // Download job result file (if available). Returns a Blob.
  downloadFile: async (jobId: string): Promise<Blob> => {
    const url = `${API_BASE_URL}/jobs/${jobId}/download/`;
    const token = getAccessToken();
    const res = await fetch(url, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) {
      throw new ApiError(`HTTP ${res.status}`, res.status);
    }
    return await res.blob();
  },
  // Simple polling helper for convenience
  pollStatus: async (jobId: string, { intervalMs = 1500, timeoutMs = 120000 }: { intervalMs?: number; timeoutMs?: number } = {}) => {
    const started = Date.now();
    while (true) {
      const s = await jobsApi.getStatus(jobId);
      if ((s as any).state === 'SUCCESS') return s;
      if ((s as any).state === 'FAILURE') throw new ApiError((s as any).error || 'Job failed', 500);
      if (Date.now() - started > timeoutMs) throw new ApiError('Job polling timed out', 504);
      await new Promise(r => setTimeout(r, intervalMs));
    }
  },
};

// Backups API
export const backupApi = {
  // Create a backup (async task)
  createBackup: async (description?: string): Promise<{ jobId: string; statusUrl: string }> => {
    const payload = description ? { description } : {};
    const res = await apiClient.POST('/backups/' as any, { body: payload as any, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, res.error, `HTTP ${status}`), status);
    }
    return res.data as any;
  },

  // List available backups
  getBackups: async (): Promise<BackupListResponse> => {
    const res = await apiClient.GET('/backups/' as any, { headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as any;
  },

  // Status summary for dashboards
  getBackupStatus: async (): Promise<BackupStatus> => {
    const res = await apiClient.GET('/backups/status/' as any, { headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as any;
  },

  // Delete a backup by id (filename)
  deleteBackup: async (id: string): Promise<void> => {
    const res = await apiClient.DELETE('/backups/{id}/' as any, { params: { path: { id: encodeURIComponent(id) } }, headers: authHeaders() });
    if (res.error || (res.response && !res.response.ok)) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return;
  },

  // Restore from an existing backup (async task)
  restoreBackup: async (
    id: string,
    confirm: string,
    options?: { jobs?: number; migrate?: boolean }
  ): Promise<{ jobId: string; statusUrl: string }> => {
    const body: any = { confirm };
    if (options?.jobs != null) body.jobs = options.jobs;
    if (options?.migrate != null) body.migrate = options.migrate;
    const res = await apiClient.POST('/backups/{id}/restore/' as any, { params: { path: { id: encodeURIComponent(id) } }, body, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, res.error, `HTTP ${status}`), status);
    }
    return res.data as any;
  },

  // Upload a backup file and immediately restore it (async task)
  uploadAndRestore: async (
    file: File,
    confirm: string,
    options?: { jobs?: number; migrate?: boolean; signal?: AbortSignal }
  ): Promise<{ jobId: string; statusUrl: string }> => {
    const url = `${API_BASE_URL}/backups/upload-restore/`;
    const form = new FormData();
    form.append('file', file);
    form.append('confirm', confirm);
    if (options?.jobs != null) form.append('jobs', String(options.jobs));
    if (options?.migrate != null) form.append('migrate', String(options.migrate));
    const token = getAccessToken();
    const res = await fetch(url, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
      signal: options?.signal,
    });
    if (!res.ok) {
      const status = res.status;
      let data: any = null;
      try { data = await res.json(); } catch {}
      throw new ApiError(friendlyErrorMessage(status, data, `HTTP ${status}`), status, data);
    }
    return await res.json();
  },
};

// System API (capabilities, etc.)
export const systemApi = {
  getCapabilities: async (): Promise<SystemCapabilities> => {
    return fetchApi<SystemCapabilities>(`/capabilities/`);
  },
};

export { ApiError };

// Deliverable Assignments API
export const deliverableAssignmentsApi = {
  // List all active assignments (use ?all=true for bulk)
  list: (params?: { all?: boolean }) => {
    const qs = params?.all ? '?all=true' : '';
    return fetchApi<DeliverableAssignment[]>(`/deliverables/assignments/${qs}`);
  },

  // Filter by deliverable
  byDeliverable: async (deliverableId: number) => {
    const res = await apiClient.GET('/deliverables/assignments/by_deliverable/' as any, { params: { query: { deliverable: deliverableId } }, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as DeliverableAssignment[];
  },

  // Filter by person
  byPerson: async (personId: number) => {
    const res = await apiClient.GET('/deliverables/assignments/by_person/' as any, { params: { query: { person: personId } }, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as DeliverableAssignment[];
  },

  // Create (link)
  create: async (data: Omit<DeliverableAssignment, 'id' | 'personName' | 'projectId' | 'createdAt' | 'updatedAt' | 'isActive'> & { isActive?: boolean }) => {
    const res = await apiClient.POST('/deliverables/assignments/' as any, { body: data as any, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as DeliverableAssignment;
  },

  // Update (partial)
  update: async (id: number, data: Partial<DeliverableAssignment>) => {
    const res = await apiClient.PATCH('/deliverables/assignments/{id}/' as any, { params: { path: { id } }, body: data as any, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as unknown as DeliverableAssignment;
  },

  // Delete (unlink)
  delete: async (id: number) => {
    const res = await apiClient.DELETE('/deliverables/assignments/{id}/' as any, { params: { path: { id } }, headers: authHeaders() });
    if (res.error || (res.response && !res.response.ok)) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return;
  },
};

// Auth/Accounts API
export const authApi = {
  // Link or unlink the current user to a person
  linkPerson: async (personId: number | null) => {
    const payload = { person_id: personId } as any;
    const res = await apiClient.POST('/auth/link_person/' as any, { body: payload, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as any;
  },
  // Change password for current user
  changePassword: async (currentPassword: string, newPassword: string) => {
    const payload = { currentPassword, newPassword } as any;
    const res = await apiClient.POST('/auth/change_password/' as any, { body: payload, headers: authHeaders() });
    if (res.error || (res.response && !res.response.ok)) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return;
  },
  // Create a new user (staff only)
  createUser: async (data: { username: string; email?: string; password: string; personId?: number | null; role?: 'admin' | 'manager' | 'user' }) => {
    const res = await apiClient.POST('/auth/create_user/' as any, { body: data as any, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as any;
  },
  // List users (admin only)
  listUsers: async () => {
    const res = await apiClient.GET('/auth/users/' as any, { headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as any;
  },
  // Delete user (admin only)
  deleteUser: async (userId: number) => {
    const res = await apiClient.DELETE('/auth/users/{id}/' as any, { params: { path: { id: userId } }, headers: authHeaders() });
    if (res.error || (res.response && !res.response.ok)) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return;
  },
  // Set user role (admin only)
  setUserRole: async (userId: number, role: 'admin' | 'manager' | 'user') => {
    const res = await apiClient.POST('/auth/users/{id}/role/' as any, { params: { path: { id: userId } }, body: { role } as any, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as any;
  },
  // Request password reset (anonymous)
  requestPasswordReset: async (email: string) => {
    // Do not send auth headers intentionally
    const res = await apiClient.POST('/auth/password_reset/' as any, { body: { email } as any });
    if (res.error || (res.response && !res.response.ok)) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return;
  },
  // Confirm password reset with token
  confirmPasswordReset: async (uid: string, token: string, newPassword: string) => {
    const res = await apiClient.POST('/auth/password_reset_confirm/' as any, { body: { uid, token, newPassword } as any });
    if (res.error || (res.response && !res.response.ok)) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return;
  },
  // Invite a user (admin only)
  inviteUser: async (data: { email: string; username?: string; personId?: number | null; role?: 'admin'|'manager'|'user' }) => {
    const res = await apiClient.POST('/auth/invite/' as any, { body: data as any, headers: authHeaders() });
    if (res.error || (res.response && !res.response.ok)) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return;
  },
  // Link/unlink a user to a person (admin only)
  setUserPerson: async (userId: number, personId: number | null) => {
    const res = await apiClient.POST('/auth/users/{id}/link_person/' as any, { params: { path: { id: userId } }, body: { personId } as any, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as any;
  },
  // Admin audit logs (admin only)
  listAdminAudit: async (limit = 50) => {
    const res = await apiClient.GET(`/auth/admin_audit/?limit=${encodeURIComponent(String(limit))}` as any, { headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new ApiError(friendlyErrorMessage(status, null, `HTTP ${status}`), status);
    }
    return res.data as Array<{ id: number; action: string; created_at: string; detail: any; actor?: { username?: string }; targetUser?: { username?: string } }>;
  },
};
