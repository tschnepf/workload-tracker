import { apiClient, authHeaders } from '@/api/client';

type GridSnapshotOpts = {
  weeks?: number;
  department?: number;
  include_children?: 0 | 1;
  include_placeholders?: 0 | 1;
  status_in?: string; // CSV of statuses
  has_future_deliverables?: 0 | 1;
  project_ids?: number[]; // optional scope
  vertical?: number;
};

export async function getProjectGridSnapshot(opts?: GridSnapshotOpts) {
  const sp = new URLSearchParams();
  if (opts?.weeks != null) sp.set('weeks', String(opts.weeks));
  if (opts?.department != null) sp.set('department', String(opts.department));
  if (opts?.include_children != null) sp.set('include_children', String(opts.include_children));
  if (opts?.include_placeholders != null) sp.set('include_placeholders', String(opts.include_placeholders));
  if (opts?.status_in) sp.set('status_in', opts.status_in);
  if (opts?.has_future_deliverables != null) sp.set('has_future_deliverables', String(opts.has_future_deliverables));
  if (opts?.project_ids && opts.project_ids.length) sp.set('project_ids', opts.project_ids.join(','));
  if (opts?.vertical != null) sp.set('vertical', String(opts.vertical));
  const qs = sp.toString() ? `?${sp.toString()}` : '';
  const res = await apiClient.GET(`/assignments/project_grid_snapshot/${qs}` as any, { headers: authHeaders() });
  if (!res.data) throw new Error(`HTTP ${res.response?.status ?? 500}`);
  return res.data as unknown as {
    weekKeys: string[];
    projects: Array<{ id: number; name: string; client?: string | null; status?: string | null }>;
    hoursByProject: Record<string, Record<string, number>>;
    deliverablesByProjectWeek: Record<string, Record<string, number>>;
    deliverableMarkersByProjectWeek?: Record<string, Record<string, Array<{
      type: string;
      percentage?: number | null;
      dates?: string[];
      description?: string | null;
      note?: string | null;
    }>>>;
    hasFutureDeliverablesByProject: Record<string, boolean>;
    metrics: { projectsCount: number; peopleAssignedCount: number; totalHours: number };
  };
}

export async function getProjectTotals(projectIds: number[], opts?: { weeks?: number; department?: number; include_children?: 0 | 1; include_placeholders?: 0 | 1; vertical?: number }) {
  const sp = new URLSearchParams();
  sp.set('project_ids', projectIds.join(','));
  if (opts?.weeks != null) sp.set('weeks', String(opts.weeks));
  if (opts?.department != null) sp.set('department', String(opts.department));
  if (opts?.include_children != null) sp.set('include_children', String(opts.include_children));
  if (opts?.include_placeholders != null) sp.set('include_placeholders', String(opts.include_placeholders));
  if (opts?.vertical != null) sp.set('vertical', String(opts.vertical));
  const qs = `?${sp.toString()}`;
  const res = await apiClient.GET(`/assignments/project_totals/${qs}` as any, { headers: authHeaders() });
  if (!res.data) throw new Error(`HTTP ${res.response?.status ?? 500}`);
  return res.data as unknown as { hoursByProject: Record<string, Record<string, number>> };
}
