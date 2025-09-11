/**
 * API service layer - handles all backend communication
 * Uses naming prevention: frontend camelCase <-> backend snake_case
 */

import { Person, Project, Assignment, Department, Deliverable, DeliverableAssignment, DeliverableCalendarItem, DeliverableStaffingSummaryItem, PersonCapacityHeatmapItem, WorkloadForecastItem, PersonUtilization, ApiResponse, PaginatedResponse, DashboardData, SkillTag, PersonSkill, AssignmentConflictResponse, Role, ProjectFilterMetadataResponse, JobStatus } from '@/types/models';
import { getAccessToken } from '@/utils/auth';
import { refreshAccessToken as refreshAccessTokenSafe } from '@/store/auth';
import { showToast } from '@/lib/toastBus';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

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

function friendlyErrorMessage(status: number, data: any, fallback: string): string {
  // Try common DRF shapes first
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
      return 'Network error — unable to reach the server.';
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

// Lightweight in-memory cache to coalesce duplicate GETs and short-cache results
type CacheEntry<T> = { promise: Promise<T>; timestamp: number; data?: T };
const inflightRequests = new Map<string, CacheEntry<any>>();
const responseCache = new Map<string, CacheEntry<any>>();
// Store ETags by endpoint for conditional requests (detail routes)
const etagStore = new Map<string, string>();
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
        // Store raw value without quotes for matching convenience
        etagStore.set(endpoint, etag.replace(/^"|"$/g, ''));
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
  list: (params?: { page?: number; page_size?: number; search?: string; department?: number; include_children?: 0 | 1 }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.page_size) queryParams.set('page_size', params.page_size.toString());
    if (params?.search) queryParams.set('search', params.search);
    if (params?.department != null) queryParams.set('department', String(params.department));
    if (params?.include_children != null) queryParams.set('include_children', String(params.include_children));
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return fetchApi<PaginatedResponse<Person>>(`/people/${queryString}`);
  },

  // Get all people (bulk API - Phase 2 optimization)
  listAll: async (filters?: { department?: number; include_children?: 0 | 1 }): Promise<Person[]> => {
    const sp = new URLSearchParams();
    sp.set('all', 'true');
    if (filters?.department != null) sp.set('department', String(filters.department));
    if (filters?.include_children != null) sp.set('include_children', String(filters.include_children));
    const qs = sp.toString();
  return fetchApiCached<Person[]>(`/people/?${qs}`);
  },

  // Server-side search for people (typeahead)
  search: async (q: string, limit = 20): Promise<Array<{ id: number; name: string; department?: number }>> => {
    const sp = new URLSearchParams();
    sp.set('q', q);
    if (limit) sp.set('limit', String(limit));
    return fetchApi<Array<{ id: number; name: string; department?: number }>>(`/people/search/?${sp.toString()}`);
  },

  // Autocomplete endpoint (Phase 3/4 wiring)
  autocomplete: async (search?: string, limit?: number): Promise<Array<{ id: number; name: string; department: number | null }>> => {
    const sp = new URLSearchParams();
    if (search) sp.set('search', search);
    if (limit != null) sp.set('limit', String(limit));
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    return fetchApi<Array<{ id: number; name: string; department: number | null }>>(`/people/autocomplete/${qs}`);
  },

  // Get single person
  get: (id: number) => 
    fetchApi<Person>(`/people/${id}/`),

  // Create person
  create: (data: Omit<Person, 'id' | 'createdAt' | 'updatedAt'>) => 
    fetchApi<Person>('/people/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Update person
  update: (id: number, data: Partial<Person>) => {
    console.log(' [DEBUG] peopleApi.update called with:', {
      id,
      data,
      dataJSON: JSON.stringify(data, null, 2),
      endpoint: `/people/${id}/`
    });
    return fetchApi<Person>(`/people/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // Delete person
  delete: (id: number) => 
    fetchApi<void>(`/people/${id}/`, {
      method: 'DELETE',
    }),

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
};

// Projects API
export const projectsApi = {
  // Get all projects with pagination support
  list: (params?: { page?: number; page_size?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.page_size) queryParams.set('page_size', params.page_size.toString());
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return fetchApi<PaginatedResponse<Project>>(`/projects/${queryString}`);
  },

  // Get all projects (bulk API - Phase 2 optimization)
  listAll: async (): Promise<Project[]> => {
    return fetchApi<Project[]>(`/projects/?all=true`);
  },

  // Get single project
  get: (id: number) => 
    fetchApi<Project>(`/projects/${id}/`),

  // Create project
  create: (data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => 
    fetchApi<Project>('/projects/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Update project
  update: (id: number, data: Partial<Project>) => 
    fetchApi<Project>(`/projects/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Delete project
  delete: (id: number) => 
    fetchApi<void>(`/projects/${id}/`, {
      method: 'DELETE',
    }),

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
      return await fetchApi<ProjectFilterMetadataResponse>(`/projects/filter-metadata/`, {
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  },

};

// Departments API
export const departmentsApi = {
  // Get all departments with pagination support
  list: (params?: { page?: number; page_size?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.page_size) queryParams.set('page_size', params.page_size.toString());
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return fetchApi<PaginatedResponse<Department>>(`/departments/${queryString}`);
  },

  // Get all departments (bulk API - Phase 2 optimization)
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
    return fetchApi<PaginatedResponse<Assignment>>(`/assignments/${queryString}`);
  },

  // Get all assignments (bulk API - Phase 2 optimization)
  listAll: async (filters?: { department?: number; include_children?: 0 | 1 }): Promise<Assignment[]> => {
    const sp = new URLSearchParams();
    sp.set('all', 'true');
    if (filters?.department != null) sp.set('department', String(filters.department));
    if (filters?.include_children != null) sp.set('include_children', String(filters.include_children));
  return fetchApiCached<Assignment[]>(`/assignments/?${sp.toString()}`);
  },

  // Get assignments for specific person
  byPerson: (personId: number) => 
    fetchApi<Assignment[]>(`/assignments/by_person/?person_id=${personId}`),

  // Create assignment
  create: (data: Omit<Assignment, 'id' | 'createdAt' | 'updatedAt' | 'personName'>) => 
    fetchApi<Assignment>('/assignments/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Update assignment
  update: (id: number, data: Partial<Assignment>) => 
    fetchApi<Assignment>(`/assignments/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Delete assignment
  delete: (id: number) => 
    fetchApi<void>(`/assignments/${id}/`, {
      method: 'DELETE',
    }),

  // Check assignment conflicts (optimized to prevent N+1 queries)
  checkConflicts: async (
    personId: number, 
    projectId: number, 
    weekKey: string, 
    proposedHours: number
  ): Promise<AssignmentConflictResponse> => {
    return fetchApi<AssignmentConflictResponse>('/assignments/check_conflicts/', {
      method: 'POST',
      body: JSON.stringify({
        personId,
        projectId,
        weekKey,
        proposedHours
      }),
    });
  },
};

// Person utilization API
export const utilizationApi = {
  // Get person utilization
  getPersonUtilization: (personId: number) =>
    fetchApi<PersonUtilization>(`/people/${personId}/utilization/`),
};

// Deliverables API - STANDARDS COMPLIANT
export const deliverablesApi = {
  // Get all deliverables or filter by project with pagination support
  list: (projectId?: number, params?: { page?: number; page_size?: number }) => {
    const queryParams = new URLSearchParams();
    if (projectId) queryParams.set('project', projectId.toString());
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.page_size) queryParams.set('page_size', params.page_size.toString());
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return fetchApi<PaginatedResponse<Deliverable>>(`/deliverables/${queryString}`);
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
  get: (id: number) =>
    fetchApi<Deliverable>(`/deliverables/${id}/`),

  // Create deliverable
  create: (data: Omit<Deliverable, 'id' | 'createdAt' | 'updatedAt'>) =>
    fetchApi<Deliverable>('/deliverables/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Update deliverable
  update: (id: number, data: Partial<Deliverable>) =>
    fetchApi<Deliverable>(`/deliverables/${id}/`, {
      method: 'PATCH', 
      body: JSON.stringify(data),
    }),

  // Delete deliverable
  delete: (id: number) =>
    fetchApi<void>(`/deliverables/${id}/`, {
      method: 'DELETE',
    }),

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
  calendar: (start?: string, end?: string) => {
    const params = new URLSearchParams();
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return fetchApi<DeliverableCalendarItem[]>(`/deliverables/calendar/${qs}`);
  },

  // Deliverable staffing summary (derived hours) for a given deliverable
  staffingSummary: (deliverableId: number, weeks?: number) => {
    const qs = weeks ? `?weeks=${weeks}` : '';
    return fetchApi<DeliverableStaffingSummaryItem[]>(`/deliverables/${deliverableId}/staffing_summary/${qs}`);
  },
};

// Dashboard API
export const dashboardApi = {
  // Get dashboard data with optional weeks and department parameters
  getDashboard: (weeks?: number, department?: string) => {
    const params = new URLSearchParams();
    if (weeks && weeks !== 1) params.set('weeks', weeks.toString());
    if (department) params.set('department', department);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return fetchApi<DashboardData>(`/dashboard/${queryString}`);
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
  create: (data: Omit<SkillTag, 'id' | 'isActive' | 'createdAt' | 'updatedAt'>) =>
    fetchApi<SkillTag>('/skills/skill-tags/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Update skill tag
  update: (id: number, data: Partial<SkillTag>) =>
    fetchApi<SkillTag>(`/skills/skill-tags/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Delete skill tag
  delete: (id: number) =>
    fetchApi<void>(`/skills/skill-tags/${id}/`, {
      method: 'DELETE',
    }),
};

export const personSkillsApi = {
  // List person skills
  list: (params?: { person?: number; skill_type?: string }) => {
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
  create: (data: Omit<PersonSkill, 'id' | 'skillTagName' | 'createdAt' | 'updatedAt'>) =>
    fetchApi<PersonSkill>('/skills/person-skills/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Update person skill
  update: (id: number, data: Partial<PersonSkill>) =>
    fetchApi<PersonSkill>(`/skills/person-skills/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Delete person skill
  delete: (id: number) =>
    fetchApi<void>(`/skills/person-skills/${id}/`, {
      method: 'DELETE',
    }),

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
  list: () => fetchApi<PaginatedResponse<Role>>('/roles/'),

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
};

// Jobs API (async background tasks)
export const jobsApi = {
  // Get job status
  getStatus: (jobId: string) => 
    fetchApi<JobStatus>(`/jobs/${jobId}/`),

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
  byDeliverable: (deliverableId: number) =>
    fetchApi<DeliverableAssignment[]>(`/deliverables/assignments/by_deliverable/?deliverable=${deliverableId}`),

  // Filter by person
  byPerson: (personId: number) =>
    fetchApi<DeliverableAssignment[]>(`/deliverables/assignments/by_person/?person=${personId}`),

  // Create
  create: (data: Omit<DeliverableAssignment, 'id' | 'personName' | 'projectId' | 'createdAt' | 'updatedAt' | 'isActive'> & { isActive?: boolean }) =>
    fetchApi<DeliverableAssignment>('/deliverables/assignments/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Update (partial)
  update: (id: number, data: Partial<DeliverableAssignment>) =>
    fetchApi<DeliverableAssignment>(`/deliverables/assignments/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Delete
  delete: (id: number) =>
    fetchApi<void>(`/deliverables/assignments/${id}/`, {
      method: 'DELETE',
    }),
};

// Auth/Accounts API
export const authApi = {
  // Link or unlink the current user to a person
  linkPerson: (personId: number | null) =>
    fetchApi<{ id: number; user: any; person: any; settings: any }>(`/auth/link_person/`, {
      method: 'POST',
      body: JSON.stringify({ person_id: personId }),
    }),
  // Change password for current user
  changePassword: (currentPassword: string, newPassword: string) =>
    fetchApi<void>(`/auth/change_password/`, {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  // Create a new user (staff only)
  createUser: (data: { username: string; email?: string; password: string; personId?: number | null; role?: 'admin' | 'manager' | 'user' }) =>
    fetchApi<{ id: number; user: any; person: any; settings: any }>(`/auth/create_user/`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  // List users (admin only)
  listUsers: () => fetchApi<Array<{ id: number; username: string; email: string; role: 'admin'|'manager'|'user'; person: { id: number; name: string } | null }>>(`/auth/users/`),
  // Delete user (admin only)
  deleteUser: (userId: number) => fetchApi<void>(`/auth/users/${userId}/`, { method: 'DELETE' }),
};
