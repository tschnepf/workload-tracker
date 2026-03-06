import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import SortableList from '@/components/common/SortableList';
import { projectTaskTemplatesApi, departmentsApi, verticalsApi, taskProgressColorsApi } from '@/services/api';
import type { ProjectTaskTemplate, Department, Vertical, TaskProgressColorRange } from '@/types/models';
import { confirmAction } from '@/lib/confirmAction';

type EditableTemplate = ProjectTaskTemplate & {
  _key: string;
  _isNew?: boolean;
};

const scopeOptions: Array<{ value: 'project' | 'deliverable'; label: string }> = [
  { value: 'project', label: 'Project' },
  { value: 'deliverable', label: 'Deliverable' },
];
const completionModeOptions: Array<{ value: 'percent' | 'binary'; label: string }> = [
  { value: 'percent', label: '0-100%' },
  { value: 'binary', label: 'Complete/Incomplete' },
];

const sortColorRanges = (ranges: TaskProgressColorRange[]): TaskProgressColorRange[] =>
  [...ranges].sort((a, b) => (a.minPercent - b.minPercent) || (a.maxPercent - b.maxPercent));

const normalizeColorInputValue = (rawValue: string): string => {
  const value = String(rawValue || '').trim();
  if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)) return '#3B82F6';
  if (value.length === 4) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`.toUpperCase();
  }
  return value.toUpperCase();
};

const DeliverableTaskTemplatesEditor: React.FC = () => {
  const [rows, setRows] = useState<EditableTemplate[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [verticals, setVerticals] = useState<Vertical[]>([]);
  const [updatingVerticalIds, setUpdatingVerticalIds] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [colorRanges, setColorRanges] = useState<TaskProgressColorRange[]>([]);
  const [colorDirty, setColorDirty] = useState(false);
  const [savingColors, setSavingColors] = useState(false);
  const [colorError, setColorError] = useState<string | null>(null);
  const [verticalFilter, setVerticalFilter] = useState<number | null>(null);
  const [departmentFilter, setDepartmentFilter] = useState<number | null>(null);
  const [expandedVerticalIds, setExpandedVerticalIds] = useState<Record<number, boolean>>({});
  const [scopeFilter, setScopeFilter] = useState<'all' | 'project' | 'deliverable'>('all');

  const hasDepartments = departments.length > 0;
  const hasVerticals = verticals.length > 0;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [tplResp, deptList, verticalList, colorSettings] = await Promise.all([
        projectTaskTemplatesApi.list({
          page: 1,
          page_size: 500,
          include_inactive: 1,
          vertical: verticalFilter ?? undefined,
          scope: scopeFilter === 'all' ? undefined : scopeFilter,
        }),
        departmentsApi.listAll({ include_inactive: 1 }),
        verticalsApi.list({ page: 1, page_size: 500, include_inactive: 1 }),
        taskProgressColorsApi.get(),
      ]);
      const templates = tplResp.results || [];
      const fetchedVerticals = verticalList.results || [];
      setDepartments(deptList || []);
      setColorRanges((colorSettings.ranges || []).map((range) => ({
        minPercent: Number(range.minPercent ?? 0),
        maxPercent: Number(range.maxPercent ?? 0),
        colorHex: String(range.colorHex || '#3B82F6'),
        label: String(range.label || ''),
      })));
      setColorDirty(false);
      setColorError(null);
      if (verticalFilter == null) {
        const firstVerticalId = fetchedVerticals.find((v) => v.id != null)?.id ?? null;
        setVerticals(fetchedVerticals);
        setRows([]);
        setDirty(false);
        if (firstVerticalId != null) {
          setVerticalFilter(firstVerticalId);
          setExpandedVerticalIds((prev) => ({ ...prev, [firstVerticalId]: true }));
        }
        return;
      }
      const sortedTemplates = [...templates].sort((a, b) => {
        const aOrder = Number.isFinite(Number(a.sortOrder)) ? Number(a.sortOrder) : Number.MAX_SAFE_INTEGER;
        const bOrder = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : Number.MAX_SAFE_INTEGER;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return (a.name || '').localeCompare(b.name || '');
      });
      const filteredTemplates = departmentFilter == null
        ? sortedTemplates
        : sortedTemplates.filter((template) => Number(template.departmentId) === departmentFilter);
      setRows(filteredTemplates.map((t) => ({ ...t, _key: String(t.id) })));
      setVerticals(fetchedVerticals);
      setDirty(false);
    } catch (e: any) {
      setError(e?.message || 'Failed to load task templates');
    } finally {
      setLoading(false);
    }
  }, [departmentFilter, scopeFilter, verticalFilter]);

  useEffect(() => { load(); }, [load]);
  const canReorderRows = useMemo(
    () => rows.length > 1 && rows.every((row) => row.id != null),
    [rows]
  );
  useEffect(() => {
    if (!canReorderRows && reorderMode) {
      setReorderMode(false);
    }
  }, [canReorderRows, reorderMode]);
  const validateColorRanges = useCallback((ranges: TaskProgressColorRange[]): string | null => {
    if (!ranges.length) return 'At least one color group is required.';
    const normalized = ranges.map((range, idx) => ({
      idx,
      minPercent: Number(range.minPercent),
      maxPercent: Number(range.maxPercent),
      colorHex: String(range.colorHex || '').trim(),
      label: String(range.label || '').trim(),
    }));
    for (const row of normalized) {
      if (!Number.isFinite(row.minPercent) || !Number.isFinite(row.maxPercent)) return 'All range bounds must be numbers.';
      if (row.minPercent < 0 || row.maxPercent > 100) return 'Range bounds must be between 0 and 100.';
      if (row.minPercent > row.maxPercent) return 'Each range min must be less than or equal to max.';
      if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(row.colorHex)) return 'Each range must use a valid hex color.';
    }
    normalized.sort((a, b) => a.minPercent - b.minPercent || a.maxPercent - b.maxPercent);
    let expected = 0;
    for (const row of normalized) {
      if (row.minPercent !== expected) {
        if (row.minPercent < expected) return 'Ranges overlap. Please make ranges non-overlapping.';
        return `Ranges must cover 0-100 continuously. Expected ${expected}% next.`;
      }
      expected = row.maxPercent + 1;
    }
    if (expected !== 101) return 'Ranges must cover 0-100 continuously.';
    return null;
  }, []);

  const updateColorRange = (index: number, patch: Partial<TaskProgressColorRange>) => {
    setColorRanges((prev) => {
      const sorted = sortColorRanges(prev);
      if (!sorted[index]) return prev;
      sorted[index] = { ...sorted[index], ...patch };
      return sortColorRanges(sorted);
    });
    setColorDirty(true);
  };

  const addColorRange = () => {
    setColorError(null);
    setColorRanges((prev) => {
      if (prev.length === 0) {
        setColorDirty(true);
        return [{ minPercent: 0, maxPercent: 100, colorHex: '#3B82F6', label: '0-100%' }];
      }
      const sorted = sortColorRanges(prev);
      let widestIndex = 0;
      let widestSpan = -1;
      sorted.forEach((range, idx) => {
        const span = Number(range.maxPercent) - Number(range.minPercent);
        if (span > widestSpan) {
          widestSpan = span;
          widestIndex = idx;
        }
      });
      if (widestSpan <= 0) {
        setColorError('No range can be split further. Increase a range width before adding a group.');
        return prev;
      }
      const target = sorted[widestIndex]!;
      const mid = Math.floor((Number(target.minPercent) + Number(target.maxPercent)) / 2);
      const first: TaskProgressColorRange = {
        minPercent: Number(target.minPercent),
        maxPercent: mid,
        colorHex: target.colorHex,
        label: `${Number(target.minPercent)}-${mid}%`,
      };
      const second: TaskProgressColorRange = {
        minPercent: mid + 1,
        maxPercent: Number(target.maxPercent),
        colorHex: target.colorHex,
        label: `${mid + 1}-${Number(target.maxPercent)}%`,
      };
      const next = [...sorted];
      next.splice(widestIndex, 1, first, second);
      setColorDirty(true);
      return next;
    });
  };

  const removeColorRange = (index: number) => {
    setColorError(null);
    setColorRanges((prev) => {
      if (prev.length <= 1) {
        setColorError('At least one range is required.');
        return prev;
      }
      const sorted = sortColorRanges(prev);
      const remove = sorted[index];
      if (!remove) return prev;
      const next = [...sorted];
      if (index > 0) {
        const prevRange = { ...next[index - 1]! };
        prevRange.maxPercent = remove.maxPercent;
        prevRange.label = `${prevRange.minPercent}-${prevRange.maxPercent}%`;
        next[index - 1] = prevRange;
      } else if (next[1]) {
        const nextRange = { ...next[1]! };
        nextRange.minPercent = remove.minPercent;
        nextRange.label = `${nextRange.minPercent}-${nextRange.maxPercent}%`;
        next[1] = nextRange;
      }
      next.splice(index, 1);
      setColorDirty(true);
      return next;
    });
  };

  const saveColorRanges = async () => {
    const validationError = validateColorRanges(colorRanges);
    if (validationError) {
      setColorError(validationError);
      return;
    }
    try {
      setSavingColors(true);
      setColorError(null);
      const payloadRanges = [...colorRanges]
        .sort((a, b) => (a.minPercent - b.minPercent) || (a.maxPercent - b.maxPercent))
        .map((range) => ({
          minPercent: Number(range.minPercent),
          maxPercent: Number(range.maxPercent),
          colorHex: String(range.colorHex || '').toUpperCase(),
          label: String(range.label || '').trim() || `${Number(range.minPercent)}-${Number(range.maxPercent)}%`,
        }));
      const saved = await taskProgressColorsApi.update({ ranges: payloadRanges });
      setColorRanges(saved.ranges || []);
      setColorDirty(false);
    } catch (e: any) {
      setColorError(e?.message || 'Failed to save progress colors');
    } finally {
      setSavingColors(false);
    }
  };
  const sortedColorRanges = useMemo(() => sortColorRanges(colorRanges), [colorRanges]);

  const setVerticalTaskTracking = useCallback(async (verticalId: number, nextEnabled: boolean) => {
    const previous = verticals.find((v) => v.id === verticalId)?.taskTrackingEnabled !== false;
    setError(null);
    setUpdatingVerticalIds((prev) => ({ ...prev, [verticalId]: true }));
    setVerticals((prev) => prev.map((v) => (
      v.id === verticalId ? { ...v, taskTrackingEnabled: nextEnabled } : v
    )));
    try {
      await verticalsApi.update(verticalId, { taskTrackingEnabled: nextEnabled });
    } catch (e: any) {
      setVerticals((prev) => prev.map((v) => (
        v.id === verticalId ? { ...v, taskTrackingEnabled: previous } : v
      )));
      setError(e?.message || 'Failed to update vertical task tracking');
    } finally {
      setUpdatingVerticalIds((prev) => ({ ...prev, [verticalId]: false }));
    }
  }, [verticals]);

  const updateRow = (key: string, patch: Partial<ProjectTaskTemplate>) => {
    setRows((prev) =>
      prev.map((row) => (row._key === key ? { ...row, ...patch } : row))
    );
    setDirty(true);
  };

  const addRow = () => {
    if (verticalFilter == null) return;
    if (departmentFilter == null) return;
    const resolvedVerticalId = verticalFilter;
    const resolvedDepartmentId = departmentFilter;
    const next: EditableTemplate = {
      _key: `new-${Date.now()}`,
      _isNew: true,
      verticalId: resolvedVerticalId || 0,
      scope: scopeFilter === 'all' ? 'project' : scopeFilter,
      departmentId: resolvedDepartmentId || 0,
      name: '',
      description: '',
      completionMode: 'percent',
      sortOrder: rows.length + 1,
      isActive: true,
    };
    setRows((prev) => [...prev, next]);
    setDirty(true);
  };

  const removeRow = async (row: EditableTemplate) => {
    if (row.id) {
      const ok = await confirmAction({
        title: 'Delete Template',
        message: 'Delete this task template?',
        confirmLabel: 'Delete',
        tone: 'danger',
      });
      if (!ok) return;
      try {
        await projectTaskTemplatesApi.delete(row.id);
        await load();
      } catch (e: any) {
        setError(e?.message || 'Failed to delete template');
      }
      return;
    }
    setRows((prev) => prev.filter((r) => r._key !== row._key));
    setDirty(true);
  };

  const save = async () => {
    try {
      setSaving(true);
      setError(null);
      const normalizedRows = rows.map((row, index) => ({ ...row, sortOrder: index + 1 }));
      const updates = normalizedRows.map(async (row) => {
        const payload: Partial<ProjectTaskTemplate> = {
          verticalId: row.verticalId,
          scope: row.scope,
          departmentId: row.departmentId,
          name: (row.name || '').trim(),
          description: row.description || '',
          completionMode: (row.completionMode as 'percent' | 'binary') || 'percent',
          sortOrder: row.sortOrder ?? 0,
          isActive: row.isActive ?? true,
        };
        if (!payload.name) {
          throw new Error('Task name is required');
        }
        if (row.id) {
          return projectTaskTemplatesApi.update(row.id, payload);
        }
        return projectTaskTemplatesApi.create(payload as ProjectTaskTemplate);
      });
      await Promise.all(updates);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Failed to save templates');
    } finally {
      setSaving(false);
    }
  };

  const departmentNameById = useMemo(() => {
    const map = new Map<number, string>();
    departments.forEach((dept) => {
      if (dept.id != null) map.set(dept.id, dept.name);
    });
    return map;
  }, [departments]);

  const selectedVertical = useMemo(
    () => verticals.find((v) => v.id === verticalFilter) ?? null,
    [verticals, verticalFilter]
  );
  const selectedDepartment = useMemo(
    () => departments.find((d) => d.id === departmentFilter) ?? null,
    [departments, departmentFilter]
  );
  const sortedDepartments = useMemo(
    () => [...departments]
      .filter((department) => department.vertical != null)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [departments]
  );
  const departmentsByVertical = useMemo(() => {
    const map = new Map<number, Department[]>();
    sortedDepartments.forEach((department) => {
      const verticalId = Number(department.vertical);
      if (!Number.isFinite(verticalId) || verticalId <= 0) return;
      const list = map.get(verticalId) || [];
      list.push(department);
      map.set(verticalId, list);
    });
    return map;
  }, [sortedDepartments]);
  const departmentsForSelectedVertical = useMemo(
    () => (verticalFilter != null ? (departmentsByVertical.get(verticalFilter) || []) : []),
    [departmentsByVertical, verticalFilter]
  );

  useEffect(() => {
    if (verticalFilter == null) {
      setDepartmentFilter(null);
      return;
    }
    setDepartmentFilter((prev) => {
      if (prev != null && departmentsForSelectedVertical.some((department) => department.id === prev)) {
        return prev;
      }
      const firstDepartment = departmentsForSelectedVertical.find((department) => department.id != null)?.id ?? null;
      return firstDepartment;
    });
  }, [departmentsForSelectedVertical, verticalFilter]);

  const sortedVerticals = useMemo(
    () => [...verticals].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [verticals]
  );
  const reorderItems = useMemo(
    () => rows
      .filter((row): row is EditableTemplate & { id: number } => row.id != null)
      .map((row) => ({
        id: row.id,
        label: (
          <div className="min-w-0">
            <div className="text-[var(--text)] truncate">{row.name || '(Untitled Task)'}</div>
            <div className="text-[var(--muted)] text-[11px] truncate">
              {row.scope === 'deliverable' ? 'Deliverable' : 'Project'}
              {' · '}
              {departmentNameById.get(row.departmentId) || `Dept #${row.departmentId}`}
            </div>
          </div>
        ),
      })),
    [rows, departmentNameById]
  );

  const handleReorderRows = useCallback((ids: number[]) => {
    setRows((prev) => {
      const byId = new Map(prev.map((row) => [row.id, row] as const));
      const ordered = ids
        .map((id) => byId.get(id))
        .filter((row): row is EditableTemplate => Boolean(row))
        .map((row, index) => ({ ...row, sortOrder: index + 1 }));
      return ordered;
    });
    setDirty(true);
  }, []);

  return (
    <Card className="bg-[#2d2d30] border-[#3e3e42] p-4">
      <div className="flex gap-4 items-start">
        <aside className="w-56 shrink-0 rounded border border-[#3e3e42] bg-[#252526] p-2">
          <div className="text-[#cccccc] font-semibold text-sm px-2 py-1">Verticals</div>
          <div className="text-[#969696] text-[11px] px-2 pb-2">Select a vertical, then a department to manage templates.</div>
          <div className="space-y-1">
            {sortedVerticals.map((vertical) => {
              const verticalId = vertical.id;
              if (!verticalId) return null;
              const enabled = vertical.taskTrackingEnabled !== false;
              const isSelected = verticalFilter === verticalId;
              const isUpdating = Boolean(updatingVerticalIds[verticalId]);
              const isExpanded = Boolean(expandedVerticalIds[verticalId]);
              const verticalDepartments = departmentsByVertical.get(verticalId) || [];
              return (
                <div
                  key={verticalId}
                  className={`rounded border px-2 py-1.5 ${
                    isSelected
                      ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                      : 'border-[#3e3e42] bg-[#1f1f1f]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center min-w-0 flex-1 gap-1">
                      <button
                        type="button"
                        onClick={() => setExpandedVerticalIds((prev) => ({ ...prev, [verticalId]: !isExpanded }))}
                        className="h-5 w-5 shrink-0 rounded border border-[#3e3e42] text-[#a9acb3] hover:text-white hover:border-[#5a5f68] text-[11px]"
                        aria-label={isExpanded ? `Collapse ${vertical.name}` : `Expand ${vertical.name}`}
                      >
                        {isExpanded ? '▾' : '▸'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setVerticalFilter(verticalId);
                          if (!isExpanded) setExpandedVerticalIds((prev) => ({ ...prev, [verticalId]: true }));
                        }}
                        className="min-w-0 text-left text-xs text-[#d4d4d4] truncate hover:text-white"
                      >
                        {vertical.name}
                      </button>
                    </div>
                    <input
                      type="checkbox"
                      checked={enabled}
                      disabled={loading || saving || isUpdating}
                      onChange={(e) => { void setVerticalTaskTracking(verticalId, e.currentTarget.checked); }}
                      className="h-4 w-4 accent-[var(--primary)]"
                    />
                  </div>
                  <div className={`mt-1 text-[11px] ${enabled ? 'text-emerald-300' : 'text-[#969696]'}`}>
                    {enabled ? 'Enabled' : 'Disabled'}
                  </div>
                  {isExpanded ? (
                    <div className="mt-1.5 pl-4 space-y-1">
                      {verticalDepartments.length === 0 ? (
                        <div className="text-[10px] text-[#7f7f88]">No departments for this vertical.</div>
                      ) : (
                        verticalDepartments.map((department) => {
                          const departmentId = department.id;
                          if (!departmentId) return null;
                          const isDepartmentSelected = isSelected && departmentFilter === departmentId;
                          return (
                            <button
                              key={departmentId}
                              type="button"
                              onClick={() => {
                                setVerticalFilter(verticalId);
                                setDepartmentFilter(departmentId);
                                setExpandedVerticalIds((prev) => ({ ...prev, [verticalId]: true }));
                              }}
                              className={`block w-full text-left text-[11px] rounded px-2 py-1 border ${
                                isDepartmentSelected
                                  ? 'border-[var(--primary)] bg-[var(--primary)]/15 text-[#e5f0ff]'
                                  : 'border-transparent text-[#b9b9c0] hover:border-[#3e3e42] hover:bg-[#252526]'
                              }`}
                            >
                              {department.name}
                            </button>
                          );
                        })
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between mb-3 gap-2">
            <div>
              <div className="text-[#cccccc] font-semibold">Project Task Templates</div>
              <div className="text-[#969696] text-sm">
                {selectedVertical && selectedDepartment
                  ? `Showing templates for ${selectedVertical.name} / ${selectedDepartment.name}`
                  : 'Select a vertical and department to manage templates.'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={scopeFilter}
                onChange={(e) => setScopeFilter(e.currentTarget.value as 'all' | 'project' | 'deliverable')}
                className="bg-[#1f1f1f] border border-[#3e3e42] text-[#cccccc] rounded px-2 py-1 text-xs"
              >
                <option value="all">All Scopes</option>
                <option value="project">Project</option>
                <option value="deliverable">Deliverable</option>
              </select>
              <button
                type="button"
                onClick={() => setReorderMode((v) => !v)}
                disabled={!canReorderRows || saving || loading}
                className={`px-3 py-2 rounded text-sm border ${
                  reorderMode
                    ? 'text-white bg-[var(--primary)] border-[var(--primary)]'
                    : 'text-[var(--muted)] border-[var(--border)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {reorderMode ? 'Done Reordering' : 'Reorder'}
              </button>
              <Button variant="ghost" onClick={addRow} disabled={!hasDepartments || !hasVerticals || loading || saving || verticalFilter == null || departmentFilter == null}>Add Row</Button>
              <Button disabled={!dirty || saving || loading || !hasDepartments || !hasVerticals || verticalFilter == null || departmentFilter == null} onClick={save}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
          {error && <div className="text-red-400 text-sm mb-2">{error}</div>}
          {!hasVerticals && (
            <div className="text-amber-300 text-sm mb-2">Create at least one vertical before adding templates.</div>
          )}
          {!hasDepartments && (
            <div className="text-amber-300 text-sm mb-2">Create at least one department before adding templates.</div>
          )}
          {hasDepartments && selectedVertical && departmentsForSelectedVertical.length === 0 && (
            <div className="text-amber-300 text-sm mb-2">No departments are assigned to {selectedVertical.name}.</div>
          )}
          {hasDepartments && verticalFilter != null && departmentFilter == null && (
            <div className="text-amber-300 text-sm mb-2">Select a department under the chosen vertical to manage templates.</div>
          )}
          {!canReorderRows && rows.length > 0 && (
            <div className="text-[var(--muted)] text-xs mb-2">Save new rows before using drag-and-drop reorder.</div>
          )}
          {loading ? (
            <div className="text-[#cccccc]">Loading…</div>
          ) : reorderMode ? (
            <SortableList
              items={reorderItems}
              onReorder={handleReorderRows}
              disabled={!canReorderRows}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="text-[#cbd5e1]">
                  <tr>
                    <th className="py-1.5 pr-4 text-left">Scope</th>
                    <th className="py-1.5 pr-4 text-left">Completion Type</th>
                    <th className="py-1.5 pr-4 text-left">Task Name</th>
                    <th className="py-1.5 pr-4 text-left">Description</th>
                    <th className="py-1.5 pr-4 text-left">Active</th>
                    <th className="py-1.5 pr-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-[#e5e7eb]">
                  {rows.map((row) => (
                    <tr key={row._key} className="border-t border-[#2a2a2f]">
                      <td className="py-1.5 pr-4">
                        <select
                          value={row.scope}
                          className="h-7 bg-[#1f1f1f] border border-[#3e3e42] text-[#cccccc] rounded px-2 text-xs"
                          onChange={(e) => updateRow(row._key, { scope: e.currentTarget.value as 'project' | 'deliverable' })}
                        >
                          {scopeOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1.5 pr-4">
                        <select
                          value={(row.completionMode as 'percent' | 'binary') || 'percent'}
                          className="h-7 bg-[#1f1f1f] border border-[#3e3e42] text-[#cccccc] rounded px-2 text-xs"
                          onChange={(e) => updateRow(row._key, { completionMode: e.currentTarget.value as 'percent' | 'binary' })}
                        >
                          {completionModeOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1.5 pr-4">
                        <input
                          type="text"
                          value={row.name || ''}
                          className="h-7 w-40 bg-[#1f1f1f] border border-[#3e3e42] text-[#cccccc] rounded px-2 text-xs"
                          onChange={(e) => updateRow(row._key, { name: e.currentTarget.value })}
                        />
                      </td>
                      <td className="py-1.5 pr-4">
                        <input
                          type="text"
                          value={row.description || ''}
                          className="h-7 w-48 bg-[#1f1f1f] border border-[#3e3e42] text-[#cccccc] rounded px-2 text-xs"
                          onChange={(e) => updateRow(row._key, { description: e.currentTarget.value })}
                        />
                      </td>
                      <td className="py-1.5 pr-4">
                        <input
                          type="checkbox"
                          checked={row.isActive !== false}
                          onChange={(e) => updateRow(row._key, { isActive: e.currentTarget.checked })}
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <button
                          type="button"
                          onClick={() => removeRow(row)}
                          className="text-red-300 hover:text-red-200"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 rounded border border-[#3e3e42] bg-[#252526] p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[#cccccc] font-semibold">Task Progress Colors</div>
                <div className="text-[#969696] text-xs">Define global percent ranges and colors used for task progress.</div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={addColorRange} disabled={savingColors || loading}>
                  Add Group
                </Button>
                <Button onClick={saveColorRanges} disabled={!colorDirty || savingColors || loading}>
                  {savingColors ? 'Saving…' : 'Save Colors'}
                </Button>
              </div>
            </div>
            {colorError ? (
              <div className="mt-2 text-xs text-red-300">{colorError}</div>
            ) : (
              <div className="mt-2 text-[11px] text-[#969696]">Ranges must be continuous and fully cover 0% through 100%.</div>
            )}
            <div className="mt-2 rounded border border-[#3e3e42] bg-[#1f1f1f] overflow-x-auto">
              <div className="min-w-[760px]">
                <div className="grid grid-cols-[88px_88px_170px_1fr_auto] gap-2 items-center px-3 py-1 border-b border-[#2a2a2f] text-[11px] text-[#969696]">
                  <div>Min %</div>
                  <div>Max %</div>
                  <div>Color</div>
                  <div>Label</div>
                  <div className="text-right">Action</div>
                </div>
                {sortedColorRanges.map((range, index) => (
                  <div
                    key={`${index}-${range.minPercent}-${range.maxPercent}`}
                    className="grid grid-cols-[88px_88px_170px_1fr_auto] gap-2 items-center px-3 py-1 border-b border-[#2a2a2f] last:border-b-0"
                  >
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={range.minPercent}
                      onChange={(e) => updateColorRange(index, { minPercent: Number(e.currentTarget.value) })}
                      className="h-7 w-full bg-[#171717] border border-[#3e3e42] text-[#e5e7eb] rounded px-2 py-1 text-xs appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                    />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={range.maxPercent}
                      onChange={(e) => updateColorRange(index, { maxPercent: Number(e.currentTarget.value) })}
                      className="h-7 w-full bg-[#171717] border border-[#3e3e42] text-[#e5e7eb] rounded px-2 py-1 text-xs appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={normalizeColorInputValue(range.colorHex)}
                        onChange={(e) => updateColorRange(index, { colorHex: e.currentTarget.value.toUpperCase() })}
                        className="h-7 w-10 shrink-0 rounded border border-[#3e3e42] bg-transparent p-0"
                      />
                      <input
                        type="text"
                        value={range.colorHex}
                        onChange={(e) => updateColorRange(index, { colorHex: e.currentTarget.value })}
                        className="h-7 w-full bg-[#171717] border border-[#3e3e42] text-[#e5e7eb] rounded px-2 py-1 text-xs"
                      />
                    </div>
                    <input
                      type="text"
                      value={range.label || ''}
                      onChange={(e) => updateColorRange(index, { label: e.currentTarget.value })}
                      placeholder={`${range.minPercent}-${range.maxPercent}%`}
                      className="h-7 w-full bg-[#171717] border border-[#3e3e42] text-[#e5e7eb] rounded px-2 py-1 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => removeColorRange(index)}
                      disabled={sortedColorRanges.length <= 1 || savingColors || loading}
                      className="text-xs text-red-300 hover:text-red-200 disabled:opacity-40 disabled:cursor-not-allowed text-right"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default DeliverableTaskTemplatesEditor;
