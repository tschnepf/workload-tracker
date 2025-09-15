import React from 'react';
import { useQuery } from '@tanstack/react-query';
import Card from '@/components/ui/Card';
import Loader from '@/components/ui/Loader';
import { backupApi } from '@/services/api';

function formatBytes(bytes?: number): string {
  if (bytes == null || !Number.isFinite(bytes)) return '-';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = -1;
  do { v /= 1024; i++; } while (v >= 1024 && i < units.length - 1);
  return `${v.toFixed(v < 10 ? 2 : 1)} ${units[i]}`;
}

const BackupOverview: React.FC = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['backup-status'],
    queryFn: backupApi.getBackupStatus,
  });

  return (
    <Card title="Backup Status">
      {isLoading ? (
        <div className="py-6"><Loader inline message="Loading backup status…" /></div>
      ) : error ? (
        <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-3 rounded">
          {(error as any)?.message || 'Failed to load backup status'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-[#969696]">Last Backup</div>
            <div className="text-[#cccccc]">{data?.lastBackupAt ? new Date(data.lastBackupAt).toLocaleString() : '—'}</div>
          </div>
          <div>
            <div className="text-[#969696]">Last Backup Size</div>
            <div className="text-[#cccccc]">{formatBytes(data?.lastBackupSize)}</div>
          </div>
          <div>
            <div className="text-[#969696]">Retention</div>
            <div className={data?.retentionOk ? 'text-emerald-400' : 'text-red-400'}>
              {data?.retentionOk ? 'OK' : 'No backups found'}{data?.policy ? ` • Policy: ${data.policy}` : ''}
            </div>
          </div>
          <div>
            <div className="text-[#969696]">Offsite Sync</div>
            <div className={data?.offsiteEnabled ? 'text-[#cccccc]' : 'text-[#969696]'}>
              {data?.offsiteEnabled ? `Enabled${data?.offsiteLastSyncAt ? ` • Last sync: ${new Date(data.offsiteLastSyncAt).toLocaleString()}` : ''}` : 'Disabled'}
            </div>
          </div>
          <div className="md:col-span-2">
            <div className="text-[#969696]">Encryption</div>
            {data?.encryptionEnabled ? (
              <div className="text-[#cccccc]">
                Enabled {data?.encryptionProvider ? `(${data.encryptionProvider})` : ''}. Keep keys managed securely; do not store secrets in source control.
              </div>
            ) : (
              <div className="text-[#969696]">
                Disabled. To enable, set BACKUP_ENCRYPTION_ENABLED=true and configure provider/keys in backend environment.
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};

export default BackupOverview;

