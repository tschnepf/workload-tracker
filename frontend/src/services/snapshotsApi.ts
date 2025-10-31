import { apiClient, authHeaders } from '@/api/client';

export async function triggerWeeklySnapshot(week?: string, opts?: { backfill?: boolean; emitEvents?: boolean; force?: boolean }) {
  const body: any = {};
  if (week) body.week = week;
  if (opts?.backfill) body.backfill = true;
  if (opts?.emitEvents) body.emit_events = true;
  if (opts?.force) body.force = true;
  // Use apiClient.POST to keep auth + ETag behavior consistent
  const res = await apiClient.POST('/assignments/run_weekly_snapshot/' as any, { body, headers: authHeaders() });
  if (!res.data) throw new Error(`HTTP ${res.response?.status ?? 500}`);
  return res.data as { week_start: string; lock_acquired: boolean; examined?: number; inserted?: number; updated?: number; skipped?: number; events_inserted?: number; skipped_due_to_lock?: boolean };
}
