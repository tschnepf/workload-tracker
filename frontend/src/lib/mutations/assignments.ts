import type { Assignment } from '@/types/models';
import { assignmentsApi } from '@/services/api';
import { emitAssignmentsRefresh, type AssignmentEvent } from '@/lib/assignmentsRefreshBus';

export async function createAssignment(
  data: Partial<Assignment>,
  api: typeof assignmentsApi = assignmentsApi,
) {
  const created = await api.create(data as any);
  const fields = Object.keys(data || {});
  const merged = { ...(created || {}), ...(data || {}) } as Assignment;
  const event: AssignmentEvent = {
    type: 'created',
    assignmentId: merged?.id as number,
    projectId: (merged as any)?.project ?? (data as any)?.project ?? null,
    personId: (merged as any)?.person ?? (data as any)?.person ?? null,
    updatedAt: (merged as any)?.updatedAt ?? new Date().toISOString(),
    fields,
    assignment: merged,
  };
  emitAssignmentsRefresh(event);
  return created;
}

export async function updateAssignment(
  id: number,
  data: Partial<Assignment>,
  api: typeof assignmentsApi = assignmentsApi,
  opts?: { skipIfMatch?: boolean },
) {
  const updated = await (api.update as any)(id, data as any, opts);
  const fields = Object.keys(data || {});
  const merged = { ...(updated || {}), ...(data || {}) } as Assignment;
  const event: AssignmentEvent = {
    type: 'updated',
    assignmentId: merged?.id ?? id,
    projectId: (merged as any)?.project ?? (data as any)?.project ?? null,
    personId: (merged as any)?.person ?? (data as any)?.person ?? null,
    updatedAt: (merged as any)?.updatedAt ?? new Date().toISOString(),
    fields,
    assignment: merged,
  };
  emitAssignmentsRefresh(event);
  return updated;
}

export async function deleteAssignment(
  id: number,
  api: typeof assignmentsApi = assignmentsApi,
  meta?: { projectId?: number | null; personId?: number | null; updatedAt?: string | null }
) {
  await api.delete(id);
  const event: AssignmentEvent = {
    type: 'deleted',
    assignmentId: id,
    projectId: meta?.projectId ?? null,
    personId: meta?.personId ?? null,
    updatedAt: meta?.updatedAt ?? new Date().toISOString(),
  };
  emitAssignmentsRefresh(event);
}

export async function bulkUpdateAssignmentHours(
  updates: Array<{ assignmentId: number; weeklyHours: Record<string, number> }>,
  api: typeof assignmentsApi = assignmentsApi,
) {
  const result = await api.bulkUpdateHours(updates);
  updates.forEach((update) => {
    const event: AssignmentEvent = {
      type: 'updated',
      assignmentId: update.assignmentId,
      updatedAt: new Date().toISOString(),
      fields: ['weeklyHours'],
    };
    emitAssignmentsRefresh(event);
  });
  return result;
}
