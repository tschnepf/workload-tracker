import React from 'react';
import Button from '@/components/ui/Button';
import SettingsSectionFrame from '@/pages/Settings/components/SettingsSectionFrame';
import { useSettingsData } from '../SettingsDataContext';
import { isAdminUser } from '@/utils/roleAccess';
import { featureSettingsApi } from '@/services/api';
import { showToast } from '@/lib/toastBus';

export const FEATURES_SECTION_ID = 'features';

const FeaturesSection: React.FC = () => {
  const { auth } = useSettingsData();
  const isAdmin = isAdminUser(auth.user);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [reportingGroupsEnabled, setReportingGroupsEnabled] = React.useState(false);
  const [initialValue, setInitialValue] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const data = await featureSettingsApi.get();
      setReportingGroupsEnabled(Boolean(data.reportingGroupsEnabled));
      setInitialValue(Boolean(data.reportingGroupsEnabled));
    } catch (e: any) {
      setError(e?.message || 'Failed to load feature settings');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!isAdmin) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await featureSettingsApi.update({
        reportingGroupsEnabled,
      });
      const next = Boolean(updated.reportingGroupsEnabled);
      setReportingGroupsEnabled(next);
      setInitialValue(next);
      setSavedAt(new Date().toISOString());
      showToast('Feature settings updated', 'success');
    } catch (e: any) {
      setError(e?.message || 'Failed to save feature settings');
      showToast(e?.message || 'Failed to save feature settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) return null;

  const dirty = reportingGroupsEnabled !== initialValue;

  return (
    <SettingsSectionFrame
      id={FEATURES_SECTION_ID}
      title="Features"
      description="Toggle runtime capabilities without deleting stored configuration data."
      className="mt-6"
      actions={(
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading || saving}>
            Refresh
          </Button>
          <Button variant="primary" size="sm" onClick={save} disabled={!dirty || loading || saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      )}
    >
      {loading ? <div className="text-sm text-[var(--muted)]">Loading feature settings...</div> : null}
      {error ? <div className="text-sm text-red-400 mb-3">{error}</div> : null}
      {savedAt ? <div className="text-xs text-emerald-400 mb-3">Saved at {new Date(savedAt).toLocaleString()}</div> : null}

      <div className="rounded-xl border border-[var(--border)] bg-gradient-to-br from-[var(--surface)] to-[var(--card)] p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-[var(--text)]">Reporting Groups</div>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Enables the interactive Org Chart workspace for draggable reporting groups, manager assignment, and member lanes.
            </p>
            <div className="mt-2 inline-flex items-center rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] tracking-wide uppercase text-[var(--muted)]">
              {reportingGroupsEnabled ? 'Enabled' : 'Disabled'}
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={reportingGroupsEnabled}
            onClick={() => setReportingGroupsEnabled((prev) => !prev)}
            disabled={loading || saving}
            className={`relative h-7 w-14 rounded-full border transition-colors ${
              reportingGroupsEnabled
                ? 'border-emerald-400/70 bg-emerald-500/30'
                : 'border-[var(--border)] bg-[var(--surface)]'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                reportingGroupsEnabled ? 'translate-x-8' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>
    </SettingsSectionFrame>
  );
};

export default FeaturesSection;
