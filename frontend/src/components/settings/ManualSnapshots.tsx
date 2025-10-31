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
  const [multi, setMulti] = React.useState(false);
  const [weeksBack, setWeeksBack] = React.useState<number>(1);

  const run = async () => {
    try {
      setBusy(true);
      setResult(null);
      const weeks: string[] = [];
      const base = new Date(week);
      const count = Math.max(1, multi ? weeksBack : 1);
      for (let i = 0; i < count; i++) {
        const d = new Date(base.getTime());
        d.setDate(d.getDate() - i * 7);
        weeks.push(sundayOfWeek(d));
      }

      const perWeek: Array<{ week: string; res?: any; error?: string }> = [];
      const totals = { examined: 0, inserted: 0, updated: 0, skipped: 0, events: 0, success: 0, skippedLock: 0, failed: 0 };
      for (const w of weeks) {
        try {
          const res = await triggerWeeklySnapshot(w, { backfill: useBackfill });
          perWeek.push({ week: w, res });
          if (res.lock_acquired) {
            totals.examined += res.examined ?? 0;
            totals.inserted += res.inserted ?? 0;
            totals.updated += res.updated ?? 0;
            totals.skipped += res.skipped ?? 0;
            totals.events += res.events_inserted ?? 0;
            totals.success += 1;
          } else {
            totals.skippedLock += 1;
          }
        } catch (e: any) {
          perWeek.push({ week: w, error: e?.message || 'Request failed' });
          totals.failed += 1;
        }
      }
      setResult({ perWeek, totals });
      const msg = `Processed ${weeks.length} week(s): ${totals.success} ok, ${totals.skippedLock} locked, ${totals.failed} failed. Inserted ${totals.inserted}, updated ${totals.updated}, events ${totals.events}.`;
      showToast(msg, totals.failed > 0 ? 'warning' : 'success');
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
        <label className="ml-4 inline-flex items-center gap-2 text-sm text-[var(--muted)]">
          <input
            type="checkbox"
            checked={multi}
            onChange={e => setMulti((e.target as HTMLInputElement).checked)}
          />
          Run multiple weeks
        </label>
        {multi && (
          <div className="inline-flex items-center gap-2 ml-2">
            <label className="text-sm text-[var(--muted)]">Weeks back (incl. selected):</label>
            <input
              type="number"
              min={1}
              max={104}
              value={weeksBack}
              onChange={e => setWeeksBack(Math.max(1, Math.min(104, Number((e.target as HTMLInputElement).value || 1))))}
              className="w-20 px-2 py-1 rounded bg-[var(--surface)] border border-[var(--border)]"
            />
          </div>
        )}
        <button
          disabled={busy}
          onClick={run}
          className={`px-3 py-2 rounded ${busy ? 'opacity-50 cursor-not-allowed' : 'bg-[var(--primary)] text-white border border-[var(--primary)] hover:opacity-90'}`}
        >
          {busy ? 'Running...' : 'Run Snapshot'}
        </button>
      </div>
      {result && result.totals && (
        <div className="mt-3 text-sm text-[var(--text)]">
          <div className="mb-1">Totals — Examined: {result.totals.examined}, Inserted: {result.totals.inserted}, Updated: {result.totals.updated}, Skipped: {result.totals.skipped}, Events: {result.totals.events}</div>
          <div className="text-[var(--muted)]">Runs: {result.totals.success} ok, {result.totals.skippedLock} locked, {result.totals.failed} failed</div>
          <div className="mt-2">
            {(result.perWeek || []).map((row: any) => (
              <div key={row.week} className="text-[var(--muted)]">
                <span className="text-[var(--text)]">{row.week}</span>: {row.error ? (<span className="text-red-400">{row.error}</span>) : (
                  <>
                    {row.res.lock_acquired ? (
                      <>ins {row.res.inserted ?? 0}, upd {row.res.updated ?? 0}, ev {row.res.events_inserted ?? 0}</>
                    ) : (
                      <span className="text-amber-400">skipped (lock)</span>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
