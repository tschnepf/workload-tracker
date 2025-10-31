import { apiClient, authHeaders } from '@/api/client';

export async function triggerWeeklySnapshot(week?: string) {
  const body: any = {};
  if (week) body.week = week;
  // Use apiClient.POST to keep auth + ETag behavior consistent
  const res = await apiClient.POST('/assignments/run_weekly_snapshot/' as any, { body, headers: authHeaders() });
  if (!res.data) throw new Error(`HTTP ${res.response?.status ?? 500}`);
  return res.data as { week_start: string; lock_acquired: boolean; examined?: number; inserted?: number; updated?: number; skipped?: number; events_inserted?: number; skipped_due_to_lock?: boolean };
}

