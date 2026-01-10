import React, { useCallback, useEffect, useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { projectSettingsApi, type ProjectTypeSetting } from '@/services/projectsSettings';
import { useAuth } from '@/hooks/useAuth';
import { isAdminOrManager } from '@/utils/roleAccess';

type Props = { projectId: number | null };

const ProjectPreDeliverableSettings: React.FC<Props> = ({ projectId }) => {
  const [settings, setSettings] = useState<ProjectTypeSetting[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const auth = useAuth();
  const canSave = isAdminOrManager(auth?.user);

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await projectSettingsApi.get(projectId);
      setSettings(data.settings || []);
      setDirty(false);
    } catch (e: any) {
      setError(e?.message || 'Failed to load pre-deliverable settings');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const updateRow = (idx: number, patch: Partial<ProjectTypeSetting>) => {
    const next = [...settings];
    next[idx] = { ...next[idx], ...patch } as ProjectTypeSetting;
    setSettings(next);
    setDirty(true);
  };

  const save = async () => {
    if (!projectId) return;
    try {
      setSaving(true);
      setError(null);
      const payload = settings.map(s => ({ typeId: s.typeId, isEnabled: s.isEnabled, daysBefore: s.daysBefore }));
      const data = await projectSettingsApi.update(projectId, payload);
      setSettings(data.settings || []);
      setDirty(false);
    } catch (e: any) {
      setError(e?.message || 'Failed to save pre-deliverable settings');
    } finally {
      setSaving(false);
    }
  };

  if (!projectId) return null;

  return (
    <Card className="bg-[#2d2d30] border-[#3e3e42] p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[#cccccc] font-semibold">Pre-Deliverable Settings</div>
          <div className="text-[#969696] text-sm">Override global defaults for this project</div>
        </div>
        <div className="flex items-center gap-2">
          {error && (
            <Button variant="ghost" onClick={load} disabled={loading || saving}>Retry</Button>
          )}
          <Button disabled={!dirty || saving || loading || !canSave} title={!canSave ? 'Only admins may update project pre-deliverable settings' : undefined} onClick={save}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
      {error && <div className="text-red-400 text-sm mb-2">{error}</div>}
      {loading ? (
        <div className="text-[#cccccc]">Loading…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="text-[#cbd5e1]">
              <tr>
                <th className="py-2 pr-4 text-left">Type</th>
                <th className="py-2 pr-4 text-left">Enabled</th>
                <th className="py-2 pr-4 text-left">Days Before</th>
                <th className="py-2 pr-4 text-left">Source</th>
              </tr>
            </thead>
            <tbody className="text-[#e5e7eb]">
              {settings.map((row, idx) => (
                <tr key={row.typeId} className="border-t border-[#3e3e42]">
                  <td className="py-2 pr-4">{row.typeName}</td>
                  <td className="py-2 pr-4">
                    <input
                      type="checkbox"
                      checked={!!row.isEnabled}
                      onChange={e => updateRow(idx, { isEnabled: e.currentTarget.checked })}
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      type="number"
                      min={0}
                      max={60}
                      value={row.daysBefore ?? 0}
                      className="w-24 bg-[#1f1f1f] border border-[#3e3e42] text-[#cccccc] rounded px-2 py-1 text-xs"
                      onChange={e => updateRow(idx, { daysBefore: Math.max(0, Math.min(60, Number(e.currentTarget.value))) })}
                    />
                  </td>
                  <td className="py-2 pr-4 text-[#94a3b8]">{row.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

export default ProjectPreDeliverableSettings;
