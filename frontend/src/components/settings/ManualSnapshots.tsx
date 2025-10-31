import React from 'react';
import { triggerWeeklySnapshot } from '@/services/snapshotsApi';
import { showToast } from '@/lib/toastBus';

function sundayOfWeek(d: Date) {
  const day = d.getDay(); // Sun=0..Sat=6
  const diff = day === 0 ? 0 : day; // number of days since last Sunday
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  copy.setDate(copy.getDate() - diff);
  const y = copy.getFullYear();
  const m = String(copy.getMonth() + 1).padStart(2, '0');
  const dd = String(copy.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export default function ManualSnapshots() {
  const [week, setWeek] = React.useState<string>(() => sundayOfWeek(new Date()));
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<any | null>(null);
  const [useBackfill, setUseBackfill] = React.useState(false);

  const run = async () => {
    try {
      setBusy(true);
      setResult(null);
      const res = await triggerWeeklySnapshot(week, { backfill: useBackfill });
      setResult(res);
      if (res.lock_acquired) {
        showToast(`Snapshot done: inserted ${res.inserted ?? 0}, updated ${res.updated ?? 0}, events ${res.events_inserted ?? 0}`, 'success');
      } else {
        showToast('Snapshot skipped (lock not acquired)', 'warning');
      }
    } catch (e: any) {
      showToast(e?.message || 'Failed to run snapshot', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6 mt-6">
      <h2 className="text-xl font-semibold text-[var(--text)] mb-2">Manual Weekly Snapshot</h2>
      <p className="text-[var(--muted)] text-sm mb-3">Run the snapshot writer for a specific Sunday. Defaults to the current week.</p>
      <div className="flex items-center gap-2">
        <label className="text-sm text-[var(--muted)]">Week (Sunday):</label>
        <input
          type="date"
          value={week}
          onChange={e => setWeek((e.target as HTMLInputElement).value)}
          className="px-2 py-1 rounded bg-[var(--surface)] border border-[var(--border)]"
        />
        <label className="ml-4 inline-flex items-center gap-2 text-sm text-[var(--muted)]">
          <input
            type="checkbox"
            checked={useBackfill}
            onChange={e => setUseBackfill((e.target as HTMLInputElement).checked)}
          />
          Use backfill (initial snapshot)
        </label>
        <button
          disabled={busy}
          onClick={run}
          className={`px-3 py-2 rounded ${busy ? 'opacity-50 cursor-not-allowed' : 'bg-[var(--primary)] text-white border border-[var(--primary)] hover:opacity-90'}`}
        >
          {busy ? 'Running...' : 'Run Snapshot'}
        </button>
      </div>
      {result && (
        <div className="mt-3 text-sm text-[var(--text)]">
          <div>Week: <span className="text-[var(--muted)]">{result.week_start}</span></div>
          <div>Inserted: {result.inserted ?? 0} - Updated: {result.updated ?? 0} - Events: {result.events_inserted ?? 0}</div>
          {result.skipped_due_to_lock && <div className="text-amber-400">Skipped due to lock</div>}
        </div>
      )}
    </div>
  );
}
