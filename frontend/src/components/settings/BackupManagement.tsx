import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Loader from '@/components/ui/Loader';
import { showToast } from '@/lib/toastBus';
import { backupApi } from '@/services/api';
import type { Backup } from '@/types/backup';
import { getAccessToken } from '@/utils/auth';
import { confirmDialog } from '@/components/ui/ConfirmationDialog';

// Prefer relative '/api' so Vite proxy handles routing in dev. If VITE_API_URL
// is set to an absolute URL, we still honor it.
const API_BASE_URL = (import.meta as any)?.env?.VITE_API_URL || '/api';

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  let val = bytes;
  do {
    val = val / 1024;
    i++;
  } while (val >= 1024 && i < units.length - 1);
  return `${val.toFixed(val < 10 ? 2 : 1)} ${units[i]}`;
}

const queryKeys = {
  backups: ['backups'] as const,
};

const BackupManagement: React.FC = () => {
  const qc = useQueryClient();
  const [description, setDescription] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.backups,
    queryFn: backupApi.getBackups,
  });

  const items = useMemo<Backup[]>(() => data?.items ?? [], [data]);

  const createMutation = useMutation({
    mutationFn: async (desc?: string) => backupApi.createBackup(desc && desc.trim() ? desc.trim() : undefined),
    onMutate: () => {
      showToast('Starting backup...', 'info');
    },
    onSuccess: (res) => {
      showToast('Backup job enqueued', 'success');
      // Immediately invalidate; list will update when job completes
      qc.invalidateQueries({ queryKey: queryKeys.backups });
    },
    onError: (e: any) => {
      showToast(e?.message || 'Failed to start backup', 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => backupApi.deleteBackup(id),
    onSuccess: () => {
      showToast('Backup deleted', 'success');
      qc.invalidateQueries({ queryKey: queryKeys.backups });
    },
    onError: (e: any) => {
      showToast(e?.message || 'Failed to delete backup', 'error');
    },
  });

  const handleCreate = async () => {
    const desc = description.trim();
    if (desc.length > 200) {
      showToast('Description is too long (max 200 chars)', 'warning');
      return;
    }
    await createMutation.mutateAsync(desc || undefined);
    setDescription('');
  };

  const handleDelete = async (b: Backup) => {
    const ok = await confirmDialog({
      title: 'Delete Backup',
      message: (
        <>
          This will permanently delete <strong className="font-mono">{b.filename}</strong>.
          This action cannot be undone.
        </>
      ),
      requiredText: 'DELETE',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    await deleteMutation.mutateAsync(b.id);
  };

  const handleDownload = async (b: Backup) => {
    try {
      setDownloading(b.id);
      const url = `${API_BASE_URL}/backups/${encodeURIComponent(b.id)}/download/`;
      const token = getAccessToken();
      const res = await fetch(url, {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const data = await res.json();
          msg = (data?.detail || data?.message || msg);
        } catch {}
        throw new Error(msg);
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = b.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      showToast('Download started', 'success');
    } catch (e: any) {
      showToast(e?.message || 'Failed to download backup', 'error');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Card title="Backups" className="">
      {/* Actions */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-4">
        <div className="flex-1">
          <Input
            label="Description (optional)"
            placeholder="e.g., Pre-upgrade backup"
            value={description}
            onChange={(e) => setDescription((e.target as HTMLInputElement).value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleCreate}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? 'Starting…' : 'Create Backup'}
          </Button>
          <Button variant="ghost" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="py-8">
          <Loader inline message="Loading backups..." />
        </div>
      ) : error ? (
        <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-3 rounded">
          {(error as any)?.message || 'Failed to load backups'}
        </div>
      ) : items.length === 0 ? (
        <div className="text-[#969696]">No backups found.</div>
      ) : (
        <div className="overflow-auto">
          <table className="min-w-full text-sm text-left">
            <thead className="text-[#969696]">
              <tr>
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Filename</th>
                <th className="py-2 pr-4">Size</th>
                <th className="py-2 pr-4">Description</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody className="text-[#cccccc]">
              {items.map((b) => {
                const dt = b.createdAt ? new Date(b.createdAt) : null;
                const when = dt ? dt.toLocaleString() : '-';
                return (
                  <tr key={b.id} className="border-t border-[#3e3e42]">
                    <td className="py-2 pr-4 whitespace-nowrap">{when}</td>
                    <td className="py-2 pr-4">
                      <div className="font-mono break-all">{b.filename}</div>
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">{formatBytes(b.size)}</td>
                    <td className="py-2 pr-4">{b.description || <span className="text-[#969696]">-</span>}</td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleDownload(b)}
                          disabled={downloading === b.id}
                        >
                          {downloading === b.id ? 'Downloading...' : 'Download'}
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleDelete(b)}
                          disabled={deleteMutation.isPending}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

export default BackupManagement;
