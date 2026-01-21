import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { deliverablePhaseMappingApi } from '@/services/api';
import type { DeliverablePhaseMappingSettings } from '@/types/models';

const tokensToString = (tokens?: string[]) => (tokens || []).join(', ');
const stringToTokens = (value: string) =>
  value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

const DeliverablePhaseMappingEditor: React.FC = () => {
  const [settings, setSettings] = useState<DeliverablePhaseMappingSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await deliverablePhaseMappingApi.get();
      setSettings(data);
      setDirty(false);
    } catch (e: any) {
      setError(e?.message || 'Failed to load phase mapping');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateField = <K extends keyof DeliverablePhaseMappingSettings>(field: K, value: DeliverablePhaseMappingSettings[K]) => {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
    setDirty(true);
  };

  const save = async () => {
    if (!settings) return;
    try {
      setSaving(true);
      setError(null);
      const data = await deliverablePhaseMappingApi.update(settings);
      setSettings(data);
      setDirty(false);
    } catch (e: any) {
      setError(e?.message || 'Failed to save phase mapping');
    } finally {
      setSaving(false);
    }
  };

  const rows = useMemo(() => {
    if (!settings) return [];
    return [
      {
        label: 'SD',
        tokens: settings.descSdTokens,
        min: settings.rangeSdMin,
        max: settings.rangeSdMax,
        tokenField: 'descSdTokens' as const,
        minField: 'rangeSdMin' as const,
        maxField: 'rangeSdMax' as const,
      },
      {
        label: 'DD',
        tokens: settings.descDdTokens,
        min: settings.rangeDdMin,
        max: settings.rangeDdMax,
        tokenField: 'descDdTokens' as const,
        minField: 'rangeDdMin' as const,
        maxField: 'rangeDdMax' as const,
      },
      {
        label: 'IFP',
        tokens: settings.descIfpTokens,
        min: settings.rangeIfpMin,
        max: settings.rangeIfpMax,
        tokenField: 'descIfpTokens' as const,
        minField: 'rangeIfpMin' as const,
        maxField: 'rangeIfpMax' as const,
      },
      {
        label: 'IFC',
        tokens: settings.descIfcTokens,
        exact: settings.rangeIfcExact,
        tokenField: 'descIfcTokens' as const,
        exactField: 'rangeIfcExact' as const,
      },
    ];
  }, [settings]);

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
                  <th className="py-2 pr-4 text-left">Phase</th>
                  <th className="py-2 pr-4 text-left">Description Tokens</th>
                  <th className="py-2 pr-4 text-left">Min %</th>
                  <th className="py-2 pr-4 text-left">Max % / Exact</th>
                </tr>
              </thead>
              <tbody className="text-[#e5e7eb]">
                {rows.map((row) => (
                  <tr key={row.label} className="border-t border-[#3e3e42]">
                    <td className="py-2 pr-4 font-semibold">{row.label}</td>
                    <td className="py-2 pr-4">
                      <input
                        type="text"
                        value={tokensToString(row.tokens)}
                        className="w-64 bg-[#1f1f1f] border border-[#3e3e42] text-[#cccccc] rounded px-2 py-1 text-xs"
                        onChange={(e) =>
                          updateField(row.tokenField, stringToTokens(e.currentTarget.value))
                        }
                      />
                    </td>
                    {'min' in row ? (
                      <>
                        <td className="py-2 pr-4">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={row.min ?? 0}
                            className="w-20 bg-[#1f1f1f] border border-[#3e3e42] text-[#cccccc] rounded px-2 py-1 text-xs"
                            onChange={(e) => updateField(row.minField, Number(e.currentTarget.value))}
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={row.max ?? 0}
                            className="w-20 bg-[#1f1f1f] border border-[#3e3e42] text-[#cccccc] rounded px-2 py-1 text-xs"
                            onChange={(e) => updateField(row.maxField, Number(e.currentTarget.value))}
                          />
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 pr-4 text-[#94a3b8]">—</td>
                        <td className="py-2 pr-4">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={row.exact ?? 100}
                            className="w-20 bg-[#1f1f1f] border border-[#3e3e42] text-[#cccccc] rounded px-2 py-1 text-xs"
                            onChange={(e) => updateField(row.exactField, Number(e.currentTarget.value))}
                          />
                        </td>
                      </>
                    )}
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
