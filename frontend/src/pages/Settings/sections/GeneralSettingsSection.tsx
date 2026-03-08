import React from 'react';
import SettingsSectionFrame from '@/pages/Settings/components/SettingsSectionFrame';
import { useSettingsData } from '../SettingsDataContext';
import {
  projectVisibilitySettingsApi,
  type ProjectVisibilitySettings,
  type ProjectVisibilityScopeConfig,
} from '@/services/api';
import { isAdminUser } from '@/utils/roleAccess';
import Button from '@/components/ui/Button';

export const GENERAL_SETTINGS_SECTION_ID = 'general-settings';

const inputClass =
  'w-full rounded bg-[var(--surface)] border border-[var(--border)] px-2 py-1 text-sm';

function normalizeKeywords(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of raw) {
    const normalized = token.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function parseKeywords(raw: string): string[] {
  return normalizeKeywords(raw.split(','));
}

function toDisplayKeywords(raw: string[]): string {
  return normalizeKeywords(raw).join(', ');
}

function hasScopeKeywords(config: ProjectVisibilityScopeConfig | undefined): boolean {
  if (!config) return false;
  return (config.projectKeywords?.length || 0) > 0 || (config.clientKeywords?.length || 0) > 0;
}

function collectGlobalKeywords(
  settings: ProjectVisibilitySettings,
  selectedScopeKeys: Set<string>,
): { projectKeywords: string[]; clientKeywords: string[] } {
  const project: string[] = [];
  const client: string[] = [];
  for (const scope of settings.scopes || []) {
    if (!selectedScopeKeys.has(scope.key)) continue;
    const config = settings.config?.[scope.key];
    project.push(...(config?.projectKeywords || []));
    client.push(...(config?.clientKeywords || []));
  }
  return {
    projectKeywords: normalizeKeywords(project),
    clientKeywords: normalizeKeywords(client),
  };
}

const GeneralSettingsSection: React.FC = () => {
  const { auth } = useSettingsData();
  const isAdmin = isAdminUser(auth.user);

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);
  const [settings, setSettings] = React.useState<ProjectVisibilitySettings | null>(null);
  const [projectKeywordsInput, setProjectKeywordsInput] = React.useState('');
  const [clientKeywordsInput, setClientKeywordsInput] = React.useState('');
  const [scopeEnabled, setScopeEnabled] = React.useState<Record<string, boolean>>({});
  const [nonUniformLoaded, setNonUniformLoaded] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await projectVisibilitySettingsApi.get();
      setSettings(data);
      const enabledMap: Record<string, boolean> = {};
      const selectedScopeKeys = new Set<string>();
      for (const scope of data.scopes || []) {
        const enabled = hasScopeKeywords(data.config?.[scope.key]);
        enabledMap[scope.key] = enabled;
        if (enabled) selectedScopeKeys.add(scope.key);
      }
      setScopeEnabled(enabledMap);
      const global = collectGlobalKeywords(data, selectedScopeKeys);
      setProjectKeywordsInput(toDisplayKeywords(global.projectKeywords));
      setClientKeywordsInput(toDisplayKeywords(global.clientKeywords));
      const firstSelected = Array.from(selectedScopeKeys)[0];
      const firstConfig = firstSelected ? data.config?.[firstSelected] : undefined;
      const firstProject = normalizeKeywords(firstConfig?.projectKeywords || []);
      const firstClient = normalizeKeywords(firstConfig?.clientKeywords || []);
      setNonUniformLoaded(
        firstProject.join('|') !== global.projectKeywords.join('|')
        || firstClient.join('|') !== global.clientKeywords.join('|'),
      );
    } catch (err: any) {
      setError(err?.message || 'Failed to load general settings');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!isAdmin) return;
    void load();
  }, [isAdmin, load]);

  const setScope = React.useCallback((scopeKey: string, enabled: boolean) => {
    setScopeEnabled((prev) => ({ ...prev, [scopeKey]: enabled }));
  }, []);

  const onSave = React.useCallback(async () => {
    if (!isAdmin || !settings) return;
    setSaving(true);
    setError(null);
    try {
      const projectKeywords = parseKeywords(projectKeywordsInput);
      const clientKeywords = parseKeywords(clientKeywordsInput);
      const nextConfig: Record<string, ProjectVisibilityScopeConfig> = {};
      for (const scope of settings.scopes || []) {
        const enabled = !!scopeEnabled[scope.key];
        nextConfig[scope.key] = {
          projectKeywords: enabled ? projectKeywords : [],
          clientKeywords: enabled ? clientKeywords : [],
        };
      }
      const updated = await projectVisibilitySettingsApi.update({ config: nextConfig });
      setSettings(updated);
      const enabledMap: Record<string, boolean> = {};
      const selectedScopeKeys = new Set<string>();
      for (const scope of updated.scopes || []) {
        const enabled = hasScopeKeywords(updated.config?.[scope.key]);
        enabledMap[scope.key] = enabled;
        if (enabled) selectedScopeKeys.add(scope.key);
      }
      setScopeEnabled(enabledMap);
      const global = collectGlobalKeywords(updated, selectedScopeKeys);
      setProjectKeywordsInput(toDisplayKeywords(global.projectKeywords));
      setClientKeywordsInput(toDisplayKeywords(global.clientKeywords));
      setNonUniformLoaded(false);
      setSavedAt(new Date().toISOString());
    } catch (err: any) {
      setError(err?.message || 'Failed to save general settings');
    } finally {
      setSaving(false);
    }
  }, [clientKeywordsInput, isAdmin, projectKeywordsInput, scopeEnabled, settings]);

  if (!isAdmin) return null;

  const groupedScopes = React.useMemo(() => {
    const groups = new Map<string, Array<{ key: string; label: string }>>();
    for (const scope of settings?.scopes || []) {
      const key = scope.group || 'Other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)?.push({ key: scope.key, label: scope.label });
    }
      return Array.from(groups.entries());
  }, [settings?.scopes]);

  const enabledScopeCount = React.useMemo(
    () => Object.values(scopeEnabled).filter(Boolean).length,
    [scopeEnabled],
  );

  return (
    <SettingsSectionFrame
      id={GENERAL_SETTINGS_SECTION_ID}
      title="General"
      description="Set one shared project/client keyword list, then choose which pages/analytics should apply that omission rule."
      className="mt-6"
      actions={(
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading || saving}>
            Refresh
          </Button>
          <Button variant="primary" size="sm" onClick={() => void onSave()} disabled={loading || saving || !settings}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      )}
    >
      {loading ? <div className="text-sm text-[var(--muted)]">Loading general settings...</div> : null}
      {error ? <div className="text-sm text-red-400 mb-3">{error}</div> : null}
      {savedAt ? <div className="text-xs text-emerald-400 mb-3">Saved at {new Date(savedAt).toLocaleString()}</div> : null}

      {!loading && settings ? (
        <div className="space-y-5">
          <p className="text-xs text-[var(--muted)]">Matching is case-insensitive contains. Use comma-separated values.</p>
          {nonUniformLoaded ? (
            <div className="text-xs text-amber-300">
              Existing scope keyword lists were not uniform. Saving will standardize checked scopes to the shared values below.
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="block text-[var(--muted)] mb-1">Project keywords to hide</span>
              <input
                className={inputClass}
                value={projectKeywordsInput}
                onChange={(event) => setProjectKeywordsInput(event.target.value)}
                placeholder="overhead, internal admin"
              />
            </label>
            <label className="text-sm">
              <span className="block text-[var(--muted)] mb-1">Client keywords to hide</span>
              <input
                className={inputClass}
                value={clientKeywordsInput}
                onChange={(event) => setClientKeywordsInput(event.target.value)}
                placeholder="smc"
              />
            </label>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/35">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
              <div className="text-sm font-medium text-[var(--text)]">Apply shared keywords to</div>
              <div className="text-xs text-[var(--muted)]">{enabledScopeCount} selected</div>
            </div>
            <div className="max-h-[420px] overflow-auto divide-y divide-[var(--border)]/60">
              {groupedScopes.map(([groupName, scopes]) => (
                <div key={groupName} className="p-2">
                  <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{groupName}</div>
                  {scopes.map((scope) => (
                    <label
                      key={scope.key}
                      className="flex items-center justify-between gap-3 px-2 py-2 rounded hover:bg-[var(--surface)]/40 cursor-pointer"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={!!scopeEnabled[scope.key]}
                          onChange={(event) => setScope(scope.key, event.target.checked)}
                        />
                        <span className="text-sm text-[var(--text)] truncate">{scope.label}</span>
                      </span>
                      <span className="text-[11px] text-[var(--muted)] whitespace-nowrap">{scope.key}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </SettingsSectionFrame>
  );
};

export default GeneralSettingsSection;
