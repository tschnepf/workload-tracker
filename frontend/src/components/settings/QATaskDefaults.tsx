import React from 'react';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { qaTaskSettingsApi } from '@/services/api';
import { showToast } from '@/lib/toastBus';

const QATaskDefaults: React.FC = () => {
  const [daysBefore, setDaysBefore] = React.useState<string>('');
  const [loading, setLoading] = React.useState<boolean>(false);
  const [saving, setSaving] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState<boolean>(false);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await qaTaskSettingsApi.get();
      setDaysBefore(String(data.defaultDaysBefore ?? 7));
      setDirty(false);
    } catch (e: any) {
      setError(e?.message || 'Failed to load QA task defaults');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const onSave = async () => {
    const parsed = Number(daysBefore);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 365) {
      setError('Days before must be between 0 and 365.');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const data = await qaTaskSettingsApi.update({ defaultDaysBefore: Math.trunc(parsed) });
      setDaysBefore(String(data.defaultDaysBefore));
      setDirty(false);
      showToast('QA task default updated', 'success');
    } catch (e: any) {
      setError(e?.message || 'Failed to save QA task defaults');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="QA Task Default">
      <div className="text-sm text-[var(--muted)] mb-3">
        Sets the default QA due date offset relative to the deliverable date.
      </div>
      {error && <div className="text-sm text-red-400 mb-2">{error}</div>}
      {loading ? (
        <div className="text-sm text-[var(--text)]">Loading…</div>
      ) : (
        <div className="flex flex-col md:flex-row md:items-end gap-3">
          <div className="flex-1">
            <Input
              label="Days before deliverable"
              type="number"
              min={0}
              max={365}
              value={daysBefore}
              onChange={(e) => {
                setDaysBefore((e.target as HTMLInputElement).value);
                setDirty(true);
              }}
              placeholder="7"
            />
          </div>
          <Button onClick={onSave} disabled={!dirty || saving || loading}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      )}
    </Card>
  );
};

export default QATaskDefaults;
