import { etagStore } from '@/api/etagStore';
import { clearApiMemoryCaches } from '@/lib/fetchApiCache';
import { queryClient } from '@/lib/queryClient';
import { clearProjectRolesCache } from '@/roles/api';
import { resetAssignmentsAutoHoursBundleSession } from '@/services/assignmentsPageSnapshotApi';

export function resetIdentityTransitionCaches(_reason: string): void {
  try {
    queryClient.clear();
  } catch {}
  try {
    clearApiMemoryCaches();
  } catch {}
  try {
    clearProjectRolesCache();
  } catch {}
  try {
    resetAssignmentsAutoHoursBundleSession();
  } catch {}
  try {
    etagStore.clear();
  } catch {}
}
