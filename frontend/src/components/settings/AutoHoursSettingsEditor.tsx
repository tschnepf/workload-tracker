import React from 'react';
import Button from '@/components/ui/Button';
import { autoHoursSettingsApi, departmentsApi, deliverablePhaseMappingApi, type AutoHoursRoleSetting } from '@/services/api';
import { showToast } from '@/lib/toastBus';
import { useUtilizationScheme } from '@/hooks/useUtilizationScheme';
import { defaultUtilizationScheme, resolveUtilizationLevel, utilizationLevelToClasses } from '@/util/utilization';

type Dept = { id?: number; name: string };

const AutoHoursSettingsEditor: React.FC = () => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const gridRef = React.useRef<HTMLDivElement | null>(null);
  const FALLBACK_MAX_WEEKS_COUNT = 18;
  const [maxWeeksCount, setMaxWeeksCount] = React.useState<number>(FALLBACK_MAX_WEEKS_COUNT);
  const weeks = React.useMemo(() => Array.from({ length: maxWeeksCount }, (_, idx) => String(maxWeeksCount - 1 - idx)), [maxWeeksCount]);
  const [departments, setDepartments] = React.useState<Dept[]>([]);
  const [departmentsLoading, setDepartmentsLoading] = React.useState<boolean>(false);
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

  React.useEffect(() => {
    const values = phaseOptions.map(opt => opt.value);
    if (values.length && !values.includes(selectedPhase)) {
      setSelectedPhase(values[0]);
    }
  }, [phaseOptions, selectedPhase]);

  const rowOrder = React.useMemo(() => rows.map(row => String(row.roleId)), [rows]);
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

  const getCellClasses = React.useCallback((value: number, isSelected: boolean) => {
    const clamped = Math.min(100, Math.max(0, Number(value) || 0));
    const fullCapacityHours = scheme.full_capacity_hours ?? 36;
    const hoursEquivalent = (clamped / 100) * fullCapacityHours;
    const level = resolveUtilizationLevel({ hours: hoursEquivalent, scheme });
    const colorClasses = utilizationLevelToClasses(level);
    const selectionClasses = isSelected ? 'ring-1 ring-[var(--primary)] border-[var(--primary)]' : '';
    return `w-full rounded px-2 py-1 text-sm text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield] ${colorClasses} ${selectionClasses}`;
  }, [scheme]);

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
      const target = ev.target as HTMLElement | null;
      const inCell = target?.closest('[data-auto-hours-cell]');
      if (inCell) return;
      if (bulkEditActiveRef.current) finalizeBulkEdit();
      if (selectedCellsRef.current.size > 0) clearSelection();
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [clearSelection, finalizeBulkEdit]);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setDepartmentsLoading(true);
        const list = await departmentsApi.listAll();
        if (!mounted) return;
        setDepartments(list || []);
      } catch (e: any) {
        showToast(e?.message || 'Failed to load departments', 'error');
      } finally {
        if (mounted) setDepartmentsLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

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

  const loadAllSettings = React.useCallback(async (phase?: string) => {
    try {
      setLoading(true);
      setError(null);
      const phaseKey = phase ?? selectedPhase;
      const all: AutoHoursRoleSetting[] = [];
      const failures: string[] = [];
      for (const dept of departments) {
        if (!dept?.id) continue;
        try {
          const response = await autoHoursSettingsApi.list(dept.id, phaseKey);
          if (response?.weekLimits?.maxWeeksCount != null) {
            setMaxWeeksCount(Number(response.weekLimits.maxWeeksCount));
          }
          if (response?.settings?.length) all.push(...response.settings);
        } catch (e: any) {
          failures.push(dept.name);
        }
      }
      all.sort((a, b) => {
        const deptCompare = (a.departmentName || '').localeCompare(b.departmentName || '');
        if (deptCompare !== 0) return deptCompare;
        const sortCompare = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        if (sortCompare !== 0) return sortCompare;
        return (a.roleName || '').localeCompare(b.roleName || '');
      });
      setRows(all);
      setDirty(false);
      clearSelection();
      if (failures.length) {
        setError(`Failed to load auto hours for: ${failures.join(', ')}`);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load auto hours settings');
    } finally {
      setLoading(false);
    }
  }, [clearSelection, departments, selectedPhase]);

  React.useEffect(() => {
    if (departmentsLoading) return;
    if (departments.length === 0) {
      setRows([]);
      clearSelection();
      return;
    }
    void loadAllSettings(selectedPhase);
  }, [clearSelection, departments.length, departmentsLoading, loadAllSettings, selectedPhase]);

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
    try {
      setSaving(true);
      setError(null);
      const byDept = new Map<number, Array<{ roleId: number; percentByWeek: Record<string, number> }>>();
      rows.forEach(row => {
        const deptId = row.departmentId;
        if (!byDept.has(deptId)) byDept.set(deptId, []);
        byDept.get(deptId)!.push({ roleId: row.roleId, percentByWeek: row.percentByWeek || {} });
      });
      const failures: number[] = [];
      const updatedByRole = new Map<number, AutoHoursRoleSetting>();
      for (const [deptId, settings] of byDept.entries()) {
        try {
          const response = await autoHoursSettingsApi.update(deptId, settings, selectedPhase);
          if (response?.weekLimits?.maxWeeksCount != null) {
            setMaxWeeksCount(Number(response.weekLimits.maxWeeksCount));
          }
          (response?.settings || []).forEach((row) => updatedByRole.set(row.roleId, row));
        } catch {
          failures.push(deptId);
        }
      }
      if (updatedByRole.size > 0) {
        setRows(prev => prev.map(row => updatedByRole.get(row.roleId) || row));
      }
      if (failures.length) {
        setError(`Failed to save auto hours for ${failures.length} department(s).`);
      } else {
        setDirty(false);
        showToast('Auto hours settings updated', 'success');
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to save auto hours settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={containerRef}>
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div role="tablist" aria-label="Deliverable phases" className="inline-flex items-center rounded border border-[var(--border)] bg-[var(--card)] overflow-hidden">
            {phaseOptions.map(opt => {
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
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { void loadAllSettings(selectedPhase); }}
              disabled={loading || saving || departments.length === 0}
            >
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={onSave}
              disabled={!dirty || saving || loading || departments.length === 0}
            >
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
        <div className="text-sm text-[var(--muted)]">
          {departmentsLoading ? 'Loading departments…' : `${departments.length} department${departments.length === 1 ? '' : 's'} loaded`}
        </div>
      </div>

      <div className="text-sm text-[var(--muted)] mb-3">
        Set percent of weekly capacity (0-100%) for each week leading up to a deliverable.
      </div>

      {error && <div className="text-sm text-red-400 mb-3">{error}</div>}

      {departmentsLoading ? (
        <div className="text-sm text-[var(--text)]">Loading departments...</div>
      ) : departments.length === 0 ? (
        <div className="text-sm text-[var(--muted)]">No departments available.</div>
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
                  {Array.from({ length: 18 }).map((_, idx) => (
                    <col key={`wk-${idx}`} style={{ width: 45 }} />
                  ))}
                  <col style={{ width: 45 }} />
                </colgroup>
                <thead className="text-[var(--muted)]">
                  <tr className="border-b border-[var(--border)]">
                    <th className="py-2 pr-2 text-left">Role</th>
                    {Array.from({ length: 18 }).map((_, idx) => {
                      const week = 17 - idx;
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
                      {Array.from({ length: 18 }).map((_, idx) => {
                        const week = 17 - idx;
                        const value = row.percentByWeek?.[String(week)] ?? 0;
                        const rowKey = String(row.roleId);
                        const weekKey = String(week);
                        const isSelected = selectedCells.has(cellKey(rowKey, weekKey));
                        return (
                          <td
                            key={week}
                            className={`py-2 px-0 ${isSelected ? 'bg-[var(--surfaceHover)]' : ''}`}
                            data-auto-hours-cell
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
                                className={`${getCellClasses(value, isSelected)} px-1`}
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

export default AutoHoursSettingsEditor;
