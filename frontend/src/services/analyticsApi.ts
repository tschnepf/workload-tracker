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

