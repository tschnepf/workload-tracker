import { apiClient, authHeaders } from '@/api/client';
import {
  clearApiInflightPromise,
  readApiCachedData,
  readApiInflightPromise,
  writeApiCachedData,
  writeApiInflightPromise,
} from '@/lib/fetchApiCache';

const ANALYTICS_TTL_MS = 15000;

function withCachedGet<T>(endpoint: string, loader: () => Promise<T>, ttlMs = ANALYTICS_TTL_MS): Promise<T> {
  const key = `GET ${endpoint}`;
  const now = Date.now();
  const cached = readApiCachedData<T>(key, ttlMs, now);
  if (cached !== undefined) return Promise.resolve(cached);

  const inflight = readApiInflightPromise<T>(key);
  if (inflight) return inflight;

  const promise = loader()
    .then((data) => {
      writeApiCachedData(key, promise, data, Date.now());
      clearApiInflightPromise(key);
      return data;
    })
    .catch((err) => {
      clearApiInflightPromise(key);
      throw err;
    });

  writeApiInflightPromise(key, promise, now);
  return promise;
}

export async function getAssignedHoursByClient(opts?: { weeks?: number; department?: number; include_children?: 0|1; vertical?: number; visibility_scope?: string }) {
  const sp = new URLSearchParams();
  if (opts?.weeks != null) sp.set('weeks', String(opts.weeks));
  if (opts?.department != null) sp.set('department', String(opts.department));
  if (opts?.include_children != null) sp.set('include_children', String(opts.include_children));
  if (opts?.vertical != null) sp.set('vertical', String(opts.vertical));
  if (opts?.visibility_scope) sp.set('visibility_scope', opts.visibility_scope);
  const qs = sp.toString() ? `?${sp.toString()}` : '';
  const endpoint = `/assignments/analytics_by_client/${qs}`;
  return withCachedGet(endpoint, async () => {
    const res = await apiClient.GET(endpoint as any, { headers: authHeaders() });
    if (!res.data) throw new Error(`HTTP ${res.response?.status ?? 500}`);
    return res.data as unknown as { clients: Array<{ label: string; hours: number }> };
  });
}

export async function getAssignedHoursClientProjects(client: string, opts?: { weeks?: number; department?: number; include_children?: 0|1; vertical?: number; visibility_scope?: string }) {
  const sp = new URLSearchParams();
  sp.set('client', client);
  if (opts?.weeks != null) sp.set('weeks', String(opts.weeks));
  if (opts?.department != null) sp.set('department', String(opts.department));
  if (opts?.include_children != null) sp.set('include_children', String(opts.include_children));
  if (opts?.vertical != null) sp.set('vertical', String(opts.vertical));
  if (opts?.visibility_scope) sp.set('visibility_scope', opts.visibility_scope);
  const qs = `?${sp.toString()}`;
  const endpoint = `/assignments/analytics_client_projects/${qs}`;
  return withCachedGet(endpoint, async () => {
    const res = await apiClient.GET(endpoint as any, { headers: authHeaders() });
    if (!res.data) throw new Error(`HTTP ${res.response?.status ?? 500}`);
    return res.data as unknown as { projects: Array<{ id: number; name: string; hours: number }> };
  });
}

export async function getAssignedHoursStatusTimeline(opts?: { weeks?: number; department?: number; include_children?: 0|1; vertical?: number; visibility_scope?: string }) {
  const sp = new URLSearchParams();
  if (opts?.weeks != null) sp.set('weeks', String(opts.weeks));
  if (opts?.department != null) sp.set('department', String(opts.department));
  if (opts?.include_children != null) sp.set('include_children', String(opts.include_children));
  if (opts?.vertical != null) sp.set('vertical', String(opts.vertical));
  if (opts?.visibility_scope) sp.set('visibility_scope', opts.visibility_scope);
  const qs = sp.toString() ? `?${sp.toString()}` : '';
  const endpoint = `/assignments/analytics_status_timeline/${qs}`;
  return withCachedGet(endpoint, async () => {
    const res = await apiClient.GET(endpoint as any, { headers: authHeaders() });
    if (!res.data) throw new Error(`HTTP ${res.response?.status ?? 500}`);
    return res.data as unknown as {
      weekKeys: string[];
      series: Array<{ key: string; label: string; colorHex: string; values: number[] }>;
      totalByWeek: number[];
    };
  });
}

export async function getAssignedHoursDeliverableTimeline(opts?: { weeks?: number; department?: number; include_children?: 0|1; debug?: 0|1; vertical?: number; visibility_scope?: string }) {
  const sp = new URLSearchParams();
  if (opts?.weeks != null) sp.set('weeks', String(opts.weeks));
  if (opts?.department != null) sp.set('department', String(opts.department));
  if (opts?.include_children != null) sp.set('include_children', String(opts.include_children));
  if (opts?.debug != null) sp.set('debug', String(opts.debug));
  if (opts?.vertical != null) sp.set('vertical', String(opts.vertical));
  if (opts?.visibility_scope) sp.set('visibility_scope', opts.visibility_scope);
  const qs = sp.toString() ? `?${sp.toString()}` : '';
  const endpoint = `/assignments/analytics_deliverable_timeline/${qs}`;
  return withCachedGet(endpoint, async () => {
    const res = await apiClient.GET(endpoint as any, { headers: authHeaders() });
    if (!res.data) throw new Error(`HTTP ${res.response?.status ?? 500}`);
    return res.data as unknown as {
      weekKeys: string[];
      series: { sd: number[]; dd: number[]; ifp: number[]; ifc: number[]; masterplan: number[]; bulletins: number[]; ca: number[]; other: number[] };
      extras?: Array<{ label: string; values: number[] }>;
      unspecifiedDebug?: Array<any>;
      extrasDebug?: Array<{ label: string; projectId: number; projectName: string; hours: number }>;
      categoriesDebug?: Array<{ category: 'sd'|'dd'|'ifp'|'ifc'|'masterplan'|'bulletins'|'ca'; projectId: number; projectName: string; hours: number }>;
      totalByWeek: number[];
    };
  });
}

// Role capacity vs assigned timeline per department
export async function getRoleCapacityTimeline(opts: { department?: number | null; weeks?: number; roleIdsCsv?: string; vertical?: number; filterOutLt5h?: boolean; visibility_scope?: string }) {
  const sp = new URLSearchParams();
  if (opts.department != null) sp.set('department', String(opts.department));
  if (opts.weeks != null) sp.set('weeks', String(opts.weeks));
  if (opts.roleIdsCsv) sp.set('role_ids', opts.roleIdsCsv);
  if (opts.vertical != null) sp.set('vertical', String(opts.vertical));
  if (opts.filterOutLt5h) sp.set('filter_out_lt5h', '1');
  if (opts.visibility_scope) sp.set('visibility_scope', opts.visibility_scope);
  const qs = `?${sp.toString()}`;
  const endpoint = `/assignments/analytics_role_capacity/${qs}`;
  return withCachedGet(endpoint, async () => {
    const res = await apiClient.GET(endpoint as any, { headers: authHeaders() });
    if (!res.data) throw new Error(`HTTP ${res.response?.status ?? 500}`);
    return res.data as unknown as {
      weekKeys: string[];
      roles: Array<{ id: number; name: string }>;
      series: Array<{ roleId: number; roleName: string; assigned: number[]; projected?: number[]; demand?: number[]; capacity: number[]; people?: number[] }>;
      summary?: {
        mappedProjectedHours?: number;
        unmappedProjectRoleHours?: number;
        mappedTemplateRolePairsUsed?: number;
      };
    };
  });
}
