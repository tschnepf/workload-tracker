import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listProjectRoles, createProjectRole, updateProjectRole, deleteProjectRole, ProjectRole, clearProjectRolesCache } from '../api';

export function useProjectRoles(departmentId: number | null | undefined, opts?: { includeInactive?: boolean }) {
  const enabled = !!departmentId && Number(departmentId) > 0;
  const id = enabled ? Number(departmentId) : undefined;
  const includeInactive = !!opts?.includeInactive;
  return useQuery<ProjectRole[], Error>({
    queryKey: ['projectRoles', id, includeInactive ? 1 : 0],
    queryFn: () => listProjectRoles(id as number, includeInactive),
    enabled,
    staleTime: 60_000,
    retry: 1,
    retryDelay: () => Math.min(1000 * (1 + Math.random()), 2000),
  });
}

export function useProjectRoleMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    clearProjectRolesCache();
    return qc.invalidateQueries({ queryKey: ['projectRoles'] }).catch(() => {});
  };

  const create = useMutation({
    mutationKey: ['projectRoles:create'],
    mutationFn: async (payload: { departmentId: number; name: string; sortOrder?: number }) => {
      return await createProjectRole(payload.departmentId, payload.name, payload.sortOrder ?? 0);
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationKey: ['projectRoles:update'],
    mutationFn: async (payload: { id: number; name?: string; isActive?: boolean; sortOrder?: number }) => {
      return await updateProjectRole(payload.id, { name: payload.name, isActive: payload.isActive, sortOrder: payload.sortOrder });
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationKey: ['projectRoles:delete'],
    mutationFn: async (payload: { id: number }) => {
      return await deleteProjectRole(payload.id);
    },
    onSuccess: invalidate,
  });

  return { create, update, remove };
}
