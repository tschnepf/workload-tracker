import { apiClient, authHeaders } from '@/api/client';
import type { Project, Department, Deliverable } from '@/types/models';
import type { ProjectRole } from '@/roles/api';
import type { Capabilities } from '@/hooks/useCapabilities';
import type { UtilizationScheme } from '@/services/api';

export type AssignmentGridSnapshot = {
  weekKeys: string[];
  people: Array<{ id: number; name: string; weeklyCapacity: number; department: number | null }>;
  hoursByPerson: Record<string, Record<string, number>>;
};

export type ProjectGridSnapshot = {
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
  hasPlaceholdersByProject?: Record<string, number>;
  metrics: { projectsCount: number; peopleAssignedCount: number; totalHours: number };
};

export type AssignmentsPageSnapshot = {
  assignmentGridSnapshot?: AssignmentGridSnapshot | null;
  projectGridSnapshot?: ProjectGridSnapshot | null;
  projects?: Array<Pick<Project, 'id' | 'name' | 'client' | 'projectNumber' | 'status' | 'isActive'>>;
  deliverables?: Array<Pick<Deliverable, 'id' | 'project' | 'date' | 'description' | 'percentage'>>;
  departments?: Department[];
  projectRolesByDepartment?: Record<string, ProjectRole[]>;
  capabilities?: Capabilities;
  utilizationScheme?: UtilizationScheme;
};

export type AssignmentsPageSnapshotParams = {
  weeks?: number;
  department?: number;
  include_children?: 0 | 1;
  department_filters?: Array<{ departmentId: number; op: 'or' | 'and' | 'not' }>;
  vertical?: number;
  include_placeholders?: 0 | 1;
  status_in?: string;
  has_future_deliverables?: 0 | 1;
  project_ids?: number[];
  include?: string; // CSV: assignment,project
};

export async function getAssignmentsPageSnapshot(params?: AssignmentsPageSnapshotParams) {
  const sp = new URLSearchParams();
  if (params?.weeks != null) sp.set('weeks', String(params.weeks));
  if (params?.department != null) sp.set('department', String(params.department));
  if (params?.include_children != null) sp.set('include_children', String(params.include_children));
  if (params?.department_filters && params.department_filters.length) {
    sp.set('department_filters', JSON.stringify(params.department_filters));
  }
  if (params?.vertical != null) sp.set('vertical', String(params.vertical));
  if (params?.include_placeholders != null) sp.set('include_placeholders', String(params.include_placeholders));
  if (params?.status_in) sp.set('status_in', params.status_in);
  if (params?.has_future_deliverables != null) sp.set('has_future_deliverables', String(params.has_future_deliverables));
  if (params?.project_ids && params.project_ids.length > 0) sp.set('project_ids', params.project_ids.join(','));
  if (params?.include) sp.set('include', params.include);
  const qs = sp.toString() ? `?${sp.toString()}` : '';
  const res = await apiClient.GET(`/ui/assignments-page/${qs}` as any, { headers: authHeaders() });
  if (!res.data) throw new Error(`HTTP ${res.response?.status ?? 500}`);
  return res.data as AssignmentsPageSnapshot;
}
