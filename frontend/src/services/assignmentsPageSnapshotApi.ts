import { apiClient, authHeaders } from '@/api/client';
import type { Project, Department, Deliverable, DeliverablePhaseMappingSettings, AutoHoursTemplate } from '@/types/models';
import type { ProjectRole } from '@/roles/api';
import type { Capabilities } from '@/hooks/useCapabilities';
import type { UtilizationScheme, AutoHoursRoleSetting } from '@/services/api';

export type AssignmentGridSnapshot = {
  weekKeys: string[];
  people: Array<{ id: number; name: string; weeklyCapacity: number; department: number | null; firstEligibleWeek?: string | null }>;
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

export type AutoHoursWeekLimits = {
  maxWeeksCount: number;
  defaultWeeksCount: number;
  weeksCount?: number;
};

export type AutoHoursBundle = {
  contractVersion?: number | string;
  bundleVersion?: string;
  etag?: string;
  phaseMapping: DeliverablePhaseMappingSettings;
  templates: AutoHoursTemplate[];
  defaultSettingsByPhase: Record<string, AutoHoursRoleSetting[]>;
  templateSettingsByPhase?: Record<string, Record<string, AutoHoursRoleSetting[]>>;
  weekLimitsByPhase: Record<string, AutoHoursWeekLimits>;
  bundleComplete: boolean;
  missingTemplateIds: number[];
};

export type AssignmentsPageSnapshot = {
  contractVersion?: number | string;
  bundleVersion?: string;
  included?: string[];
  assignmentGridSnapshot?: AssignmentGridSnapshot | null;
  projectGridSnapshot?: ProjectGridSnapshot | null;
  projects?: Array<Pick<Project, 'id' | 'name' | 'client' | 'projectNumber' | 'status' | 'isActive' | 'autoHoursTemplateId'>>;
  deliverables?: Array<Pick<Deliverable, 'id' | 'project' | 'date' | 'description' | 'percentage'>>;
  departments?: Department[];
  projectRolesByDepartment?: Record<string, ProjectRole[]>;
  capabilities?: Capabilities;
  utilizationScheme?: UtilizationScheme;
  autoHoursBundle?: AutoHoursBundle;
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
  include?: string; // CSV: assignment,project,auto_hours
  auto_hours_phases?: string[];
  template_ids?: number[];
  post_body?: boolean;
};

export class AssignmentsPageSnapshotApiError extends Error {
  public status: number;
  public payload?: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = 'AssignmentsPageSnapshotApiError';
    this.status = status;
    this.payload = payload;
  }
}

let autoHoursBundleDisabledForSession = false;

export function disableAssignmentsAutoHoursBundleForSession() {
  autoHoursBundleDisabledForSession = true;
}

export function isAssignmentsAutoHoursBundleDisabledForSession() {
  return autoHoursBundleDisabledForSession;
}

export function resetAssignmentsAutoHoursBundleSession() {
  autoHoursBundleDisabledForSession = false;
}

function normalizedPhases(phases?: string[]) {
  if (!phases || phases.length === 0) return [];
  const out: string[] = [];
  phases.forEach((phase) => {
    const value = String(phase || '').trim().toLowerCase();
    if (!value) return;
    if (!out.includes(value)) out.push(value);
  });
  return out;
}

function normalizedTemplateIds(ids?: number[]) {
  if (!ids || ids.length === 0) return [];
  const out: number[] = [];
  ids.forEach((value) => {
    const id = Number(value);
    if (!Number.isFinite(id)) return;
    const intId = Math.trunc(id);
    if (intId <= 0) return;
    if (!out.includes(intId)) out.push(intId);
  });
  return out;
}

function throwSnapshotError(res: any): never {
  const status = res?.response?.status ?? 500;
  const payload = (res?.error ?? res?.data) as any;
  const message = payload?.error || payload?.detail || `HTTP ${status}`;
  throw new AssignmentsPageSnapshotApiError(String(message), status, payload);
}

export async function getAssignmentsPageSnapshot(params?: AssignmentsPageSnapshotParams): Promise<AssignmentsPageSnapshot> {
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
  const autoHoursPhases = normalizedPhases(params?.auto_hours_phases);
  const templateIds = normalizedTemplateIds(params?.template_ids);
  const usePostBody = Boolean(params?.post_body) && (autoHoursPhases.length > 0 || templateIds.length > 0);
  if (!usePostBody) {
    if (autoHoursPhases.length > 0) sp.set('auto_hours_phases', autoHoursPhases.join(','));
    if (templateIds.length > 0) sp.set('template_ids', templateIds.join(','));
  }
  const qs = sp.toString() ? `?${sp.toString()}` : '';
  const res = usePostBody
    ? await apiClient.POST(`/ui/assignments-page/${qs}` as any, {
      headers: authHeaders(),
      body: {
        ...(autoHoursPhases.length > 0 ? { auto_hours_phases: autoHoursPhases } : {}),
        ...(templateIds.length > 0 ? { template_ids: templateIds } : {}),
      } as any,
    })
    : await apiClient.GET(`/ui/assignments-page/${qs}` as any, { headers: authHeaders() });
  if (!res.data) throwSnapshotError(res);
  return res.data as AssignmentsPageSnapshot;
}
