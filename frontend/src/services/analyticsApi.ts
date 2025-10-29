import { apiClient, authHeaders } from '@/api/client';

export async function getAssignedHoursByClient(opts?: { weeks?: number; department?: number; include_children?: 0|1 }) {
  const sp = new URLSearchParams();
  if (opts?.weeks != null) sp.set('weeks', String(opts.weeks));
  if (opts?.department != null) sp.set('department', String(opts.department));
  if (opts?.include_children != null) sp.set('include_children', String(opts.include_children));
  const qs = sp.toString() ? `?${sp.toString()}` : '';
  const res = await apiClient.GET(`/assignments/analytics_by_client/${qs}` as any, { headers: authHeaders() });
  if (!res.data) throw new Error(`HTTP ${res.response?.status ?? 500}`);
  return res.data as unknown as { clients: Array<{ label: string; hours: number }> };
}

export async function getAssignedHoursClientProjects(client: string, opts?: { weeks?: number; department?: number; include_children?: 0|1 }) {
  const sp = new URLSearchParams();
  sp.set('client', client);
  if (opts?.weeks != null) sp.set('weeks', String(opts.weeks));
  if (opts?.department != null) sp.set('department', String(opts.department));
  if (opts?.include_children != null) sp.set('include_children', String(opts.include_children));
  const qs = `?${sp.toString()}`;
  const res = await apiClient.GET(`/assignments/analytics_client_projects/${qs}` as any, { headers: authHeaders() });
  if (!res.data) throw new Error(`HTTP ${res.response?.status ?? 500}`);
  return res.data as unknown as { projects: Array<{ id: number; name: string; hours: number }> };
}

export async function getAssignedHoursStatusTimeline(opts?: { weeks?: number; department?: number; include_children?: 0|1 }) {
  const sp = new URLSearchParams();
  if (opts?.weeks != null) sp.set('weeks', String(opts.weeks));
  if (opts?.department != null) sp.set('department', String(opts.department));
  if (opts?.include_children != null) sp.set('include_children', String(opts.include_children));
  const qs = sp.toString() ? `?${sp.toString()}` : '';
  const res = await apiClient.GET(`/assignments/analytics_status_timeline/${qs}` as any, { headers: authHeaders() });
  if (!res.data) throw new Error(`HTTP ${res.response?.status ?? 500}`);
  return res.data as unknown as {
    weekKeys: string[];
    series: { active: number[]; active_ca: number[]; other: number[] };
    totalByWeek: number[];
  };
}

export async function getAssignedHoursDeliverableTimeline(opts?: { weeks?: number; department?: number; include_children?: 0|1; include_active_ca?: 0|1; debug?: 0|1 }) {
  const sp = new URLSearchParams();
  if (opts?.weeks != null) sp.set('weeks', String(opts.weeks));
  if (opts?.department != null) sp.set('department', String(opts.department));
  if (opts?.include_children != null) sp.set('include_children', String(opts.include_children));
  if (opts?.include_active_ca != null) sp.set('include_active_ca', String(opts.include_active_ca));
  if (opts?.debug != null) sp.set('debug', String(opts.debug));
  const qs = sp.toString() ? `?${sp.toString()}` : '';
  const res = await apiClient.GET(`/assignments/analytics_deliverable_timeline/${qs}` as any, { headers: authHeaders() });
  if (!res.data) throw new Error(`HTTP ${res.response?.status ?? 500}`);
  return res.data as unknown as {
    weekKeys: string[];
    series: { sd: number[]; dd: number[]; ifp: number[]; masterplan: number[]; bulletins: number[]; ca: number[] };
    extras?: Array<{ label: string; values: number[] }>;
    unspecifiedDebug?: Array<any>;
    extrasDebug?: Array<{ label: string; projectId: number; projectName: string; hours: number }>;
    categoriesDebug?: Array<{ category: 'sd'|'dd'|'ifp'|'masterplan'|'bulletins'|'ca'; projectId: number; projectName: string; hours: number }>;
    totalByWeek: number[];
  };
}
