import { apiClient } from '@/api/client';

export type ProjectRole = {
  id: number;
  name: string;
  is_active: boolean;
  sort_order: number;
  department_id: number;
};

export type ProjectRoleUsage = {
  count: number;
  assignments: Array<{
    id: number;
    person: { id: number | null; name: string };
    project: { id: number | null; name: string };
  }>;
};

const rolesCache = new Map<string, ProjectRole[]>();
const rolesInFlight = new Map<string, Promise<ProjectRole[]>>();

function cacheKey(departmentId: number, includeInactive: boolean) {
  return `${departmentId}:${includeInactive ? '1' : '0'}`;
}

export function primeProjectRolesCache(payload: Record<string, ProjectRole[]> | null | undefined) {
  if (!payload) return;
  Object.entries(payload).forEach(([deptId, roles]) => {
    const id = Number(deptId);
    if (!Number.isFinite(id)) return;
    rolesCache.set(cacheKey(id, false), Array.isArray(roles) ? roles.slice() : []);
  });
}

export function clearProjectRolesCache(departmentId?: number) {
  if (departmentId == null) {
    rolesCache.clear();
    rolesInFlight.clear();
    return;
  }
  rolesCache.delete(cacheKey(departmentId, false));
  rolesCache.delete(cacheKey(departmentId, true));
  rolesInFlight.delete(cacheKey(departmentId, false));
  rolesInFlight.delete(cacheKey(departmentId, true));
}

export async function listProjectRoles(departmentId: number, includeInactive = false): Promise<ProjectRole[]> {
  const key = cacheKey(departmentId, includeInactive);
  const cached = rolesCache.get(key);
  if (cached) return cached.slice();
  const inflight = rolesInFlight.get(key);
  if (inflight) return inflight;
  const sp = new URLSearchParams();
  sp.set('department', String(departmentId));
  if (includeInactive) sp.set('include_inactive', 'true');
  const req = apiClient.GET('/projects/project-roles/', {
    params: { query: Object.fromEntries(sp) as any },
    headers: { 'Cache-Control': 'no-cache' },
  }).then((res) => {
    const data = (res.data as ProjectRole[]) || [];
    rolesCache.set(key, data);
    rolesInFlight.delete(key);
    return data.slice();
  }).catch((err) => {
    rolesInFlight.delete(key);
    throw err;
  });
  rolesInFlight.set(key, req);
  return req;
}

export async function searchProjectRoles(query: string, departmentId?: number, includeInactive = false): Promise<ProjectRole[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const sp = new URLSearchParams();
  sp.set('q', q);
  if (departmentId != null) sp.set('department', String(departmentId));
  if (includeInactive) sp.set('include_inactive', 'true');
  const res = await apiClient.GET('/projects/project-roles/search/' as any, {
    params: { query: Object.fromEntries(sp) as any },
    headers: { 'Cache-Control': 'no-cache' },
  });
  return (res.data as ProjectRole[]) || [];
}

export async function createProjectRole(departmentId: number, name: string, sortOrder = 0): Promise<ProjectRole> {
  const res = await apiClient.POST('/projects/project-roles/', { body: { department: departmentId, name, sortOrder } as any });
  return res.data as ProjectRole;
}

export async function updateProjectRole(id: number, payload: { name?: string; isActive?: boolean; sortOrder?: number }): Promise<ProjectRole> {
  const res = await apiClient.PATCH('/projects/project-roles/{id}/' as any, { params: { path: { id } }, body: payload as any });
  return res.data as ProjectRole;
}

export async function deleteProjectRole(id: number): Promise<void> {
  await apiClient.DELETE('/projects/project-roles/{id}/' as any, { params: { path: { id } } });
}

export async function reorderProjectRoles(departmentId: number, ids: number[]): Promise<void> {
  const sp: any = { department: departmentId };
  const res = await apiClient.POST('/projects/project-roles/reorder/' as any, { params: { query: sp }, body: { ids } as any });
  if (res.error || (res.response && !res.response.ok)) {
    const status = res.response?.status ?? 500;
    throw new Error(`Reorder failed: HTTP ${status}`);
  }
}

export async function getProjectRoleUsage(id: number): Promise<ProjectRoleUsage> {
  const res = await apiClient.GET('/projects/project-roles/{id}/usage/' as any, { params: { path: { id } } });
  return res.data as ProjectRoleUsage;
}

export async function clearProjectRoleAssignments(id: number): Promise<{ cleared: number }> {
  const res = await apiClient.POST('/projects/project-roles/{id}/clear-assignments/' as any, { params: { path: { id } } });
  return res.data as { cleared: number };
}
