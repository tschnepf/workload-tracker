import React from 'react';
import { apiClient, authHeaders } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { subscribeAssignmentsRefresh } from '@/lib/assignmentsRefreshBus';
import { subscribeProjectsRefresh } from '@/lib/projectsRefreshBus';

export type PersonalLeadProject = {
  id: number;
  name: string | null;
  client?: string | null;
  status?: string | null;
  leadRoleNames: string[];
  scopedDepartmentIds: number[];
};

export type PersonalLeadProjectAssignment = {
  id: number;
  project: number;
  person: number | null;
  personName: string | null;
  personDepartmentId: number | null;
  roleOnProjectId: number | null;
  roleName: string | null;
  weeklyHours: Record<string, number>;
};

export type PersonalLeadProjectGridPayload = {
  weekKeys: string[];
  projects: PersonalLeadProject[];
  assignmentsByProject: Record<string, PersonalLeadProjectAssignment[]>;
};

type HookState = {
  data: PersonalLeadProjectGridPayload | null;
  isLoading: boolean;
  isFetching: boolean;
  error: string | null;
};

function normalizePayload(payload: any): PersonalLeadProjectGridPayload {
  const projectsRaw = Array.isArray(payload?.projects) ? payload.projects : [];
  const assignmentsRaw = (payload?.assignmentsByProject && typeof payload.assignmentsByProject === 'object')
    ? payload.assignmentsByProject
    : {};
  const weekKeys = Array.isArray(payload?.weekKeys) ? payload.weekKeys.map((wk: any) => String(wk)) : [];

  const projects: PersonalLeadProject[] = projectsRaw.map((project: any) => ({
    id: Number(project?.id),
    name: project?.name ?? null,
    client: project?.client ?? null,
    status: project?.status ?? null,
    leadRoleNames: Array.isArray(project?.leadRoleNames) ? project.leadRoleNames.map((v: any) => String(v)) : [],
    scopedDepartmentIds: Array.isArray(project?.scopedDepartmentIds)
      ? project.scopedDepartmentIds.map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v))
      : [],
  })).filter((project: PersonalLeadProject) => Number.isFinite(project.id) && project.id > 0);

  projects.sort((a, b) => {
    const aClient = (a.client || '').toLowerCase();
    const bClient = (b.client || '').toLowerCase();
    if (aClient && !bClient) return -1;
    if (!aClient && bClient) return 1;
    if (aClient !== bClient) return aClient.localeCompare(bClient);
    return (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase());
  });

  const assignmentsByProject: Record<string, PersonalLeadProjectAssignment[]> = {};
  projects.forEach((project) => {
    const key = String(project.id);
    const rows = Array.isArray(assignmentsRaw[key]) ? assignmentsRaw[key] : [];
    const normalizedRows: PersonalLeadProjectAssignment[] = rows.map((row: any) => {
      const weeklyHours: Record<string, number> = {};
      const rawWeeklyHours = row?.weeklyHours && typeof row.weeklyHours === 'object' ? row.weeklyHours : {};
      Object.entries(rawWeeklyHours).forEach(([wk, val]) => {
        const n = Number(val);
        if (!Number.isFinite(n)) return;
        weeklyHours[String(wk)] = n;
      });
      return {
        id: Number(row?.id),
        project: Number(row?.project),
        person: row?.person != null ? Number(row.person) : null,
        personName: row?.personName ?? null,
        personDepartmentId: row?.personDepartmentId != null ? Number(row.personDepartmentId) : null,
        roleOnProjectId: row?.roleOnProjectId != null ? Number(row.roleOnProjectId) : null,
        roleName: row?.roleName ?? null,
        weeklyHours,
      };
    }).filter((row: PersonalLeadProjectAssignment) => Number.isFinite(row.id) && row.id > 0);

    normalizedRows.sort((a, b) => {
      if (a.person == null && b.person != null) return 1;
      if (a.person != null && b.person == null) return -1;
      const nameCmp = (a.personName || '').toLowerCase().localeCompare((b.personName || '').toLowerCase());
      if (nameCmp !== 0) return nameCmp;
      return (a.roleName || '').toLowerCase().localeCompare((b.roleName || '').toLowerCase());
    });

    assignmentsByProject[key] = normalizedRows;
  });

  return {
    weekKeys,
    projects,
    assignmentsByProject,
  };
}

async function fetchPersonalLeadProjectGrid(weeks: number): Promise<PersonalLeadProjectGridPayload> {
  const query = `?weeks=${encodeURIComponent(String(weeks))}`;
  const res = await apiClient.GET(`/personal/lead_project_grid/${query}` as any, { headers: authHeaders() });
  const payload = (res as any)?.data ?? res;
  if (!payload) {
    throw new Error('Failed to fetch lead project grid');
  }
  return normalizePayload(payload);
}

export function usePersonalLeadProjectGrid(weeks: number) {
  const auth = useAuth();
  const personId = auth?.person?.id ?? null;
  const [{ data, isLoading, isFetching, error }, setState] = React.useState<HookState>({
    data: null,
    isLoading: false,
    isFetching: false,
    error: null,
  });
  const inflightRef = React.useRef<Promise<PersonalLeadProjectGridPayload> | null>(null);
  const requestIdRef = React.useRef(0);
  const refreshTimerRef = React.useRef<number | null>(null);

  const load = React.useCallback(async (opts?: { force?: boolean }) => {
    if (!personId) return;
    const requestId = ++requestIdRef.current;
    setState((prev) => ({
      ...prev,
      isLoading: !prev.data,
      isFetching: Boolean(prev.data),
      error: null,
    }));
    let request = inflightRef.current;
    if (!request || opts?.force) {
      request = fetchPersonalLeadProjectGrid(weeks);
      inflightRef.current = request;
    }
    try {
      const payload = await request;
      if (requestId !== requestIdRef.current) return;
      setState({ data: payload, isLoading: false, isFetching: false, error: null });
    } catch (err: any) {
      if (requestId !== requestIdRef.current) return;
      setState((prev) => ({
        ...prev,
        isLoading: false,
        isFetching: false,
        error: err?.message || 'Failed to refresh lead project grid',
      }));
    } finally {
      if (inflightRef.current === request) inflightRef.current = null;
    }
  }, [personId, weeks]);

  const refresh = React.useCallback(
    async (opts?: { force?: boolean }) => {
      await load({ force: opts?.force ?? true });
    },
    [load]
  );

  React.useEffect(() => {
    if (!personId) {
      setState({ data: null, isLoading: false, isFetching: false, error: null });
      return;
    }
    load();
  }, [personId, load]);

  React.useEffect(() => {
    if (!personId) return;
    const scheduleRefresh = () => {
      if (refreshTimerRef.current) return;
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        refresh({ force: true });
      }, 200);
    };
    const unsubscribeAssignments = subscribeAssignmentsRefresh(() => {
      scheduleRefresh();
    });
    const unsubscribeProjects = subscribeProjectsRefresh(() => {
      scheduleRefresh();
    });
    return () => {
      unsubscribeAssignments();
      unsubscribeProjects();
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [personId, refresh]);

  return {
    data,
    loading: isLoading,
    isLoading,
    isFetching,
    error,
    refresh,
    hasPerson: Boolean(personId),
  };
}
