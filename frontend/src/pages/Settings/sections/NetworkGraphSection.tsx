import React from 'react';
import SettingsSectionFrame from '@/pages/Settings/components/SettingsSectionFrame';
import { useSettingsData } from '../SettingsDataContext';
import { networkGraphSettingsApi, type NetworkGraphSettings } from '@/services/api';
import { isAdminUser, isAdminOrManager } from '@/utils/roleAccess';
import Button from '@/components/ui/Button';

export const NETWORK_GRAPH_SECTION_ID = 'network-graph-settings';

const numberInputClass = 'w-full rounded bg-[var(--surface)] border border-[var(--border)] px-2 py-1 text-sm';
const checkboxClass = 'h-4 w-4 rounded border-[var(--border)] bg-[var(--surface)]';

const NetworkGraphSection: React.FC = () => {
  const { auth } = useSettingsData();
  const canAccess = isAdminOrManager(auth.user);
  const isAdmin = isAdminUser(auth.user);

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<NetworkGraphSettings | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await networkGraphSettingsApi.get();
      setForm({
        ...data,
        omittedProjectIds: data.omittedProjectIds || [],
        omittedProjects: data.omittedProjects || [],
      });
    } catch (e: any) {
      setError(e?.message || 'Failed to load network graph settings');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!canAccess) return;
    void load();
  }, [canAccess, load]);

  const setField = <K extends keyof NetworkGraphSettings>(key: K, value: NetworkGraphSettings[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const onSave = async () => {
    if (!form || !isAdmin) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await networkGraphSettingsApi.update(form);
      setForm(saved);
      setSavedAt(new Date().toISOString());
    } catch (e: any) {
      setError(e?.message || 'Failed to save network graph settings');
    } finally {
      setSaving(false);
    }
  };

  if (!canAccess) return null;

  return (
    <SettingsSectionFrame
      id={NETWORK_GRAPH_SECTION_ID}
      title="Network Graph Analytics"
      description="Set default scoring/thresholds for coworker and client relationships, plus weekly snapshot scheduler settings. Project/client exclusions are managed in Settings > General."
      className="mt-6"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading || saving}>Refresh</Button>
          <Button variant="primary" size="sm" onClick={onSave} disabled={!isAdmin || loading || saving || !form}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      }
    >
      {loading ? <div className="text-sm text-[var(--muted)]">Loading network graph settings...</div> : null}
      {error ? <div className="text-sm text-red-400 mb-3">{error}</div> : null}
      {!isAdmin ? <div className="text-xs text-[var(--muted)] mb-3">Read-only for managers. Admin role required to edit.</div> : null}
      {savedAt ? <div className="text-xs text-emerald-400 mb-3">Saved at {new Date(savedAt).toLocaleString()}</div> : null}

      {form ? (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text)] mb-2">Graph Defaults</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="text-sm">
                <span className="block text-[var(--muted)] mb-1">Default window (months)</span>
                <input className={numberInputClass} type="number" min={1} max={120} value={form.defaultWindowMonths} disabled={!isAdmin} onChange={(e) => setField('defaultWindowMonths', Math.max(1, Math.min(120, Number(e.target.value || 24))))} />
              </label>
              <label className="text-sm">
                <span className="block text-[var(--muted)] mb-1">Default max edges</span>
                <input className={numberInputClass} type="number" min={100} max={10000} value={form.maxEdgesDefault} disabled={!isAdmin} onChange={(e) => setField('maxEdgesDefault', Math.max(100, Math.min(10000, Number(e.target.value || 4000))))} />
              </label>
              <label className="text-sm flex items-center gap-2 mt-6">
                <input className={checkboxClass} type="checkbox" checked={form.includeInactiveDefault} disabled={!isAdmin} onChange={(e) => setField('includeInactiveDefault', e.target.checked)} />
                <span>Include inactive by default</span>
              </label>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-[var(--text)] mb-2">Coworker Scoring</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="text-sm">
                <span className="block text-[var(--muted)] mb-1">Project weight</span>
                <input className={numberInputClass} type="number" step="0.1" value={form.coworkerProjectWeight} disabled={!isAdmin} onChange={(e) => setField('coworkerProjectWeight', Number(e.target.value || 0))} />
              </label>
              <label className="text-sm">
                <span className="block text-[var(--muted)] mb-1">Week weight</span>
                <input className={numberInputClass} type="number" step="0.1" value={form.coworkerWeekWeight} disabled={!isAdmin} onChange={(e) => setField('coworkerWeekWeight', Number(e.target.value || 0))} />
              </label>
              <label className="text-sm">
                <span className="block text-[var(--muted)] mb-1">Default min score</span>
                <input className={numberInputClass} type="number" step="0.1" value={form.coworkerMinScore} disabled={!isAdmin} onChange={(e) => setField('coworkerMinScore', Number(e.target.value || 0))} />
              </label>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-[var(--text)] mb-2">Client Scoring</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="text-sm">
                <span className="block text-[var(--muted)] mb-1">Project weight</span>
                <input className={numberInputClass} type="number" step="0.1" value={form.clientProjectWeight} disabled={!isAdmin} onChange={(e) => setField('clientProjectWeight', Number(e.target.value || 0))} />
              </label>
              <label className="text-sm">
                <span className="block text-[var(--muted)] mb-1">Week weight</span>
                <input className={numberInputClass} type="number" step="0.1" value={form.clientWeekWeight} disabled={!isAdmin} onChange={(e) => setField('clientWeekWeight', Number(e.target.value || 0))} />
              </label>
              <label className="text-sm">
                <span className="block text-[var(--muted)] mb-1">Default min score</span>
                <input className={numberInputClass} type="number" step="0.1" value={form.clientMinScore} disabled={!isAdmin} onChange={(e) => setField('clientMinScore', Number(e.target.value || 0))} />
              </label>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-[var(--text)] mb-2">Weekly Snapshot Scheduler</h3>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <label className="text-sm flex items-center gap-2 mt-6">
                <input className={checkboxClass} type="checkbox" checked={form.snapshotSchedulerEnabled} disabled={!isAdmin} onChange={(e) => setField('snapshotSchedulerEnabled', e.target.checked)} />
                <span>Enabled</span>
              </label>
              <label className="text-sm">
                <span className="block text-[var(--muted)] mb-1">Weekday (0=Mon,6=Sun)</span>
                <input className={numberInputClass} type="number" min={0} max={6} value={form.snapshotSchedulerDay} disabled={!isAdmin} onChange={(e) => setField('snapshotSchedulerDay', Math.max(0, Math.min(6, Number(e.target.value || 6))))} />
              </label>
              <label className="text-sm">
                <span className="block text-[var(--muted)] mb-1">Hour (0-23)</span>
                <input className={numberInputClass} type="number" min={0} max={23} value={form.snapshotSchedulerHour} disabled={!isAdmin} onChange={(e) => setField('snapshotSchedulerHour', Math.max(0, Math.min(23, Number(e.target.value || 23))))} />
              </label>
              <label className="text-sm">
                <span className="block text-[var(--muted)] mb-1">Minute (0-59)</span>
                <input className={numberInputClass} type="number" min={0} max={59} value={form.snapshotSchedulerMinute} disabled={!isAdmin} onChange={(e) => setField('snapshotSchedulerMinute', Math.max(0, Math.min(59, Number(e.target.value || 55))))} />
              </label>
              <label className="text-sm">
                <span className="block text-[var(--muted)] mb-1">Timezone</span>
                <input className={numberInputClass} type="text" value={form.snapshotSchedulerTimezone} disabled={!isAdmin} onChange={(e) => setField('snapshotSchedulerTimezone', e.target.value)} />
              </label>
            </div>
            <div className="text-xs text-[var(--muted)] mt-2">
              Last snapshot week: {form.lastSnapshotWeekStart || 'Never'}
            </div>
          </div>
        </div>
      ) : null}
    </SettingsSectionFrame>
  );
};

export default NetworkGraphSection;
