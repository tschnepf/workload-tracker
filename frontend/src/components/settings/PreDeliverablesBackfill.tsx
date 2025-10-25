import React from 'react';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { showToast } from '@/lib/toastBus';
import { deliverablesApi } from '@/services/api';
import { useCapabilities } from '@/hooks/useCapabilities';

const PreDeliverablesBackfill: React.FC = () => {
  const caps = useCapabilities();
  const [projectId, setProjectId] = React.useState<string>('');
  const [start, setStart] = React.useState<string>('');
  const [end, setEnd] = React.useState<string>('');
  const [regenerate, setRegenerate] = React.useState<boolean>(false);
  const [busy, setBusy] = React.useState<boolean>(false);
  const [result, setResult] = React.useState<any | null>(null);

  const onRun = async () => {
    try {
      setBusy(true);
      setResult(null);
      const opts: any = {};
      if (projectId.trim() !== '') opts.projectId = Number(projectId);
      if (start) opts.start = start;
      if (end) opts.end = end;
      if (regenerate) opts.regenerate = true;
      const res = await deliverablesApi.backfillPreItems(opts);
      if (res.enqueued) {
        setResult(res);
        showToast('Backfill job enqueued', 'success');
      } else {
        setResult(res.result || {});
        showToast('Backfill completed', 'success');
      }
    } catch (e: any) {
      showToast(e?.message || 'Failed to start backfill', 'error');
    } finally {
      setBusy(false);
    }
  };

  const asyncEnabled = !!((caps.data as any)?.asyncJobs);

  return (
    <Card title="Pre‑Deliverables Backfill" className="mt-6">
      <div className="text-sm text-[var(--muted)] mb-3">
        Generate missing pre‑deliverables (or fully regenerate) for existing deliverables.
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Input
          label="Project ID (optional)"
          type="number"
          value={projectId}
          onChange={(e) => setProjectId((e.target as HTMLInputElement).value)}
          placeholder="e.g., 123"
        />
        <Input label="Start Date (YYYY‑MM‑DD)" type="date" value={start} onChange={(e) => setStart((e.target as HTMLInputElement).value)} />
        <Input label="End Date (YYYY‑MM‑DD)" type="date" value={end} onChange={(e) => setEnd((e.target as HTMLInputElement).value)} />
        <div className="flex items-end">
          <label className="inline-flex items-center gap-2 text-[var(--text)]">
            <input type="checkbox" checked={regenerate} onChange={(e) => setRegenerate(e.currentTarget.checked)} />
            Regenerate (delete + recreate)
          </label>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button onClick={onRun} disabled={busy}>{busy ? 'Working…' : 'Run Backfill'}</Button>
        {!asyncEnabled && (
          <span className="text-xs text-[var(--muted)]">Runs synchronously (ASYNC_JOBS is disabled)</span>
        )}
      </div>
      {result && (
        <div className="mt-3 text-sm text-[var(--text)] space-y-1">
          {'jobId' in result ? (
            <div>
              <div>Job ID: <code>{(result as any).jobId}</code></div>
              {(result as any).statusUrl && (
                <a className="text-[var(--primary)] underline" href={(result as any).statusUrl} target="_blank" rel="noreferrer">Open job status</a>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div>Processed: {(result as any).processed ?? '-'}</div>
              <div>Created: {(result as any).created ?? '-'}</div>
              <div>Deleted: {(result as any).deleted ?? '-'}</div>
              <div>Preserved Completed: {(result as any).preservedCompleted ?? '-'}</div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

export default PreDeliverablesBackfill;

