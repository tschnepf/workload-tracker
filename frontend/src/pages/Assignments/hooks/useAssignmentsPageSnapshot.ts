import { useEffect, useMemo } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAssignmentsPageSnapshot, type AssignmentsPageSnapshot } from '@/services/assignmentsPageSnapshotApi';
import { primeProjectRolesCache } from '@/roles/api';
import { subscribeDeliverablesRefresh } from '@/lib/deliverablesRefreshBus';
import { subscribeProjectsRefresh } from '@/lib/projectsRefreshBus';
import { subscribeDepartmentsRefresh } from '@/lib/departmentsRefreshBus';

type Params = {
  weeks: number;
  department?: number;
  includeChildren?: boolean;
  statusIn?: string;
  hasFutureDeliverables?: 0 | 1;
  projectIds?: number[];
  include?: string; // CSV: assignment,project
};

export function useAssignmentsPageSnapshot(params: Params) {
  const qc = useQueryClient();
  const dept = params.department ?? null;
  const inc = params.includeChildren ? 1 : 0;
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
      params.statusIn ?? null,
      params.hasFutureDeliverables ?? null,
      projectIdsKey,
      params.include ?? null,
    ],
    [params.weeks, dept, inc, params.statusIn, params.hasFutureDeliverables, projectIdsKey, params.include]
  );

  const query = useQuery<AssignmentsPageSnapshot, Error>({
    queryKey,
    queryFn: () =>
      getAssignmentsPageSnapshot({
        weeks: params.weeks,
        department: params.department,
        include_children: params.includeChildren ? 1 : 0,
        status_in: params.statusIn,
        has_future_deliverables: params.hasFutureDeliverables,
        project_ids: params.projectIds,
        include: params.include,
      }),
    enabled: params.weeks > 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!query.data) return;
    const data = query.data;
    if (data.departments) {
      qc.setQueryData(['departmentsAll'], data.departments);
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
  }, [query.data, qc]);

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
