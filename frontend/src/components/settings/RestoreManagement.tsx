import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Loader from '@/components/ui/Loader';
import { showToast } from '@/lib/toastBus';
import { backupApi, jobsApi } from '@/services/api';
import type { Backup } from '@/types/backup';
import { confirmDialog } from '@/components/ui/ConfirmationDialog';

const RESTORE_CONFIRM_PHRASE = 'I understand this will irreversibly overwrite data';

const queryKeys = {
  backups: ['backups'] as const,
};

type ActiveJob = {
  jobId: string;
  target?: string; // filename or label
  state: string;
  message?: string | null;
  progress?: number;
  error?: string | null;
};

function PhaseIndicator({ state, message }: { state: string; message?: string | null }) {
  const steps = ['prechecks', 'drop schema', 'restore', 'post-restore'];
  // Heuristic mapping based on message (if any)
  const msg = (message || '').toLowerCase();
  let activeIdx = 0;
  if (msg.includes('drop') || msg.includes('schema')) activeIdx = 1;
  if (msg.includes('restore') || msg.includes('pg_restore')) activeIdx = 2;
  if (msg.includes('migrate') || msg.includes('vacuum') || state === 'SUCCESS') activeIdx = 3;
  return (
    <div className="flex items-center gap-2 text-xs">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <span className={`${i <= activeIdx ? 'text-[#cccccc]' : 'text-[#969696]'}`}>{s}</span>
          {i < steps.length - 1 && <span className="text-[#3e3e42]">→</span>}
        </div>
      ))}
    </div>
  );
}

const RestoreManagement: React.FC = () => {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: queryKeys.backups, queryFn: backupApi.getBackups });
  const items = useMemo<Backup[]>(() => data?.items ?? [], [data]);

  const [jobs, setJobs] = useState<number>(2);
  // Default to running migrations after restore to align DB with current code
  const [migrate, setMigrate] = useState<boolean>(true);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadAbort, setUploadAbort] = useState<AbortController | null>(null);

  const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024; // 5 GiB (client guard)
  const CLIENT_UPLOAD_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

  const startPolling = async (jobId: string, target?: string) => {
    try {
      setActiveJob({ jobId, target, state: 'STARTED', message: 'Starting...', progress: 0 });
      const started = Date.now();
      // Poll until terminal
      while (true) {
        const s = await jobsApi.getStatus(jobId);
        setActiveJob(prev => ({
          jobId,
          target,
          state: s.state,
          message: s.message,
          progress: s.progress,
          error: s.error ?? null,
        }));
        if (s.state === 'SUCCESS') break;
        if (s.state === 'FAILURE') throw new Error(s.error || 'Restore failed');
        if (Date.now() - started > 3 * 60 * 60 * 1000) throw new Error('Restore timed out');
        await new Promise(r => setTimeout(r, 1500));
      }
      showToast('Restore completed successfully', 'success');
      qc.invalidateQueries({ queryKey: queryKeys.backups });
    } catch (e: any) {
      showToast(e?.message || 'Restore failed', 'error');
    } finally {
      // Leave final status visible for context; auto-clear after short delay
      setTimeout(() => setActiveJob(null), 10000);
    }
  };

  const handleRestore = async (b: Backup) => {
    const ok = await confirmDialog({
      title: 'Confirm Restore',
      message: (
        <>
          This will drop the current database schema and restore from <strong className="font-mono">{b.filename}</strong>.
          All current data will be irreversibly lost.
        </>
      ),
      requiredText: RESTORE_CONFIRM_PHRASE,
      confirmLabel: 'Yes, restore',
    });
    if (!ok) return;
    try {
      showToast('Starting restore...', 'info');
      const res = await backupApi.restoreBackup(b.id, RESTORE_CONFIRM_PHRASE, { jobs, migrate });
      await startPolling(res.jobId, b.filename);
    } catch (e: any) {
      showToast(e?.message || 'Failed to start restore', 'error');
    }
  };

  const handleUploadRestore = async () => {
    if (!uploadFile) {
      showToast('Select a backup file first', 'warning');
      return;
    }
    // Client-side validation: type and size
    const name = uploadFile.name || '';
    if (!(name.endsWith('.pgcustom') || name.endsWith('.sql.gz'))) {
      showToast('Unsupported file type. Expect .pgcustom or .sql.gz', 'error');
      return;
    }
    if (typeof uploadFile.size === 'number' && uploadFile.size > MAX_UPLOAD_BYTES) {
      showToast('File too large (over client limit)', 'error');
      return;
    }
    const ok = await confirmDialog({
      title: 'Confirm Upload & Restore',
      message: (
        <>
          This will upload <strong className="font-mono">{uploadFile.name}</strong> and restore the database from it.
          All current data will be irreversibly lost.
        </>
      ),
      requiredText: RESTORE_CONFIRM_PHRASE,
      confirmLabel: 'Yes, upload and restore',
    });
    if (!ok) return;
    try {
      showToast('Uploading backup...', 'info');
      const res = await backupApi.uploadAndRestore(uploadFile, RESTORE_CONFIRM_PHRASE, { jobs, migrate });
      await startPolling(res.jobId, uploadFile.name);
      setUploadFile(null);
    } catch (e: any) {
      showToast(e?.message || 'Failed to upload/restore', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <Card title="Restore from Existing Backup">
        <div className="bg-red-500/20 border border-red-500/30 text-red-300 rounded px-4 py-3 mb-4">
          Warning: Restoring will irreversibly overwrite all current data. Type the exact confirmation phrase when prompted.
        </div>

        {/* Options */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-sm text-[#969696] mb-1">Parallel jobs (pg_restore)</label>
            <input
              type="number"
              min={2}
              max={4}
              value={jobs}
              onChange={(e) => setJobs(Math.max(2, Math.min(4, Number((e.target as HTMLInputElement).value) || 2)))}
              className="w-full bg-[#1f1f1f] border border-[#3e3e42] text-[#cccccc] rounded px-3 py-2 min-h-[44px]"
            />
            <div className="text-xs text-[#969696] mt-1">Use 2–4 threads for most databases. Higher values may not improve performance and can increase load.</div>
          </div>
          <div className="flex items-center gap-2 mt-6">
            <input id="rm-migrate" type="checkbox" checked={migrate} onChange={(e) => setMigrate((e.target as HTMLInputElement).checked)} />
            <label htmlFor="rm-migrate" className="text-sm text-[#cccccc]">Run migrations after restore if needed</label>
          </div>
        </div>

        {isLoading ? (
          <div className="py-8"><Loader inline message="Loading backups..." /></div>
        ) : error ? (
          <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-3 rounded">
            {(error as any)?.message || 'Failed to load backups'}
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm text-left">
              <thead className="text-[#969696]">
                <tr>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Filename</th>
                  <th className="py-2 pr-4">Format</th>
                  <th className="py-2 pr-4">Action</th>
                </tr>
              </thead>
              <tbody className="text-[#cccccc]">
                {items.map(b => {
                  const dt = b.createdAt ? new Date(b.createdAt) : null;
                  const when = dt ? dt.toLocaleString() : '-';
                  return (
                    <tr key={b.id} className="border-t border-[#3e3e42]">
                      <td className="py-2 pr-4 whitespace-nowrap">{when}</td>
                      <td className="py-2 pr-4">
                        <div className="font-mono break-all">{b.filename}</div>
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap">{b.format}</td>
                      <td className="py-2 pr-4">
                        <Button size="sm" onClick={() => handleRestore(b)} disabled={!!activeJob}>Restore</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Active job status */}
        {activeJob && (
          <div className="mt-4 p-3 rounded border border-[#3e3e42] bg-[#252526]">
            <div className="text-sm text-[#cccccc] mb-1">Restoring: <span className="font-mono">{activeJob.target || activeJob.jobId}</span></div>
            <div className="text-xs text-[#969696] mb-2">State: {activeJob.state}{activeJob.progress != null ? ` (${activeJob.progress}%)` : ''}</div>
            <PhaseIndicator state={activeJob.state} message={activeJob.message} />
            {activeJob.message && (<div className="text-xs text-[#969696] mt-2">{activeJob.message}</div>)}
            <div className="mt-2"><Button variant="ghost" size="sm" onClick={() => setActiveJob(null)}>Dismiss</Button></div>
          </div>
        )}
      </Card>

      <Card title="Upload and Restore">
        <div className="bg-red-500/20 border border-red-500/30 text-red-300 rounded px-4 py-3 mb-4">
          Warning: Uploading a backup and restoring will irreversibly overwrite all current data.
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="sm:col-span-2">
            <label className="block text-sm text-[#969696] mb-1">Backup file (.pgcustom or .sql.gz)</label>
            <input
              type="file"
              accept=".pgcustom,.sql.gz"
              onChange={(e) => setUploadFile(((e.target as HTMLInputElement).files?.[0]) || null)}
              className="w-full text-sm text-[#cccccc]"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={handleUploadRestore} disabled={!uploadFile || !!activeJob}>Upload & Restore</Button>
          </div>
        </div>

        {uploadFile && (
          <div className="text-xs text-[#969696]">Selected: <span className="font-mono">{uploadFile.name}</span></div>
        )}
      </Card>
    </div>
  );
};

export default RestoreManagement;
