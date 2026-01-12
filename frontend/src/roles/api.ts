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

export async function listProjectRoles(departmentId: number, includeInactive = false): Promise<ProjectRole[]> {
  const sp = new URLSearchParams();
  sp.set('department', String(departmentId));
  if (includeInactive) sp.set('include_inactive', 'true');
  const res = await apiClient.GET('/projects/project-roles/', {
    params: { query: Object.fromEntries(sp) as any },
    headers: { 'Cache-Control': 'no-cache' },
  });
  return res.data as ProjectRole[];
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
