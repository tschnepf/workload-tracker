import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { deptProjectRolesApi, DeptProjectRole } from '@/services/api';
import { showToast } from '@/lib/toastBus';

function stableIds(input: number[] | readonly number[] | undefined): number[] {
  const ids = Array.from(new Set((input || []).map(n => Number(n)).filter(n => Number.isFinite(n) && n > 0))) as number[];
  ids.sort((a, b) => a - b);
  return ids;
}

export function useDeptProjectRolesMap(departmentIds: number[]) {
  const ids = stableIds(departmentIds);
  return useQuery<Record<string, DeptProjectRole[]>, Error>({
    queryKey: ['deptProjectRoles', 'map', ids],
    queryFn: () => deptProjectRolesApi.map(ids),
    enabled: ids.length > 0,
    staleTime: 60_000,
    retry: 1,
    retryDelay: () => Math.min(1000 * (1 + Math.random()), 2000),
  });
}

export function useDeptProjectRoles(departmentId: number | null | undefined) {
  const enabled = !!departmentId && Number(departmentId) > 0;
  const id = enabled ? Number(departmentId) : undefined;
  return useQuery<DeptProjectRole[], Error>({
    queryKey: ['deptProjectRoles', 'list', id],
    queryFn: () => deptProjectRolesApi.list(id as number),
    enabled,
    staleTime: 60_000,
    retry: 1,
    retryDelay: () => Math.min(1000 * (1 + Math.random()), 2000),
  });
}

export function useDeptProjectRolesMutations() {
  const qc = useQueryClient();

  const addMutation = useMutation({
    mutationKey: ['deptProjectRoles:add'],
    mutationFn: async (payload: { departmentId: number; name: string }) => {
      return await deptProjectRolesApi.add(payload.departmentId, payload.name);
    },
    onSuccess: () => {
      // Invalidate all map/list queries
      qc.invalidateQueries({ queryKey: ['deptProjectRoles'] }).catch(() => {});
    },
    onError: (err: any) => {
      showToast(err?.message || 'Failed to add role mapping', 'error');
    },
  });

  const removeMutation = useMutation({
    mutationKey: ['deptProjectRoles:remove'],
    mutationFn: async (payload: { departmentId: number; roleId: number }) => {
      return await deptProjectRolesApi.remove(payload.departmentId, payload.roleId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deptProjectRoles'] }).catch(() => {});
    },
    onError: (err: any) => {
      showToast(err?.message || 'Failed to remove role mapping', 'error');
    },
  });

  return {
    addAsync: addMutation.mutateAsync,
    removeAsync: removeMutation.mutateAsync,
    isAdding: addMutation.isPending,
    isRemoving: removeMutation.isPending,
  };
}

