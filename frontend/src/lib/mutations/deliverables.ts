import type { Deliverable } from '@/types/models';
import { deliverablesApi } from '@/services/api';
import { emitDeliverablesRefresh } from '@/lib/deliverablesRefreshBus';

export async function createDeliverable(
  data: Partial<Deliverable> & { project?: number },
  api: typeof deliverablesApi = deliverablesApi,
) {
  const created = await api.create(data as any);
  emitDeliverablesRefresh();
  return created;
}

export async function updateDeliverable(
  id: number,
  data: Partial<Deliverable>,
  api: typeof deliverablesApi = deliverablesApi,
) {
  const updated = await api.update(id, data as any);
  emitDeliverablesRefresh();
  return updated;
}

export async function deleteDeliverable(
  id: number,
  api: typeof deliverablesApi = deliverablesApi,
) {
  await api.delete(id);
  emitDeliverablesRefresh();
}
