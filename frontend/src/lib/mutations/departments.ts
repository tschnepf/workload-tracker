import type { Department } from '@/types/models';
import { departmentsApi } from '@/services/api';
import { emitDepartmentsRefresh } from '@/lib/departmentsRefreshBus';

export async function createDepartment(
  data: Partial<Department>,
  api: typeof departmentsApi = departmentsApi,
) {
  const created = await api.create(data as any);
  emitDepartmentsRefresh();
  return created;
}

export async function updateDepartment(
  id: number,
  data: Partial<Department>,
  api: typeof departmentsApi = departmentsApi,
) {
  const updated = await api.update(id, data as any);
  emitDepartmentsRefresh();
  return updated;
}

export async function deleteDepartment(
  id: number,
  api: typeof departmentsApi = departmentsApi,
) {
  await api.delete(id);
  emitDepartmentsRefresh();
}
