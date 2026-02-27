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
const rolesBulkCache = new Map<string, Record<number, ProjectRole[]>>();
const rolesBulkInFlight = new Map<string, Promise<Record<number, ProjectRole[]>>>();

function cacheKey(departmentId: number, includeInactive: boolean) {
  return `${departmentId}:${includeInactive ? '1' : '0'}`;
}

function normalizeDepartmentIds(departmentIds: number[]): number[] {
  const seen = new Set<number>();
  const output: number[] = [];
  for (const rawId of departmentIds) {
    const deptId = Number(rawId);
    if (!Number.isFinite(deptId) || deptId <= 0) continue;
    if (seen.has(deptId)) continue;
    seen.add(deptId);
    output.push(deptId);
  }
  output.sort((a, b) => a - b);
  return output;
}

function bulkCacheKey(departmentIds: number[], includeInactive: boolean) {
  return `${includeInactive ? '1' : '0'}:default:${departmentIds.join(',')}`;
}

function cloneRolesByDepartment(payload: Record<number, ProjectRole[]>): Record<number, ProjectRole[]> {
  const cloned: Record<number, ProjectRole[]> = {};
  Object.entries(payload).forEach(([deptId, roles]) => {
    cloned[Number(deptId)] = Array.isArray(roles) ? roles.slice() : [];
  });
  return cloned;
}

export function primeProjectRolesCache(payload: Record<string, ProjectRole[]> | null | undefined, includeInactive = false) {
  if (!payload) return;
  Object.entries(payload).forEach(([deptId, roles]) => {
    const id = Number(deptId);
    if (!Number.isFinite(id)) return;
    rolesCache.set(cacheKey(id, includeInactive), Array.isArray(roles) ? roles.slice() : []);
  });
}

export function clearProjectRolesCache(departmentId?: number) {
  if (departmentId == null) {
    rolesCache.clear();
    rolesInFlight.clear();
    rolesBulkCache.clear();
    rolesBulkInFlight.clear();
    return;
  }
  rolesCache.delete(cacheKey(departmentId, false));
  rolesCache.delete(cacheKey(departmentId, true));
  rolesInFlight.delete(cacheKey(departmentId, false));
  rolesInFlight.delete(cacheKey(departmentId, true));
  // Bulk cache keys are multi-department; clear coarse-grained to avoid stale maps.
  rolesBulkCache.clear();
  rolesBulkInFlight.clear();
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

export async function listProjectRolesBulk(
  departmentIds: number[],
  includeInactive = false
): Promise<Record<number, ProjectRole[]>> {
  const ids = normalizeDepartmentIds(departmentIds);
  if (!ids.length) return {};

  const key = bulkCacheKey(ids, includeInactive);
  const cached = rolesBulkCache.get(key);
  if (cached) return cloneRolesByDepartment(cached);

  // If every department is already populated in single-department cache,
  // avoid issuing an extra bulk API request.
  const singleCachePayload: Record<number, ProjectRole[]> = {};
  let hasFullSingleCache = true;
  ids.forEach((deptId) => {
    const deptCached = rolesCache.get(cacheKey(deptId, includeInactive));
    if (!deptCached) {
      hasFullSingleCache = false;
      return;
    }
    singleCachePayload[deptId] = deptCached.slice();
  });
  if (hasFullSingleCache) {
    rolesBulkCache.set(key, cloneRolesByDepartment(singleCachePayload));
    return cloneRolesByDepartment(singleCachePayload);
  }

  const inflight = rolesBulkInFlight.get(key);
  if (inflight) return inflight;

  const req = apiClient.POST('/projects/project-roles/bulk/' as any, {
    body: { department_ids: ids, include_inactive: includeInactive } as any,
    headers: { 'Cache-Control': 'no-cache' },
  }).then((res) => {
    if (res.error || (res.response && !res.response.ok) || !res.data) {
      const status = res.response?.status ?? 500;
      throw new Error(`Failed to list project roles in bulk: HTTP ${status}`);
    }

    const raw = ((res.data as any).rolesByDepartment || {}) as Record<string, ProjectRole[]>;
    const mapped: Record<number, ProjectRole[]> = {};
    ids.forEach((deptId) => {
      const roles = Array.isArray(raw[String(deptId)]) ? raw[String(deptId)] : [];
      const copy = roles.slice();
      mapped[deptId] = copy;
      rolesCache.set(cacheKey(deptId, includeInactive), copy.slice());
    });

    rolesBulkCache.set(key, cloneRolesByDepartment(mapped));
    rolesBulkInFlight.delete(key);
    return cloneRolesByDepartment(mapped);
  }).catch((err) => {
    rolesBulkInFlight.delete(key);
    throw err;
  });

  rolesBulkInFlight.set(key, req);
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
