import type { Project } from '@/types/models';
import { projectsApi } from '@/services/api';
import { emitProjectsRefresh } from '@/lib/projectsRefreshBus';

export async function createProject(
  data: Partial<Project>,
  api: typeof projectsApi = projectsApi,
) {
  const created = await api.create(data as any);
  emitProjectsRefresh();
  return created;
}

export async function updateProject(
  id: number,
  data: Partial<Project>,
  api: typeof projectsApi = projectsApi,
) {
  const updated = await api.update(id, data as any);
  emitProjectsRefresh();
  return updated;
}

export async function deleteProject(
  id: number,
  api: typeof projectsApi = projectsApi,
) {
  await api.delete(id);
  emitProjectsRefresh();
}
