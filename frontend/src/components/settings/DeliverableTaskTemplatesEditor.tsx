import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { deliverableTaskTemplatesApi, departmentsApi, deliverablePhaseMappingApi } from '@/services/api';
import type { DeliverableTaskTemplate, Department, DeliverableTaskCompletionStatus, DeliverableTaskQaStatus } from '@/types/models';

type EditableTemplate = DeliverableTaskTemplate & {
  _key: string;
  _isNew?: boolean;
};

const completionOptions: DeliverableTaskCompletionStatus[] = ['not_started', 'in_progress', 'complete'];
const qaOptions: DeliverableTaskQaStatus[] = ['not_reviewed', 'in_review', 'approved', 'changes_required'];

const DeliverableTaskTemplatesEditor: React.FC = () => {
  const [rows, setRows] = useState<EditableTemplate[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [phaseOptions, setPhaseOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const hasDepartments = departments.length > 0;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [tplResp, deptList, mapping] = await Promise.all([
        deliverableTaskTemplatesApi.list({ page: 1, page_size: 200 }),
        departmentsApi.listAll(),
        deliverablePhaseMappingApi.get(),
      ]);
      const templates = tplResp.results || [];
      setRows(
        templates.map((t) => ({ ...t, _key: String(t.id) }))
      );
      setDepartments(deptList || []);
      const opts = (mapping?.phases || []).map((p) => ({ value: p.key, label: p.label || p.key }));
      setPhaseOptions(opts);
      setDirty(false);
    } catch (e: any) {
      setError(e?.message || 'Failed to load task templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateRow = (key: string, patch: Partial<DeliverableTaskTemplate>) => {
    setRows((prev) =>
      prev.map((row) => (row._key === key ? { ...row, ...patch } : row))
    );
    setDirty(true);
  };

  const addRow = () => {
    const defaultDeptId = departments[0]?.id ?? 0;
    const defaultPhase = phaseOptions[0]?.value || 'sd';
    const next: EditableTemplate = {
      _key: `new-${Date.now()}`,
      _isNew: true,
      phase: defaultPhase,
      departmentId: defaultDeptId || 0,
      sheetNumber: '',
      sheetName: '',
      scopeDescription: '',
      defaultCompletionStatus: 'not_started',
      defaultQaStatus: 'not_reviewed',
      sortOrder: rows.length + 1,
      isActive: true,
    };
    setRows((prev) => [...prev, next]);
    setDirty(true);
  };

  const removeRow = async (row: EditableTemplate) => {
    if (row.id) {
      const ok = window.confirm('Delete this template?');
      if (!ok) return;
      try {
        await deliverableTaskTemplatesApi.delete(row.id);
        await load();
      } catch (e: any) {
        setError(e?.message || 'Failed to delete template');
      }
    } else {
      setRows((prev) => prev.filter((r) => r._key !== row._key));
      setDirty(true);
    }
  };

  const save = async () => {
    try {
      setSaving(true);
      setError(null);
      const updates = rows.map(async (row) => {
        const payload: Partial<DeliverableTaskTemplate> = {
          phase: row.phase,
          departmentId: row.departmentId,
          sheetNumber: row.sheetNumber || null,
          sheetName: row.sheetName || null,
          scopeDescription: row.scopeDescription || '',
          defaultCompletionStatus: row.defaultCompletionStatus,
          defaultQaStatus: row.defaultQaStatus,
          sortOrder: row.sortOrder ?? 0,
          isActive: row.isActive ?? true,
        };
        if (row.id) {
          return deliverableTaskTemplatesApi.update(row.id, payload);
        }
        return deliverableTaskTemplatesApi.create(payload as DeliverableTaskTemplate);
      });
      await Promise.all(updates);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Failed to save templates');
    } finally {
      setSaving(false);
    }
  };

  const departmentOptions = useMemo(
    () =>
      (departments || []).map((d) => (
        <option key={d.id} value={d.id ?? 0}>
          {d.name}
        </option>
      )),
    [departments]
  );

  return (
    <Card className="bg-[#2d2d30] border-[#3e3e42] p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[#cccccc] font-semibold">Deliverable Task Templates</div>
          <div className="text-[#969696] text-sm">Define default tasks created for SD/DD/IFP/IFC deliverables</div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={addRow} disabled={!hasDepartments || loading || saving}>Add Row</Button>
          <Button disabled={!dirty || saving || loading || !hasDepartments} onClick={save}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
      {error && <div className="text-red-400 text-sm mb-2">{error}</div>}
      {!hasDepartments && (
        <div className="text-amber-300 text-sm mb-2">Create at least one department before adding templates.</div>
      )}
      {loading ? (
        <div className="text-[#cccccc]">Loading…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="text-[#cbd5e1]">
              <tr>
                <th className="py-2 pr-4 text-left">Phase</th>
                <th className="py-2 pr-4 text-left">Department</th>
                <th className="py-2 pr-4 text-left">Sheet #</th>
                <th className="py-2 pr-4 text-left">Sheet Name</th>
                <th className="py-2 pr-4 text-left">Scope</th>
                <th className="py-2 pr-4 text-left">Completion</th>
                <th className="py-2 pr-4 text-left">QA</th>
                <th className="py-2 pr-4 text-left">Active</th>
                <th className="py-2 pr-4 text-left">Sort</th>
                <th className="py-2 pr-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="text-[#e5e7eb]">
              {rows.map((row) => (
                <tr key={row._key} className="border-t border-[#3e3e42]">
                  <td className="py-2 pr-4">
                    <select
                      value={row.phase}
                      className="bg-[#1f1f1f] border border-[#3e3e42] text-[#cccccc] rounded px-2 py-1 text-xs"
                      onChange={(e) => updateRow(row._key, { phase: e.currentTarget.value as any })}
                    >
                      {phaseOptions.length === 0 && (
                        <option value="">No phases</option>
                      )}
                      {!phaseOptions.some((opt) => opt.value === row.phase) && (
                        <option value={row.phase}>{row.phase}</option>
                      )}
                      {phaseOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-4">
                    <select
                      value={row.departmentId}
                      className="bg-[#1f1f1f] border border-[#3e3e42] text-[#cccccc] rounded px-2 py-1 text-xs"
                      onChange={(e) => updateRow(row._key, { departmentId: Number(e.currentTarget.value) })}
                    >
                      {departmentOptions}
                    </select>
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      type="text"
                      value={row.sheetNumber || ''}
                      className="w-24 bg-[#1f1f1f] border border-[#3e3e42] text-[#cccccc] rounded px-2 py-1 text-xs"
                      onChange={(e) => updateRow(row._key, { sheetNumber: e.currentTarget.value })}
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      type="text"
                      value={row.sheetName || ''}
                      className="w-32 bg-[#1f1f1f] border border-[#3e3e42] text-[#cccccc] rounded px-2 py-1 text-xs"
                      onChange={(e) => updateRow(row._key, { sheetName: e.currentTarget.value })}
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      type="text"
                      value={row.scopeDescription || ''}
                      className="w-48 bg-[#1f1f1f] border border-[#3e3e42] text-[#cccccc] rounded px-2 py-1 text-xs"
                      onChange={(e) => updateRow(row._key, { scopeDescription: e.currentTarget.value })}
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <select
                      value={row.defaultCompletionStatus}
                      className="bg-[#1f1f1f] border border-[#3e3e42] text-[#cccccc] rounded px-2 py-1 text-xs"
                      onChange={(e) => updateRow(row._key, { defaultCompletionStatus: e.currentTarget.value as any })}
                    >
                      {completionOptions.map((opt) => (
                        <option key={opt} value={opt}>{opt.replace('_', ' ')}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-4">
                    <select
                      value={row.defaultQaStatus}
                      className="bg-[#1f1f1f] border border-[#3e3e42] text-[#cccccc] rounded px-2 py-1 text-xs"
                      onChange={(e) => updateRow(row._key, { defaultQaStatus: e.currentTarget.value as any })}
                    >
                      {qaOptions.map((opt) => (
                        <option key={opt} value={opt}>{opt.replace('_', ' ')}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      type="checkbox"
                      checked={!!row.isActive}
                      onChange={(e) => updateRow(row._key, { isActive: e.currentTarget.checked })}
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      type="number"
                      value={row.sortOrder ?? 0}
                      className="w-16 bg-[#1f1f1f] border border-[#3e3e42] text-[#cccccc] rounded px-2 py-1 text-xs"
                      onChange={(e) => updateRow(row._key, { sortOrder: Number(e.currentTarget.value) })}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <button
                      type="button"
                      className="text-xs text-red-300 hover:text-red-200"
                      onClick={() => removeRow(row)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-4 text-center text-[#94a3b8] text-sm">
                    No templates defined yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

export default DeliverableTaskTemplatesEditor;
