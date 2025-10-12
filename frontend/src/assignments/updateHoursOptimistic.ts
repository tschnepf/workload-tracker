import { assignmentsApi } from '@/services/api';
import { etagStore } from '@/api/etagStore';

export type Cell = { assignmentId: number; weekKey: string };

export async function applyHoursToCellsOptimistic(params: {
  cells: Cell[];
  value: number;
  getMap: (assignmentId: number) => Record<string, number>;
  applyLocally: (updates: Map<number, Record<string, number>>) => void;
  revertLocally: (prev: Map<number, Record<string, number>>) => void;
  afterSuccess?: () => Promise<void> | void;
}) {
  const { cells, value, getMap, applyLocally, revertLocally, afterSuccess } = params;
  if (!cells || cells.length === 0) return;

  // Consolidate per-assignment maps
  const updates = new Map<number, Record<string, number>>();
  const prevSnapshot = new Map<number, Record<string, number>>();
  for (const c of cells) {
    const current = updates.get(c.assignmentId) || { ...getMap(c.assignmentId) };
    if (!prevSnapshot.has(c.assignmentId)) prevSnapshot.set(c.assignmentId, { ...current });
    current[c.weekKey] = value;
    updates.set(c.assignmentId, current);
  }

  // Optimistic apply
  applyLocally(updates);

  try {
    if (updates.size > 1) {
      const payload = Array.from(updates.entries()).map(([assignmentId, weeklyHours]) => ({ assignmentId, weeklyHours }));
      const res = await assignmentsApi.bulkUpdateHours(payload);
      // Persist returned ETags per assignment to avoid stale 412s on subsequent writes
      try {
        for (const r of (res?.results || [])) {
          if (r?.assignmentId && r?.etag) {
            etagStore.set(`/assignments/${r.assignmentId}/`, r.etag);
          }
        }
      } catch {}
    } else {
      const [only] = Array.from(updates.entries());
      await assignmentsApi.update(only[0], { weeklyHours: only[1] });
    }
    await (afterSuccess?.());
  } catch (e) {
    // Revert on failure
    revertLocally(prevSnapshot);
    throw e;
  }
}
