import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { deliverablePhaseMappingApi } from '@/services/api';
import type { DeliverablePhaseMappingSettings, DeliverablePhaseMappingPhase } from '@/types/models';

const tokensToString = (tokens?: string[]) => (tokens || []).join(', ');
const stringToTokens = (value: string) =>
  value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

type PhaseRow = DeliverablePhaseMappingPhase & { _localId: string; _tokensText: string };
type PhaseMappingState = Omit<DeliverablePhaseMappingSettings, 'phases'> & { phases: PhaseRow[] };

const createLocalId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const normalizeTokensText = (tokens?: string[]) => tokensToString(tokens);

const DeliverablePhaseMappingEditor: React.FC = () => {
  const [settings, setSettings] = useState<PhaseMappingState | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await deliverablePhaseMappingApi.get();
      const phases = (data?.phases || [])
        .slice()
        .sort((a, b) => {
          const av = a.sortOrder ?? 0;
          const bv = b.sortOrder ?? 0;
          return av - bv;
        })
        .map((phase) => ({
          ...phase,
          _localId: createLocalId(),
          _tokensText: normalizeTokensText(phase.descriptionTokens),
        }));
      setSettings({ ...data, phases } as PhaseMappingState);
      setDirty(false);
    } catch (e: any) {
      setError(e?.message || 'Failed to load phase mapping');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateField = <K extends keyof PhaseMappingState>(field: K, value: PhaseMappingState[K]) => {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
    setDirty(true);
  };

  const updatePhaseField = (index: number, field: keyof DeliverablePhaseMappingPhase, value: any) => {
    if (!settings) return;
    const phases = settings.phases.slice();
    const current = phases[index] || {
      key: '',
      label: '',
      _localId: createLocalId(),
      _tokensText: '',
    };
    phases[index] = { ...current, [field]: value };
    setSettings({ ...settings, phases });
    setDirty(true);
  };

  const removePhase = (index: number) => {
    if (!settings) return;
    const phases = settings.phases.slice();
    phases.splice(index, 1);
    setSettings({ ...settings, phases });
    setDirty(true);
  };

  const addPhase = () => {
    if (!settings) return;
    const phases = settings.phases.slice();
    phases.push({
      key: '',
      label: '',
      descriptionTokens: [],
      rangeMin: null,
      rangeMax: null,
      sortOrder: phases.length,
      _localId: createLocalId(),
      _tokensText: '',
    });
    setSettings({ ...settings, phases });
    setDirty(true);
  };

  const save = async () => {
    if (!settings) return;
    try {
      setSaving(true);
      setError(null);
      const payload = {
        ...settings,
        phases: (settings.phases || []).map(({ _localId, _tokensText, ...phase }, idx) => ({
          ...phase,
          descriptionTokens: stringToTokens(_tokensText ?? tokensToString(phase.descriptionTokens)),
          sortOrder: idx,
        })),
      };
      const data = await deliverablePhaseMappingApi.update(payload);
      const phases = (data?.phases || [])
        .slice()
        .sort((a, b) => {
          const av = a.sortOrder ?? 0;
          const bv = b.sortOrder ?? 0;
          return av - bv;
        })
        .map((phase) => ({
          ...phase,
          _localId: createLocalId(),
          _tokensText: normalizeTokensText(phase.descriptionTokens),
        }));
      setSettings({ ...data, phases } as PhaseMappingState);
      setDirty(false);
    } catch (e: any) {
      setError(e?.message || 'Failed to save phase mapping');
    } finally {
      setSaving(false);
    }
  };

  const rows = useMemo(() => settings?.phases || [], [settings]);

  return (
    <Card className="bg-[#2d2d30] border-[#3e3e42] p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[#cccccc] font-semibold">Phase Mapping Rules</div>
          <div className="text-[#969696] text-sm">Controls deliverable phase classification for analytics and tasks</div>
        </div>
        <div className="flex items-center gap-2">
          {error && (
            <Button variant="ghost" onClick={load} disabled={loading || saving}>Retry</Button>
          )}
          <Button variant="ghost" onClick={addPhase} disabled={loading || saving}>
            + Add Phase
          </Button>
          <Button disabled={!dirty || saving || loading} onClick={save}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
      {error && <div className="text-red-400 text-sm mb-2">{error}</div>}
      {loading || !settings ? (
        <div className="text-[#cccccc]">Loading…</div>
      ) : (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-[#cccccc]">
            <input
              type="checkbox"
              checked={!!settings.useDescriptionMatch}
              onChange={(e) => updateField('useDescriptionMatch', e.currentTarget.checked)}
            />
            Match description tokens before percentage ranges
          </label>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="text-[#cbd5e1]">
                <tr>
                  <th className="py-2 pr-4 text-left">Key</th>
                  <th className="py-2 pr-4 text-left">Label</th>
                  <th className="py-2 pr-4 text-left">Description Tokens</th>
                  <th className="py-2 pr-4 text-left">Min %</th>
                  <th className="py-2 pr-4 text-left">Max % / Exact</th>
                  <th className="py-2 pr-4 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="text-[#e5e7eb]">
                {rows.map((row, index) => (
                  <tr key={row._localId} className="border-t border-[#3e3e42]">
                    <td className="py-2 pr-4">
                      <input
                        type="text"
                        value={row.key || ''}
                        className="w-24 bg-[#1f1f1f] border border-[#3e3e42] text-[#cccccc] rounded px-2 py-1 text-xs"
                        onChange={(e) => updatePhaseField(index, 'key', e.currentTarget.value)}
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <input
                        type="text"
                        value={row.label || ''}
                        className="w-24 bg-[#1f1f1f] border border-[#3e3e42] text-[#cccccc] rounded px-2 py-1 text-xs"
                        onChange={(e) => updatePhaseField(index, 'label', e.currentTarget.value)}
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <input
                        type="text"
                        value={row._tokensText}
                        className="w-64 bg-[#1f1f1f] border border-[#3e3e42] text-[#cccccc] rounded px-2 py-1 text-xs"
                        onChange={(e) => {
                          const value = e.currentTarget.value;
                          const phases = settings?.phases.slice() || [];
                          const current = phases[index];
                          if (!current) return;
                          phases[index] = {
                            ...current,
                            _tokensText: value,
                            descriptionTokens: stringToTokens(value),
                          };
                          setSettings({ ...(settings as PhaseMappingState), phases });
                          setDirty(true);
                        }}
                        onBlur={() => {
                          const phases = settings?.phases.slice() || [];
                          const current = phases[index];
                          if (!current) return;
                          const normalized = normalizeTokensText(current.descriptionTokens);
                          phases[index] = { ...current, _tokensText: normalized };
                          setSettings({ ...(settings as PhaseMappingState), phases });
                        }}
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={row.rangeMin ?? ''}
                        className="w-20 bg-[#1f1f1f] border border-[#3e3e42] text-[#cccccc] rounded px-2 py-1 text-xs"
                        onChange={(e) => {
                          const v = e.currentTarget.value.trim();
                          updatePhaseField(index, 'rangeMin', v === '' ? null : Number(v));
                        }}
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={row.rangeMax ?? ''}
                        className="w-20 bg-[#1f1f1f] border border-[#3e3e42] text-[#cccccc] rounded px-2 py-1 text-xs"
                        onChange={(e) => {
                          const v = e.currentTarget.value.trim();
                          updatePhaseField(index, 'rangeMax', v === '' ? null : Number(v));
                        }}
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <button
                        type="button"
                        className="text-xs text-red-400 hover:text-red-300"
                        onClick={() => removePhase(index)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
};

export default DeliverablePhaseMappingEditor;
