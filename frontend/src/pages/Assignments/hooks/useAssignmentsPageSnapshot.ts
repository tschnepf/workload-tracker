import { useEffect, useMemo } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AssignmentsPageSnapshotApiError,
  disableAssignmentsAutoHoursBundleForSession,
  getAssignmentsPageSnapshot,
  isAssignmentsAutoHoursBundleDisabledForSession,
  type AssignmentsPageSnapshot,
} from '@/services/assignmentsPageSnapshotApi';
import { primeProjectRolesCache } from '@/roles/api';
import { subscribeDeliverablesRefresh } from '@/lib/deliverablesRefreshBus';
import { subscribeProjectsRefresh } from '@/lib/projectsRefreshBus';
import { subscribeDepartmentsRefresh } from '@/lib/departmentsRefreshBus';
import { getFlag } from '@/lib/flags';

type Params = {
  weeks: number;
  department?: number;
  includeChildren?: boolean;
  departmentFilters?: Array<{ departmentId: number; op: 'or' | 'and' | 'not' }>;
  vertical?: number;
  includePlaceholders?: boolean;
  statusIn?: string;
  hasFutureDeliverables?: 0 | 1;
  projectIds?: number[];
  include?: string; // CSV: assignment,project,auto_hours
  requestAutoHoursBundle?: boolean;
  autoHoursPhases?: string[];
  autoHoursTemplateIds?: number[];
};

function normalizeIncludeTokens(raw?: string): string[] {
  if (!raw || !raw.trim()) return ['assignment', 'project'];
  const tokens: string[] = [];
  raw.split(',').forEach((part) => {
    const token = part.trim().toLowerCase();
    if (!token) return;
    if (!tokens.includes(token)) tokens.push(token);
  });
  return tokens.length ? tokens : ['assignment', 'project'];
}

function normalizePhaseTokens(raw?: string[]): string[] {
  if (!raw || raw.length === 0) return [];
  const out: string[] = [];
  raw.forEach((value) => {
    const token = String(value || '').trim().toLowerCase();
    if (!token) return;
    if (!out.includes(token)) out.push(token);
  });
  return out;
}

function normalizeTemplateIds(raw?: number[]): number[] {
  if (!raw || raw.length === 0) return [];
  const out: number[] = [];
  raw.forEach((value) => {
    const id = Number(value);
    if (!Number.isFinite(id)) return;
    const intId = Math.trunc(id);
    if (intId <= 0) return;
    if (!out.includes(intId)) out.push(intId);
  });
  return out.sort((a, b) => a - b);
}

export function useAssignmentsPageSnapshot(params: Params) {
  const qc = useQueryClient();
  const dept = params.department ?? null;
  const inc = params.includeChildren ? 1 : 0;
  const autoHoursFlagEnabled = getFlag('FF_ASSIGNMENTS_AUTO_HOURS_BUNDLE', true);
  const autoHoursBundleSessionDisabled = isAssignmentsAutoHoursBundleDisabledForSession();
  const baseIncludeTokens = useMemo(
    () => normalizeIncludeTokens(params.include),
    [params.include]
  );
  const shouldRequestAutoHoursBundle = Boolean(
    params.requestAutoHoursBundle
    && autoHoursFlagEnabled
    && !autoHoursBundleSessionDisabled
  );
  const includeTokens = useMemo(() => {
    const next = [...baseIncludeTokens];
    if (shouldRequestAutoHoursBundle) {
      if (!next.includes('auto_hours')) next.push('auto_hours');
    } else {
      const idx = next.indexOf('auto_hours');
      if (idx >= 0) next.splice(idx, 1);
    }
    return next;
  }, [baseIncludeTokens, shouldRequestAutoHoursBundle]);
  const includeCsv = useMemo(() => includeTokens.join(','), [includeTokens]);
  const includeHasAutoHours = includeTokens.includes('auto_hours');
  const autoHoursPhases = useMemo(
    () => (includeHasAutoHours ? normalizePhaseTokens(params.autoHoursPhases) : []),
    [includeHasAutoHours, params.autoHoursPhases]
  );
  const autoHoursTemplateIds = useMemo(
    () => (includeHasAutoHours ? normalizeTemplateIds(params.autoHoursTemplateIds) : []),
    [includeHasAutoHours, params.autoHoursTemplateIds]
  );
  const autoHoursPhasesKey = autoHoursPhases.length > 0 ? autoHoursPhases.join(',') : null;
  const autoHoursTemplateIdsKey = autoHoursTemplateIds.length > 0 ? autoHoursTemplateIds.join(',') : null;
  const postBodyForAutoHours = includeHasAutoHours && autoHoursTemplateIds.length > 80;
  const deptFiltersKey = useMemo(
    () =>
      params.departmentFilters && params.departmentFilters.length > 0
        ? JSON.stringify(params.departmentFilters.slice().sort((a, b) => (a.departmentId - b.departmentId) || a.op.localeCompare(b.op)))
        : null,
    [params.departmentFilters]
  );
  const verticalKey = params.vertical ?? null;
  const projectIdsKey = useMemo(
    () => (params.projectIds && params.projectIds.length > 0 ? params.projectIds.slice().sort((a, b) => a - b).join(',') : null),
    [params.projectIds]
  );
  const queryKey = useMemo(
    () => [
      'assignmentsPageSnapshot',
      params.weeks,
      dept,
      inc,
      deptFiltersKey,
      verticalKey,
      params.includePlaceholders ? 1 : 0,
      params.statusIn ?? null,
      params.hasFutureDeliverables ?? null,
      projectIdsKey,
      includeCsv || null,
      autoHoursPhasesKey,
      autoHoursTemplateIdsKey,
    ],
    [
      params.weeks,
      dept,
      inc,
      deptFiltersKey,
      verticalKey,
      params.includePlaceholders,
      params.statusIn,
      params.hasFutureDeliverables,
      projectIdsKey,
      includeCsv,
      autoHoursPhasesKey,
      autoHoursTemplateIdsKey,
    ]
  );
  const departmentsSeedKey = useMemo(
    () => ['departmentsAll', params.vertical ?? 'all', 0] as const,
    [params.vertical]
  );

  const query = useQuery<AssignmentsPageSnapshot, Error>({
    queryKey,
    queryFn: async () => {
      const basePayload = {
        weeks: params.weeks,
        department: params.department,
        include_children: params.includeChildren ? 1 : 0,
        department_filters: params.departmentFilters,
        vertical: params.vertical,
        include_placeholders: params.includePlaceholders ? 1 : 0,
        status_in: params.statusIn,
        has_future_deliverables: params.hasFutureDeliverables,
        project_ids: params.projectIds,
      } as const;
      try {
        return await getAssignmentsPageSnapshot({
          ...basePayload,
          include: includeCsv,
          auto_hours_phases: includeHasAutoHours ? autoHoursPhases : undefined,
          template_ids: includeHasAutoHours ? autoHoursTemplateIds : undefined,
          post_body: postBodyForAutoHours,
        });
      } catch (error) {
        const status = error instanceof AssignmentsPageSnapshotApiError
          ? error.status
          : Number((error as any)?.status ?? (error as any)?.response?.status ?? 0);
        if (includeHasAutoHours && status === 403) {
          disableAssignmentsAutoHoursBundleForSession();
          const fallbackTokens = includeTokens.filter((token) => token !== 'auto_hours');
          const fallbackInclude = fallbackTokens.length > 0 ? fallbackTokens.join(',') : 'assignment,project';
          return getAssignmentsPageSnapshot({
            ...basePayload,
            include: fallbackInclude,
          });
        }
        throw error;
      }
    },
    enabled: params.weeks > 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!query.data) return;
    const data = query.data;
    if (data.departments) {
      qc.setQueryData(departmentsSeedKey, data.departments);
    }
    if (data.capabilities) {
      qc.setQueryData(['capabilities'], data.capabilities);
    }
    if (data.utilizationScheme) {
      qc.setQueryData(['utilizationScheme'], data.utilizationScheme);
    }
    if (data.projectRolesByDepartment) {
      primeProjectRolesCache(data.projectRolesByDepartment);
    }
  }, [query.data, qc, departmentsSeedKey]);

  useEffect(() => {
    const invalidate = () => {
      qc.invalidateQueries({ queryKey });
    };
    const unsubDeliverables = subscribeDeliverablesRefresh(invalidate);
    const unsubProjects = subscribeProjectsRefresh(invalidate);
    const unsubDepartments = subscribeDepartmentsRefresh(invalidate);
    return () => {
      unsubDeliverables();
      unsubProjects();
      unsubDepartments();
    };
  }, [qc, queryKey]);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}
