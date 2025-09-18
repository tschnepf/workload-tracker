// ETag enhancer for assignments API bulk updates (non-invasive)
// This module augments bulkUpdateHours to persist returned ETags
// so subsequent PATCH/DELETE operations can use If-Match safely.

import { assignmentsApi } from '@/services/api';
import { etagStore } from '@/api/etagStore';

type BulkResult = { success: boolean; results: Array<{ assignmentId: number; status: string; etag?: string }> };

if (assignmentsApi && typeof assignmentsApi.bulkUpdateHours === 'function') {
  const original = assignmentsApi.bulkUpdateHours.bind(assignmentsApi);
  assignmentsApi.bulkUpdateHours = (async (updates) => {
    const res = await original(updates);
    try {
      const payload = res as unknown as BulkResult;
      for (const r of payload?.results || []) {
        if (r.assignmentId && r.etag) {
          etagStore.set(`/assignments/${r.assignmentId}/`, r.etag);
        }
      }
    } catch {}
    return res as any;
  }) as typeof assignmentsApi.bulkUpdateHours;
}

