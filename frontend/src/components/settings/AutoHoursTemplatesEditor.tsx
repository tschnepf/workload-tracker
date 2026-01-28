import React from 'react';
import Button from '@/components/ui/Button';
import { autoHoursTemplatesApi, deliverablePhaseMappingApi, type AutoHoursRoleSetting } from '@/services/api';
import { showToast } from '@/lib/toastBus';
import { useUtilizationScheme } from '@/hooks/useUtilizationScheme';
import { defaultUtilizationScheme, resolveUtilizationLevel, utilizationLevelToClasses } from '@/util/utilization';
import type { AutoHoursTemplate } from '@/types/models';

const AutoHoursTemplatesEditor: React.FC = () => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const gridRef = React.useRef<HTMLDivElement | null>(null);
  const weeks = React.useMemo(() => Array.from({ length: 9 }, (_, idx) => String(8 - idx)), []);
  const [templates, setTemplates] = React.useState<AutoHoursTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = React.useState<boolean>(false);
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<number | null>(null);
  const [newTemplateName, setNewTemplateName] = React.useState<string>('');
  const [rows, setRows] = React.useState<AutoHoursRoleSetting[]>([]);
  const rowsRef = React.useRef<AutoHoursRoleSetting[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [saving, setSaving] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState<boolean>(false);
  const [selectedPhase, setSelectedPhase] = React.useState<string>('sd');
  const [phaseOptions, setPhaseOptions] = React.useState<Array<{ value: string; label: string }>>([
    { value: 'sd', label: 'SD' },
    { value: 'dd', label: 'DD' },
    { value: 'ifp', label: 'IFP' },
    { value: 'ifc', label: 'IFC' },
  ]);
  const { data: schemeData } = useUtilizationScheme({ enabled: true });
  const scheme = React.useMemo(() => {
    const base = schemeData ?? defaultUtilizationScheme;
    return { ...base, mode: 'absolute_hours' as const };
  }, [schemeData]);

  const rowOrder = React.useMemo(() => rows.map(row => String(row.roleId)), [rows]);
  const selectedTemplate = React.useMemo(
    () => templates.find(t => t.id === selectedTemplateId) || null,
    [templates, selectedTemplateId],
  );
  const activePhaseKeys = React.useMemo(() => {
    const available = new Set(phaseOptions.map(opt => opt.value));
    if (!selectedTemplate || !selectedTemplate.phaseKeys || selectedTemplate.phaseKeys.length === 0) {
      return phaseOptions.map(opt => opt.value);
    }
    const filtered = selectedTemplate.phaseKeys.filter(key => available.has(key));
    return filtered.length ? filtered : phaseOptions.map(opt => opt.value);
  }, [phaseOptions, selectedTemplate]);
  const rowIndexMap = React.useMemo(() => {
    const map = new Map<string, number>();
    rowOrder.forEach((rk, idx) => map.set(rk, idx));
    return map;
  }, [rowOrder]);
  const weekIndexMap = React.useMemo(() => {
    const map = new Map<string, number>();
    weeks.forEach((wk, idx) => map.set(wk, idx));
    return map;
  }, [weeks]);

  const groupedRows = React.useMemo(() => {
    const groups: Array<{ departmentId: number; departmentName: string; rows: AutoHoursRoleSetting[] }> = [];
    let current: { departmentId: number; departmentName: string; rows: AutoHoursRoleSetting[] } | null = null;
    rows.forEach((row) => {
      if (!current || current.departmentId !== row.departmentId) {
        current = {
          departmentId: row.departmentId,
          departmentName: row.departmentName || 'Unknown Department',
          rows: [],
        };
        groups.push(current);
      }
      current.rows.push(row);
    });
    return groups;
  }, [rows]);

  const [selectedCells, setSelectedCells] = React.useState<Set<string>>(new Set());
  const selectedCellsRef = React.useRef<Set<string>>(new Set());
  const anchorRef = React.useRef<{ rowIndex: number; weekIndex: number } | null>(null);
  const dragStartRef = React.useRef<{ rowIndex: number; weekIndex: number } | null>(null);
  const draggingRef = React.useRef(false);
  const dragAddRef = React.useRef(false);
  const dragBaseSelectionRef = React.useRef<Set<string>>(new Set());
  const bulkEditActiveRef = React.useRef(false);
  const bulkEditValueRef = React.useRef('');
  const bulkEditSnapshotRef = React.useRef<Map<string, number>>(new Map());

  React.useEffect(() => {
    selectedCellsRef.current = selectedCells;
  }, [selectedCells]);

  React.useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  React.useEffect(() => {
    const onUp = () => { draggingRef.current = false; };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, []);

  const cellKey = React.useCallback((rowKey: string, weekKey: string) => `${rowKey}:${weekKey}`, []);

  const buildRangeSelection = React.useCallback((start: { rowIndex: number; weekIndex: number }, end: { rowIndex: number; weekIndex: number }) => {
    const next = new Set<string>();
    const rowLo = Math.min(start.rowIndex, end.rowIndex);
    const rowHi = Math.max(start.rowIndex, end.rowIndex);
    const weekLo = Math.min(start.weekIndex, end.weekIndex);
    const weekHi = Math.max(start.weekIndex, end.weekIndex);
    for (let r = rowLo; r <= rowHi; r++) {
      const rowKey = rowOrder[r];
      if (!rowKey) continue;
      for (let w = weekLo; w <= weekHi; w++) {
        const weekKey = weeks[w];
        if (!weekKey) continue;
        next.add(cellKey(rowKey, weekKey));
      }
    }
    return next;
  }, [cellKey, rowOrder, weeks]);

  const mergeSelection = React.useCallback((base: Set<string>, add: Set<string>) => {
    const next = new Set(base);
    add.forEach(k => next.add(k));
    return next;
  }, []);

  const buildCellsByRow = React.useCallback((cells: Set<string>) => {
    const map = new Map<string, string[]>();
    cells.forEach((key) => {
      const [rk, wk] = key.split(':');
      if (!rk || !wk) return;
      const list = map.get(rk) || [];
      list.push(wk);
      map.set(rk, list);
    });
    return map;
  }, []);

  const applyValueToSelection = React.useCallback((value: number) => {
    const cells = selectedCellsRef.current;
    if (cells.size === 0) return;
    const clamped = Math.min(100, Math.max(0, value));
    const byRow = buildCellsByRow(cells);
    setRows(prev => prev.map(row => {
      const keys = byRow.get(String(row.roleId));
      if (!keys) return row;
      const next = { ...(row.percentByWeek || {}) };
      keys.forEach(k => { next[k] = clamped; });
      return { ...row, percentByWeek: next };
    }));
    setDirty(true);
  }, [buildCellsByRow]);

  const snapshotSelection = React.useCallback(() => {
    const cells = selectedCellsRef.current;
    const byRow = buildCellsByRow(cells);
    const snapshot = new Map<string, number>();
    rowsRef.current.forEach(row => {
      const keys = byRow.get(String(row.roleId));
      if (!keys) return;
      keys.forEach(k => {
        snapshot.set(cellKey(String(row.roleId), k), row.percentByWeek?.[k] ?? 0);
      });
    });
    bulkEditSnapshotRef.current = snapshot;
  }, [buildCellsByRow, cellKey]);

  const restoreSnapshot = React.useCallback(() => {
    const snapshot = bulkEditSnapshotRef.current;
    if (!snapshot || snapshot.size === 0) return;
    const byRow = new Map<string, Record<string, number>>();
    snapshot.forEach((value, key) => {
      const [rk, wk] = key.split(':');
      if (!rk || !wk) return;
      const entry = byRow.get(rk) || {};
      entry[wk] = value;
      byRow.set(rk, entry);
    });
    setRows(prev => prev.map(row => {
      const entry = byRow.get(String(row.roleId));
      if (!entry) return row;
      const next = { ...(row.percentByWeek || {}) };
      Object.entries(entry).forEach(([wk, val]) => { next[wk] = val; });
      return { ...row, percentByWeek: next };
    }));
  }, []);

  const finalizeBulkEdit = React.useCallback(() => {
    if (!bulkEditActiveRef.current) return;
    const valueStr = bulkEditValueRef.current.trim();
    if (valueStr === '') {
      applyValueToSelection(0);
    } else {
      const parsed = Number(valueStr);
      if (Number.isFinite(parsed)) applyValueToSelection(parsed);
    }
    bulkEditActiveRef.current = false;
    bulkEditValueRef.current = '';
    bulkEditSnapshotRef.current = new Map();
  }, [applyValueToSelection]);

  const cancelBulkEdit = React.useCallback(() => {
    if (!bulkEditActiveRef.current) return;
    restoreSnapshot();
    bulkEditActiveRef.current = false;
    bulkEditValueRef.current = '';
    bulkEditSnapshotRef.current = new Map();
  }, [restoreSnapshot]);

  const clearSelection = React.useCallback(() => {
    setSelectedCells(new Set());
    anchorRef.current = null;
    bulkEditActiveRef.current = false;
    bulkEditValueRef.current = '';
    bulkEditSnapshotRef.current = new Map();
  }, []);

  const handleCellMouseDown = React.useCallback((rowKey: string, weekKey: string, ev: React.MouseEvent) => {
    if (bulkEditActiveRef.current) {
      finalizeBulkEdit();
    }
    const rowIndex = rowIndexMap.get(rowKey);
    const weekIndex = weekIndexMap.get(weekKey);
    if (rowIndex == null || weekIndex == null) return;
    const isCtrl = ev.ctrlKey || ev.metaKey;
    const isShift = ev.shiftKey;

    if (isShift && anchorRef.current) {
      const range = buildRangeSelection(anchorRef.current, { rowIndex, weekIndex });
      const next = isCtrl ? mergeSelection(selectedCellsRef.current, range) : range;
      setSelectedCells(next);
      anchorRef.current = { rowIndex, weekIndex };
      return;
    }

    const key = cellKey(rowKey, weekKey);
    const isAlreadySelected = selectedCellsRef.current.has(key);
    const hasMultiSelection = selectedCellsRef.current.size > 1;
    anchorRef.current = { rowIndex, weekIndex };
    dragStartRef.current = { rowIndex, weekIndex };
    draggingRef.current = true;
    dragAddRef.current = isCtrl;
    dragBaseSelectionRef.current = isCtrl ? new Set(selectedCellsRef.current) : new Set();

    if (isCtrl) {
      setSelectedCells(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      return;
    }
    if (isAlreadySelected && hasMultiSelection) {
      return;
    }
    setSelectedCells(new Set([key]));
  }, [buildRangeSelection, cellKey, finalizeBulkEdit, mergeSelection, rowIndexMap, weekIndexMap]);

  const handleCellMouseEnter = React.useCallback((rowKey: string, weekKey: string) => {
    if (!draggingRef.current || !dragStartRef.current) return;
    const rowIndex = rowIndexMap.get(rowKey);
    const weekIndex = weekIndexMap.get(weekKey);
    if (rowIndex == null || weekIndex == null) return;
    const range = buildRangeSelection(dragStartRef.current, { rowIndex, weekIndex });
    if (dragAddRef.current) {
      setSelectedCells(mergeSelection(dragBaseSelectionRef.current, range));
    } else {
      setSelectedCells(range);
    }
  }, [buildRangeSelection, mergeSelection, rowIndexMap, weekIndexMap]);

  const handleCellClick = React.useCallback((rowKey: string, weekKey: string, ev: React.MouseEvent) => {
    const rowIndex = rowIndexMap.get(rowKey);
    const weekIndex = weekIndexMap.get(weekKey);
    if (rowIndex == null || weekIndex == null) return;
    const isCtrl = ev.ctrlKey || ev.metaKey;
    const isShift = ev.shiftKey;
    if (isShift || isCtrl) return;
    const key = cellKey(rowKey, weekKey);
    const isAlreadySelected = selectedCellsRef.current.has(key);
    if (!isAlreadySelected || selectedCellsRef.current.size <= 1) {
      setSelectedCells(new Set([key]));
    }
    anchorRef.current = { rowIndex, weekIndex };
  }, [cellKey, rowIndexMap, weekIndexMap]);

  React.useEffect(() => {
    if (selectedCells.size === 0) {
      bulkEditActiveRef.current = false;
      bulkEditValueRef.current = '';
      bulkEditSnapshotRef.current = new Map();
    }
  }, [selectedCells.size]);

  React.useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (selectedCellsRef.current.size === 0) return;
      const target = ev.target as HTMLElement | null;
      const isEditable = !!target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        (target as any).isContentEditable
      );
      if (isEditable) return;
      if (ev.key === 'Escape') {
        ev.preventDefault();
        cancelBulkEdit();
        return;
      }
      if (ev.key === 'Enter') {
        ev.preventDefault();
        finalizeBulkEdit();
        return;
      }
      const isDigit = /^[0-9]$/.test(ev.key);
      const isDot = ev.key === '.';
      const isBackspace = ev.key === 'Backspace';
      const isDelete = ev.key === 'Delete';
      if (!isDigit && !isDot && !isBackspace && !isDelete) return;

      ev.preventDefault();
      if (!bulkEditActiveRef.current) {
        bulkEditActiveRef.current = true;
        bulkEditValueRef.current = '';
        snapshotSelection();
      }

      if (isDelete) {
        bulkEditValueRef.current = '';
      } else if (isBackspace) {
        bulkEditValueRef.current = bulkEditValueRef.current.slice(0, -1);
      } else {
        bulkEditValueRef.current += ev.key;
      }

      const parsed = Number(bulkEditValueRef.current);
      if (Number.isFinite(parsed)) {
        applyValueToSelection(parsed);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [applyValueToSelection, cancelBulkEdit, finalizeBulkEdit, snapshotSelection]);

  React.useEffect(() => {
    const onDown = (ev: MouseEvent) => {
      const target = ev.target as Node | null;
      const inGrid = target && gridRef.current?.contains(target);
      if (inGrid) return;
      if (bulkEditActiveRef.current) finalizeBulkEdit();
      if (selectedCellsRef.current.size > 0) clearSelection();
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [clearSelection, finalizeBulkEdit]);

  const getCellClasses = React.useCallback((value: number, isSelected: boolean) => {
    const clamped = Math.min(100, Math.max(0, Number(value) || 0));
    const hoursEquivalent = (clamped / 100) * 40;
    const level = resolveUtilizationLevel({ hours: hoursEquivalent, scheme });
    const colorClasses = utilizationLevelToClasses(level);
    const selectionClasses = isSelected ? 'ring-1 ring-[var(--primary)] border-[var(--primary)]' : '';
    return `w-full rounded px-1 py-1 text-sm text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield] ${colorClasses} ${selectionClasses}`;
  }, [scheme]);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setTemplatesLoading(true);
        const list = await autoHoursTemplatesApi.list();
        if (!mounted) return;
        setTemplates(list || []);
        if (selectedTemplateId == null && list && list.length) {
          setSelectedTemplateId(list[0]?.id ?? null);
        }
      } catch (e: any) {
        showToast(e?.message || 'Failed to load templates', 'error');
      } finally {
        if (mounted) setTemplatesLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [selectedTemplateId]);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const mapping = await deliverablePhaseMappingApi.get();
        if (!mounted || !mapping) return;
        const opts = (mapping.phases || []).map((phase) => ({
          value: phase.key,
          label: phase.label || phase.key,
        }));
        if (opts.length) setPhaseOptions(opts);
      } catch {
        // fallback to defaults if mapping fetch fails
      }
    })();
    return () => { mounted = false; };
  }, []);

  const loadTemplateSettings = React.useCallback(async (templateId: number, phase: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await autoHoursTemplatesApi.listSettings(templateId, phase);
      setRows(data || []);
      setDirty(false);
      clearSelection();
    } catch (e: any) {
      setError(e?.message || 'Failed to load auto hours template settings');
    } finally {
      setLoading(false);
    }
  }, [clearSelection]);

  React.useEffect(() => {
    if (selectedTemplateId == null) {
      setRows([]);
      clearSelection();
      return;
    }
    const nextPhase = activePhaseKeys.includes(selectedPhase)
      ? selectedPhase
      : activePhaseKeys[0];
    if (nextPhase && nextPhase !== selectedPhase) {
      setSelectedPhase(nextPhase);
      return;
    }
    if (nextPhase) {
      void loadTemplateSettings(selectedTemplateId, nextPhase);
    }
  }, [activePhaseKeys, clearSelection, loadTemplateSettings, selectedPhase, selectedTemplateId]);

  const updateRowPercent = (roleId: number, week: number, value: string) => {
    const parsed = Number(value);
    const nextValue = Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 0;
    const rowKey = String(roleId);
    const weekKey = String(week);
    const keys = Array.from(selectedCellsRef.current);
    const applyToSelection = keys.length > 1 && selectedCellsRef.current.has(cellKey(rowKey, weekKey));
    if (applyToSelection) {
      const cellsByRow = new Map<string, string[]>();
      keys.forEach(key => {
        const [rk, wk] = key.split(':');
        if (!rk || !wk) return;
        const list = cellsByRow.get(rk) || [];
        list.push(wk);
        cellsByRow.set(rk, list);
      });
      setRows(prev => prev.map(row => {
        const keys = cellsByRow.get(String(row.roleId));
        if (!keys) return row;
        const next = { ...(row.percentByWeek || {}) };
        keys.forEach(k => { next[k] = nextValue; });
        return { ...row, percentByWeek: next };
      }));
    } else {
      setRows(prev => prev.map(row => (
        row.roleId === roleId
          ? { ...row, percentByWeek: { ...(row.percentByWeek || {}), [String(week)]: nextValue } }
          : row
      )));
    }
    setDirty(true);
  };

  const onSave = async () => {
    if (selectedTemplateId == null) return;
    try {
      setSaving(true);
      setError(null);
      const payload = rows.map(row => ({
        roleId: row.roleId,
        percentByWeek: row.percentByWeek || {},
      }));
      const data = await autoHoursTemplatesApi.updateSettings(selectedTemplateId, payload, selectedPhase);
      setRows(data || []);
      setDirty(false);
      showToast('Template settings updated', 'success');
    } catch (e: any) {
      setError(e?.message || 'Failed to save template settings');
    } finally {
      setSaving(false);
    }
  };

  const toggleTemplatePhase = async (phaseKey: string) => {
    if (selectedTemplateId == null) return;
    const current = new Set(activePhaseKeys);
    if (current.has(phaseKey)) {
      current.delete(phaseKey);
    } else {
      current.add(phaseKey);
    }
    const next = phaseOptions.map(opt => opt.value).filter(key => current.has(key));
    if (next.length === 0) {
      showToast('At least one phase is required', 'error');
      return;
    }
    try {
      const updated = await autoHoursTemplatesApi.update(selectedTemplateId, { phaseKeys: next });
      setTemplates(prev => prev.map(t => (t.id === selectedTemplateId ? updated : t)));
      if (!next.includes(selectedPhase)) {
        setSelectedPhase(next[0]);
      }
    } catch (e: any) {
      showToast(e?.message || 'Failed to update template phases', 'error');
    }
  };

  const handleCreateTemplate = async () => {
    const name = newTemplateName.trim();
    if (!name) return;
    try {
      const created = await autoHoursTemplatesApi.create({ name });
      setTemplates(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedTemplateId(created.id);
      setNewTemplateName('');
      showToast('Template created', 'success');
    } catch (e: any) {
      showToast(e?.message || 'Failed to create template', 'error');
    }
  };

  const handleDeleteTemplate = async () => {
    if (selectedTemplateId == null) return;
    const template = templates.find(t => t.id === selectedTemplateId);
    const name = template?.name || 'this template';
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
    try {
      await autoHoursTemplatesApi.delete(selectedTemplateId);
      const next = templates.filter(t => t.id !== selectedTemplateId);
      setTemplates(next);
      setSelectedTemplateId(next[0]?.id ?? null);
      showToast('Template deleted', 'success');
    } catch (e: any) {
      showToast(e?.message || 'Failed to delete template', 'error');
    }
  };

  return (
    <div ref={containerRef}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-[var(--muted)]">Template</label>
            <select
              className="min-w-[200px] bg-[var(--card)] border border-[var(--border)] text-[var(--text)] rounded px-2 py-1 min-h-[32px] focus:border-[var(--primary)]"
              value={selectedTemplateId ?? ''}
              disabled={templatesLoading || templates.length === 0}
              onChange={(e) => setSelectedTemplateId(e.target.value ? Number(e.target.value) : null)}
            >
              {templates.map(t => (<option key={t.id} value={t.id}>{t.name}</option>))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.currentTarget.value)}
              placeholder="New template name"
              className="min-w-[200px] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded px-2 py-1 text-sm focus:border-[var(--primary)]"
            />
            <Button variant="ghost" size="sm" onClick={handleCreateTemplate} disabled={!newTemplateName.trim()}>
              Create
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDeleteTemplate} disabled={selectedTemplateId == null}>
              Delete
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-sm text-[var(--muted)] cursor-help"
              title="Enable which deliverable phases this template applies to. Disabled phases fall back to the global defaults."
            >
              Select Phases
            </span>
            <div className="flex items-center rounded border border-[var(--border)] overflow-hidden">
              {phaseOptions.map(opt => {
                const isActive = activePhaseKeys.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`px-2 py-1 text-xs transition-colors border-r border-[var(--border)] last:border-r-0 ${
                      isActive
                        ? 'bg-[var(--surfaceHover)] text-[var(--text)]'
                        : 'text-[var(--muted)] hover:text-[var(--text)]'
                    }`}
                    onClick={() => toggleTemplatePhase(opt.value)}
                    disabled={selectedTemplateId == null}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { if (selectedTemplateId != null) void loadTemplateSettings(selectedTemplateId, selectedPhase); }}
            disabled={loading || saving || selectedTemplateId == null}
          >
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={onSave}
            disabled={!dirty || saving || loading || selectedTemplateId == null}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <div role="tablist" aria-label="Template phases" className="inline-flex items-center rounded border border-[var(--border)] bg-[var(--card)] overflow-hidden">
          {phaseOptions.filter(opt => activePhaseKeys.includes(opt.value)).map(opt => {
            const isActive = selectedPhase === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`px-3 py-1 text-sm transition-colors border-r border-[var(--border)] last:border-r-0 ${
                  isActive
                    ? 'bg-[var(--surfaceHover)] text-[var(--text)]'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
                onClick={() => setSelectedPhase(opt.value)}
                disabled={loading || saving}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="text-sm text-[var(--muted)] mb-3">
        Set percent of weekly capacity (0-100%) for each week leading up to a deliverable (8 weeks out to the deliverable week).
      </div>

      {error && <div className="text-sm text-red-400 mb-3">{error}</div>}

      {templatesLoading ? (
        <div className="text-sm text-[var(--text)]">Loading templates...</div>
      ) : templates.length === 0 ? (
        <div className="text-sm text-[var(--muted)]">No templates available. Create one to get started.</div>
      ) : loading ? (
        <div className="text-sm text-[var(--text)]">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-[var(--muted)]">No roles found.</div>
      ) : (
        <div ref={gridRef} className="overflow-x-auto space-y-6">
          {groupedRows.map((group) => (
            <div key={group.departmentId} className="min-w-full">
              <div className="text-sm font-semibold text-[var(--text)] mb-2">
                {group.departmentName}
              </div>
              <table className="w-max text-sm table-fixed border-collapse">
                <colgroup>
                  <col style={{ width: 160 }} />
                  {Array.from({ length: 9 }).map((_, idx) => (
                    <col key={`wk-${idx}`} style={{ width: 45 }} />
                  ))}
                  <col style={{ width: 45 }} />
                </colgroup>
                <thead className="text-[var(--muted)]">
                  <tr className="border-b border-[var(--border)]">
                    <th className="py-2 pr-2 text-left">Role</th>
                    {Array.from({ length: 9 }).map((_, idx) => {
                      const week = 8 - idx;
                      const label = week === 0 ? '0w' : `${week}w`;
                      return (
                        <th key={week} className="py-2 px-0 text-center whitespace-nowrap">
                          {label}
                        </th>
                      );
                    })}
                    <th className="py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {group.rows.map((row) => (
                    <tr key={row.roleId} className="hover:bg-[var(--surfaceHover)] transition-colors">
                      <td className="py-2 pr-2 text-[var(--text)] truncate">{row.roleName}</td>
                      {Array.from({ length: 9 }).map((_, idx) => {
                        const week = 8 - idx;
                        const value = row.percentByWeek?.[String(week)] ?? 0;
                        const rowKey = String(row.roleId);
                        const weekKey = String(week);
                        const isSelected = selectedCells.has(cellKey(rowKey, weekKey));
                        return (
                          <td
                            key={week}
                            className={`py-2 px-0 ${isSelected ? 'bg-[var(--surfaceHover)]' : ''}`}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleCellMouseDown(rowKey, weekKey, e);
                            }}
                            onMouseEnter={() => handleCellMouseEnter(rowKey, weekKey)}
                            onClick={(e) => handleCellClick(rowKey, weekKey, e)}
                          >
                            <div className="flex items-center">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step="0.25"
                                value={Number.isFinite(value) ? value : 0}
                                className={getCellClasses(value, isSelected)}
                                onChange={(e) => updateRowPercent(row.roleId, week, e.currentTarget.value)}
                                onFocus={(e) => e.currentTarget.select()}
                                onClick={(e) => {
                                  e.currentTarget.focus();
                                  e.currentTarget.select();
                                }}
                                onDragStart={(e) => e.preventDefault()}
                              />
                            </div>
                          </td>
                        );
                      })}
                      <td className="py-2 text-[var(--muted)] text-xs text-center">
                        {row.isActive ? 'Active' : 'Inactive'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AutoHoursTemplatesEditor;
