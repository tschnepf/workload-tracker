import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Loader from '@/components/ui/Loader';
import { showToast } from '@/lib/toastBus';
import { backupApi } from '@/services/api';
import type { BackupAutomationSettings as BackupAutomationSettingsModel } from '@/types/backup';

const queryKeys = {
  backupAutomation: ['backup-automation-settings'] as const,
  backupStatus: ['backup-status'] as const,
};

const WEEKDAY_OPTIONS = [
  { value: 0, label: 'Monday' },
  { value: 1, label: 'Tuesday' },
  { value: 2, label: 'Wednesday' },
  { value: 3, label: 'Thursday' },
  { value: 4, label: 'Friday' },
  { value: 5, label: 'Saturday' },
  { value: 6, label: 'Sunday' },
];

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return '—';
  return parsed.toLocaleString();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function editablePayload(settings: BackupAutomationSettingsModel) {
  return {
    enabled: !!settings.enabled,
    scheduleType: settings.scheduleType,
    scheduleDayOfWeek: Number(settings.scheduleDayOfWeek),
    scheduleDayOfMonth: Number(settings.scheduleDayOfMonth),
    scheduleHour: Number(settings.scheduleHour),
    scheduleMinute: Number(settings.scheduleMinute),
    scheduleTimezone: String(settings.scheduleTimezone || ''),
    backupsDir: String(settings.backupsDir || ''),
    retentionDaily: Number(settings.retentionDaily),
    retentionWeekly: Number(settings.retentionWeekly),
    retentionMonthly: Number(settings.retentionMonthly),
  };
}

const BackupAutomationSettings: React.FC = () => {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.backupAutomation,
    queryFn: backupApi.getBackupAutomationSettings,
  });
  const [form, setForm] = useState<BackupAutomationSettingsModel | null>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const isDirty = useMemo(() => {
    if (!data || !form) return false;
    return JSON.stringify(editablePayload(data)) !== JSON.stringify(editablePayload(form));
  }, [data, form]);

  const saveMutation = useMutation({
    mutationFn: async (payload: BackupAutomationSettingsModel) => backupApi.updateBackupAutomationSettings(editablePayload(payload)),
    onSuccess: (next) => {
      setForm(next);
      qc.setQueryData(queryKeys.backupAutomation, next);
      qc.invalidateQueries({ queryKey: queryKeys.backupStatus });
      showToast('Automatic backup settings saved', 'success');
    },
    onError: (e: any) => {
      showToast(e?.message || 'Failed to save automatic backup settings', 'error');
    },
  });

  const onSave = async () => {
    if (!form) return;
    await saveMutation.mutateAsync(form);
  };

  const onReset = () => {
    if (!data) return;
    setForm(data);
  };

  return (
    <Card title="Automatic Backup Schedule">
      {isLoading ? (
        <div className="py-6">
          <Loader inline message="Loading automatic backup settings..." />
        </div>
      ) : error ? (
        <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-3 rounded">
          {(error as any)?.message || 'Failed to load automatic backup settings'}
        </div>
      ) : !form ? (
        <div className="text-[var(--color-text-secondary)]">No backup schedule settings found.</div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-[var(--color-text-secondary)]">Last Automatic Backup</div>
              <div className="text-[var(--color-text-primary)]">{formatDateTime(form.lastAutomaticBackupAt)}</div>
            </div>
            <div>
              <div className="text-[var(--color-text-secondary)]">Next Scheduled Backup</div>
              <div className="text-[var(--color-text-primary)]">{formatDateTime(form.nextAutomaticBackupAt)}</div>
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
            <input
              type="checkbox"
              checked={!!form.enabled}
              onChange={(e) => setForm((prev) => (prev ? { ...prev, enabled: (e.target as HTMLInputElement).checked } : prev))}
            />
            Enable automatic backups
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Schedule"
              value={form.scheduleType}
              options={[
                { value: 'daily', label: 'Daily' },
                { value: 'weekly', label: 'Weekly' },
                { value: 'monthly', label: 'Monthly' },
              ]}
              onChange={(e) => {
                const value = String((e.target as HTMLSelectElement).value);
                if (value !== 'daily' && value !== 'weekly' && value !== 'monthly') return;
                setForm((prev) => (prev ? { ...prev, scheduleType: value } : prev));
              }}
            />

            {form.scheduleType === 'weekly' ? (
              <Select
                label="Day of Week"
                value={form.scheduleDayOfWeek}
                options={WEEKDAY_OPTIONS}
                onChange={(e) => {
                  const value = clamp(Number((e.target as HTMLSelectElement).value) || 0, 0, 6);
                  setForm((prev) => (prev ? { ...prev, scheduleDayOfWeek: value } : prev));
                }}
              />
            ) : (
              <Input
                type="number"
                label="Day of Month"
                min={1}
                max={31}
                value={form.scheduleDayOfMonth}
                onChange={(e) => {
                  const value = clamp(Number((e.target as HTMLInputElement).value) || 1, 1, 31);
                  setForm((prev) => (prev ? { ...prev, scheduleDayOfMonth: value } : prev));
                }}
                disabled={form.scheduleType !== 'monthly'}
              />
            )}

            <Input
              type="number"
              label="Hour (0-23)"
              min={0}
              max={23}
              value={form.scheduleHour}
              onChange={(e) => {
                const value = clamp(Number((e.target as HTMLInputElement).value) || 0, 0, 23);
                setForm((prev) => (prev ? { ...prev, scheduleHour: value } : prev));
              }}
            />
            <Input
              type="number"
              label="Minute (0-59)"
              min={0}
              max={59}
              value={form.scheduleMinute}
              onChange={(e) => {
                const value = clamp(Number((e.target as HTMLInputElement).value) || 0, 0, 59);
                setForm((prev) => (prev ? { ...prev, scheduleMinute: value } : prev));
              }}
            />

            <Input
              label="Timezone (IANA)"
              placeholder="America/Phoenix"
              value={form.scheduleTimezone}
              onChange={(e) => setForm((prev) => (prev ? { ...prev, scheduleTimezone: String((e.target as HTMLInputElement).value) } : prev))}
            />
            <Input
              label="Backup Location"
              placeholder="/backups"
              value={form.backupsDir}
              onChange={(e) => setForm((prev) => (prev ? { ...prev, backupsDir: String((e.target as HTMLInputElement).value) } : prev))}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              type="number"
              min={1}
              max={365}
              label="Retention: Daily"
              value={form.retentionDaily}
              onChange={(e) => {
                const value = clamp(Number((e.target as HTMLInputElement).value) || 1, 1, 365);
                setForm((prev) => (prev ? { ...prev, retentionDaily: value } : prev));
              }}
            />
            <Input
              type="number"
              min={1}
              max={104}
              label="Retention: Weekly"
              value={form.retentionWeekly}
              onChange={(e) => {
                const value = clamp(Number((e.target as HTMLInputElement).value) || 1, 1, 104);
                setForm((prev) => (prev ? { ...prev, retentionWeekly: value } : prev));
              }}
            />
            <Input
              type="number"
              min={1}
              max={240}
              label="Retention: Monthly"
              value={form.retentionMonthly}
              onChange={(e) => {
                const value = clamp(Number((e.target as HTMLInputElement).value) || 1, 1, 240);
                setForm((prev) => (prev ? { ...prev, retentionMonthly: value } : prev));
              }}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={onSave} disabled={!isDirty || saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving…' : 'Save Schedule'}
            </Button>
            <Button variant="ghost" onClick={onReset} disabled={!isDirty || saveMutation.isPending}>
              Reset
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
};

export default BackupAutomationSettings;
