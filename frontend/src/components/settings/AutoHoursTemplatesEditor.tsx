import React from 'react';
import Button from '@/components/ui/Button';
import {
  autoHoursSettingsApi,
  autoHoursTemplatesApi,
  deliverablePhaseMappingApi,
  rolesApi,
  type AutoHoursRoleSetting,
} from '@/services/api';
import { showToast } from '@/lib/toastBus';
import { confirmAction } from '@/lib/confirmAction';
import { useUtilizationScheme } from '@/hooks/useUtilizationScheme';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { defaultUtilizationScheme, resolveUtilizationLevel, utilizationLevelToClasses } from '@/util/utilization';
import type { Role as PeopleRole } from '@/types/models';
import type { AutoHoursTemplate, DeliverablePhaseMappingPhase } from '@/types/models';

type TemplateId = number | 'global';

type PhaseColumn = {
  key: string;
  phase: string;
  weekKey: string;
  phaseIndex: number;
  weekIndex: number;
};

type RoleMeta = {
  roleId: number;
  roleName: string;
  departmentId: number;
  departmentName: string;
  isActive: boolean;
  sortOrder: number;
};

const GROUP_STORAGE_PREFIX = 'auto-hours-template-groups:';
const TEMPLATE_PANEL_COLLAPSED_STORAGE_KEY = 'auto-hours-template-panel-collapsed';

const AutoHoursTemplatesEditor: React.FC = () => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const gridRef = React.useRef<HTMLDivElement | null>(null);
  const isMobileLayout = useMediaQuery('(max-width: 1023px)');

  const FALLBACK_MAX_WEEKS_COUNT = 18;
  const FALLBACK_DEFAULT_WEEKS_COUNT = 6;
  const [weeksConfig, setWeeksConfig] = React.useState({ max: FALLBACK_MAX_WEEKS_COUNT, default: FALLBACK_DEFAULT_WEEKS_COUNT });
  const maxWeeksCount = weeksConfig.max;
  const defaultWeeksCount = weeksConfig.default;

  const roleColumnWidth = 380;
  const roleCountColumnWidth = 70;
  const weekColumnWidth = 64;

  const GLOBAL_TEMPLATE_ID: TemplateId = 'global';

  const [templates, setTemplates] = React.useState<AutoHoursTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = React.useState<boolean>(false);
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<TemplateId>(GLOBAL_TEMPLATE_ID);
  const [newTemplateName, setNewTemplateName] = React.useState<string>('');
  const [templateName, setTemplateName] = React.useState<string>('');
  const [templateDescription, setTemplateDescription] = React.useState<string>('');
  const [renaming, setRenaming] = React.useState<boolean>(false);
  const [isEditingTitle, setIsEditingTitle] = React.useState<boolean>(false);
  const [isEditingDescription, setIsEditingDescription] = React.useState<boolean>(false);

  const [allRoles, setAllRoles] = React.useState<AutoHoursRoleSetting[]>([]);
  const [peopleRoles, setPeopleRoles] = React.useState<PeopleRole[]>([]);
  const [activePeopleRoleMenuRowId, setActivePeopleRoleMenuRowId] = React.useState<number | null>(null);

  const [updatingExclusions, setUpdatingExclusions] = React.useState(false);
  const [rowsByPhase, setRowsByPhase] = React.useState<Record<string, AutoHoursRoleSetting[]>>({});
  const rowsByPhaseRef = React.useRef<Record<string, AutoHoursRoleSetting[]>>({});
  const [weeksByPhaseDraft, setWeeksByPhaseDraft] = React.useState<Record<string, number>>({});
  const [loading, setLoading] = React.useState<boolean>(false);
  const [saving, setSaving] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [phaseErrors, setPhaseErrors] = React.useState<Record<string, string | null>>({});
  const [dirtyPhases, setDirtyPhases] = React.useState<Set<string>>(new Set());
  const dirtyPhasesRef = React.useRef<Set<string>>(new Set());

  const [selectedPhase, setSelectedPhase] = React.useState<string>('sd');
  const [inputMode, setInputMode] = React.useState<'percent' | 'hours'>('hours');
  const [phaseOptions, setPhaseOptions] = React.useState<Array<{ value: string; label: string }>>([
    { value: 'sd', label: 'SD' },
    { value: 'dd', label: 'DD' },
    { value: 'ifp', label: 'IFP' },
    { value: 'ifc', label: 'IFC' },
  ]);
  const [phaseMeta, setPhaseMeta] = React.useState<DeliverablePhaseMappingPhase[]>([]);
  const [phaseMetaLoaded, setPhaseMetaLoaded] = React.useState<boolean>(false);

  const [expandedDepartments, setExpandedDepartments] = React.useState<Record<number, boolean>>({});
  const [isTemplatePanelCollapsed, setIsTemplatePanelCollapsed] = React.useState<boolean>(() => {
    try {
      return window.localStorage.getItem(TEMPLATE_PANEL_COLLAPSED_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const { data: schemeData } = useUtilizationScheme({ enabled: true });
  const scheme = React.useMemo(() => {
    const base = schemeData ?? defaultUtilizationScheme;
    return { ...base, mode: 'absolute_hours' as const };
  }, [schemeData]);
  const fullCapacityHours = scheme.full_capacity_hours ?? 36;

  const selectedTemplate = React.useMemo(() => {
    if (selectedTemplateId === GLOBAL_TEMPLATE_ID) return null;
    return templates.find((t) => t.id === selectedTemplateId) || null;
  }, [selectedTemplateId, templates]);

  const activePhaseKeys = React.useMemo(() => {
    const available = new Set(phaseOptions.map((opt) => opt.value));
    if (!selectedTemplate || !selectedTemplate.phaseKeys || selectedTemplate.phaseKeys.length === 0) {
      return phaseOptions.map((opt) => opt.value);
    }
    const filtered = selectedTemplate.phaseKeys.filter((key) => available.has(key));
    return filtered.length ? filtered : phaseOptions.map((opt) => opt.value);
  }, [phaseOptions, selectedTemplate]);

  const templateKey = selectedTemplateId === GLOBAL_TEMPLATE_ID ? GLOBAL_TEMPLATE_ID : String(selectedTemplateId ?? '');

  const clampWeeksCount = React.useCallback(
    (value: number) => {
      if (!Number.isFinite(value)) return maxWeeksCount;
      return Math.min(maxWeeksCount, Math.max(0, Math.round(value)));
    },
    [maxWeeksCount]
  );

  const getWeeksCountForPhase = React.useCallback(
    (phase: string) => {
      const draft = weeksByPhaseDraft[phase];
      if (draft != null) return clampWeeksCount(draft);
      const templateCount = selectedTemplate?.weeksByPhase?.[phase];
      if (templateCount != null) return clampWeeksCount(templateCount);
      return defaultWeeksCount;
    },
    [clampWeeksCount, defaultWeeksCount, selectedTemplate?.weeksByPhase, weeksByPhaseDraft]
  );

  const phaseWeekKeys = React.useMemo(() => {
    const out: Record<string, string[]> = {};
    activePhaseKeys.forEach((phase) => {
      const count = getWeeksCountForPhase(phase);
      const maxWeek = Math.max(0, count - 1);
      out[phase] = Array.from({ length: count }, (_, idx) => String(maxWeek - idx));
    });
    return out;
  }, [activePhaseKeys, getWeeksCountForPhase]);

  const percentPhaseKeys = React.useMemo(() => {
    return new Set(
      (phaseMeta || [])
        .filter((phase) => phase.rangeMin != null || phase.rangeMax != null)
        .map((phase) => phase.key)
    );
  }, [phaseMeta]);

  const totalPercentWeeks = React.useMemo(() => {
    if (!phaseMetaLoaded) return null;
    const keys = activePhaseKeys.filter((key) => percentPhaseKeys.has(key));
    if (keys.length === 0) return 0;
    return keys.reduce((sum, key) => sum + getWeeksCountForPhase(key), 0);
  }, [activePhaseKeys, getWeeksCountForPhase, percentPhaseKeys, phaseMetaLoaded]);
  const totalPercentWeeksLabel = totalPercentWeeks == null ? '-' : totalPercentWeeks;

  const phaseLabelByKey = React.useMemo(() => {
    const map = new Map<string, string>();
    phaseOptions.forEach((phase) => map.set(phase.value, phase.label));
    return map;
  }, [phaseOptions]);

  const roleMetaById = React.useMemo(() => {
    const map = new Map<number, RoleMeta>();
    activePhaseKeys.forEach((phase) => {
      (rowsByPhase[phase] || []).forEach((row) => {
        if (map.has(row.roleId)) return;
        map.set(row.roleId, {
          roleId: row.roleId,
          roleName: row.roleName,
          departmentId: row.departmentId,
          departmentName: row.departmentName || 'Unknown Department',
          isActive: row.isActive,
          sortOrder: row.sortOrder,
        });
      });
    });
    return map;
  }, [activePhaseKeys, rowsByPhase]);

  const groupedRoles = React.useMemo(() => {
    const rows = Array.from(roleMetaById.values()).sort((a, b) => {
      const dept = a.departmentId - b.departmentId;
      if (dept !== 0) return dept;
      const order = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      if (order !== 0) return order;
      return a.roleName.localeCompare(b.roleName);
    });

    const groups: Array<{ departmentId: number; departmentName: string; rows: RoleMeta[] }> = [];
    let current: { departmentId: number; departmentName: string; rows: RoleMeta[] } | null = null;
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
  }, [roleMetaById]);

  const rowOrder = React.useMemo(() => groupedRoles.flatMap((group) => group.rows.map((row) => String(row.roleId))), [groupedRoles]);

  const rowsByPhaseRoleId = React.useMemo(() => {
    const out: Record<string, Map<number, AutoHoursRoleSetting>> = {};
    activePhaseKeys.forEach((phase) => {
      const map = new Map<number, AutoHoursRoleSetting>();
      (rowsByPhase[phase] || []).forEach((row) => map.set(row.roleId, row));
      out[phase] = map;
    });
    return out;
  }, [activePhaseKeys, rowsByPhase]);

  const flatWeekColumns = React.useMemo<PhaseColumn[]>(() => {
    const out: PhaseColumn[] = [];
    activePhaseKeys.forEach((phase, phaseIndex) => {
      const weekKeys = phaseWeekKeys[phase] || [];
      weekKeys.forEach((weekKey, weekIndex) => {
        out.push({
          key: `${phase}:${weekKey}`,
          phase,
          weekKey,
          phaseIndex,
          weekIndex,
        });
      });
    });
    return out;
  }, [activePhaseKeys, phaseWeekKeys]);

  const rowIndexMap = React.useMemo(() => {
    const map = new Map<string, number>();
    rowOrder.forEach((rowKey, idx) => map.set(rowKey, idx));
    return map;
  }, [rowOrder]);

  const columnIndexMap = React.useMemo(() => {
    const map = new Map<string, number>();
    flatWeekColumns.forEach((col, idx) => map.set(col.key, idx));
    return map;
  }, [flatWeekColumns]);

  const allRolesByDepartment = React.useMemo(() => {
    const map = new Map<number, { id: number; name: string }>();
    allRoles.forEach((role) => {
      if (!map.has(role.departmentId)) {
        map.set(role.departmentId, { id: role.departmentId, name: role.departmentName || 'Unknown Department' });
      }
    });
    return map;
  }, [allRoles]);

  const excludedDepartmentIds = selectedTemplate?.excludedDepartmentIds || [];
  const excludedRoleIds = selectedTemplate?.excludedRoleIds || [];

  const excludedDepartments = React.useMemo(() => {
    return excludedDepartmentIds.map((id) => allRolesByDepartment.get(id)).filter(Boolean) as Array<{ id: number; name: string }>;
  }, [allRolesByDepartment, excludedDepartmentIds]);

  const excludedRoles = React.useMemo(() => {
    const map = new Map<number, AutoHoursRoleSetting>();
    allRoles.forEach((role) => map.set(role.roleId, role));
    return excludedRoleIds.map((id) => map.get(id)).filter(Boolean) as AutoHoursRoleSetting[];
  }, [allRoles, excludedRoleIds]);

  const peopleRoleById = React.useMemo(() => {
    const map = new Map<number, PeopleRole>();
    peopleRoles.forEach((role) => map.set(Number(role.id), role));
    return map;
  }, [peopleRoles]);
  const isTemplatePanelCollapsedEffective = !isMobileLayout && isTemplatePanelCollapsed;

  const [selectedCells, setSelectedCells] = React.useState<Set<string>>(new Set());
  const selectedCellsRef = React.useRef<Set<string>>(new Set());
  const [focusedCellKey, setFocusedCellKey] = React.useState<string | null>(null);
  const [editingCellKey, setEditingCellKey] = React.useState<string | null>(null);
  const editingCellKeyRef = React.useRef<string | null>(null);
  const [editingValue, setEditingValue] = React.useState<string>('');
  const copiedMatrixRef = React.useRef<Array<Array<string | null>> | null>(null);

  const anchorRef = React.useRef<{ rowIndex: number; columnIndex: number } | null>(null);
  const dragStartRef = React.useRef<{ rowIndex: number; columnIndex: number } | null>(null);
  const draggingRef = React.useRef(false);
  const dragAddRef = React.useRef(false);
  const dragBaseSelectionRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    rowsByPhaseRef.current = rowsByPhase;
  }, [rowsByPhase]);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(TEMPLATE_PANEL_COLLAPSED_STORAGE_KEY, isTemplatePanelCollapsed ? '1' : '0');
    } catch {
      // ignore persistence failures
    }
  }, [isTemplatePanelCollapsed]);

  React.useEffect(() => {
    selectedCellsRef.current = selectedCells;
  }, [selectedCells]);

  React.useEffect(() => {
    dirtyPhasesRef.current = dirtyPhases;
  }, [dirtyPhases]);

  const cellKey = React.useCallback((phase: string, rowKey: string, weekKey: string) => `${phase}:${rowKey}:${weekKey}`, []);

  const parseCellKey = React.useCallback((key: string) => {
    const [phase, rowKey, weekKey] = key.split(':');
    if (!phase || !rowKey || !weekKey) return null;
    return { phase, rowKey, weekKey };
  }, []);

  const setSelectedCellsState = React.useCallback((next: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    setSelectedCells((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      selectedCellsRef.current = resolved;
      return resolved;
    });
  }, []);

  const clearSelection = React.useCallback(() => {
    setSelectedCellsState(new Set());
    anchorRef.current = null;
    dragStartRef.current = null;
    draggingRef.current = false;
    setFocusedCellKey(null);
    setEditingCellKey(null);
    editingCellKeyRef.current = null;
    setEditingValue('');
  }, [setSelectedCellsState]);

  const mergeSelection = React.useCallback((base: Set<string>, addition: Set<string>) => {
    const next = new Set(base);
    addition.forEach((key) => next.add(key));
    return next;
  }, []);

  const buildRangeSelection = React.useCallback((start: { rowIndex: number; columnIndex: number }, end: { rowIndex: number; columnIndex: number }) => {
    const next = new Set<string>();
    const rowLo = Math.min(start.rowIndex, end.rowIndex);
    const rowHi = Math.max(start.rowIndex, end.rowIndex);
    const colLo = Math.min(start.columnIndex, end.columnIndex);
    const colHi = Math.max(start.columnIndex, end.columnIndex);

    for (let r = rowLo; r <= rowHi; r += 1) {
      const rowKey = rowOrder[r];
      if (!rowKey) continue;
      for (let c = colLo; c <= colHi; c += 1) {
        const col = flatWeekColumns[c];
        if (!col) continue;
        next.add(cellKey(col.phase, rowKey, col.weekKey));
      }
    }
    return next;
  }, [cellKey, flatWeekColumns, rowOrder]);

  const normalizeToPercent = React.useCallback((raw: number) => {
    if (!Number.isFinite(raw)) return 0;
    if (inputMode === 'hours') {
      const pct = (raw / fullCapacityHours) * 100;
      return Math.max(0, Math.min(100, Math.round(pct * 100) / 100));
    }
    return Math.max(0, Math.min(100, Math.round(raw * 100) / 100));
  }, [fullCapacityHours, inputMode]);

  const displayValueFromPercent = React.useCallback((percent: number) => {
    const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
    if (inputMode === 'hours') {
      const hours = (clamped / 100) * fullCapacityHours;
      return Math.round(hours * 100) / 100;
    }
    return Math.round(clamped * 100) / 100;
  }, [fullCapacityHours, inputMode]);

  const markDirtyPhases = React.useCallback((phases: string[]) => {
    setDirtyPhases((prev) => {
      const next = new Set(prev);
      phases.forEach((phase) => next.add(phase));
      return next;
    });
  }, []);

  const setRoleRowByPhase = React.useCallback((phase: string, roleId: number, updater: (row: AutoHoursRoleSetting) => AutoHoursRoleSetting) => {
    setRowsByPhase((prev) => {
      const phaseRows = prev[phase] || [];
      const idx = phaseRows.findIndex((row) => row.roleId === roleId);
      if (idx < 0) {
        const meta = roleMetaById.get(roleId);
        if (!meta) return prev;
        const baseRow: AutoHoursRoleSetting = {
          roleId,
          roleName: meta.roleName,
          departmentId: meta.departmentId,
          departmentName: meta.departmentName,
          isActive: meta.isActive,
          sortOrder: meta.sortOrder,
          percentByWeek: {},
          roleCount: 1,
          peopleRoleIds: [],
          weeksCount: getWeeksCountForPhase(phase),
        };
        const nextRows = [...phaseRows, updater(baseRow)];
        return { ...prev, [phase]: nextRows };
      }

      const nextRows = phaseRows.slice();
      nextRows[idx] = updater(nextRows[idx]);
      return { ...prev, [phase]: nextRows };
    });
  }, [getWeeksCountForPhase, roleMetaById]);

  const applyPercentUpdates = React.useCallback((updates: Array<{ phase: string; roleId: number; weekKey: string; value: number }>) => {
    if (!updates.length) return;

    setRowsByPhase((prev) => {
      const next = { ...prev };
      const byPhaseRole = new Map<string, Array<{ weekKey: string; value: number }>>();

      updates.forEach((update) => {
        const key = `${update.phase}:${update.roleId}`;
        const list = byPhaseRole.get(key) || [];
        list.push({ weekKey: update.weekKey, value: update.value });
        byPhaseRole.set(key, list);
      });

      byPhaseRole.forEach((entries, key) => {
        const [phase, roleIdRaw] = key.split(':');
        const roleId = Number(roleIdRaw);
        const phaseRows = next[phase] || [];
        const rowIndex = phaseRows.findIndex((row) => row.roleId === roleId);
        if (rowIndex < 0) return;

        const row = phaseRows[rowIndex];
        const percentByWeek = { ...(row.percentByWeek || {}) };
        entries.forEach(({ weekKey, value }) => {
          percentByWeek[weekKey] = value;
        });

        const updatedRow = { ...row, percentByWeek };
        const updatedRows = phaseRows.slice();
        updatedRows[rowIndex] = updatedRow;
        next[phase] = updatedRows;
      });

      return next;
    });
  }, []);

  const updateRowPercent = React.useCallback((phase: string, roleId: number, weekKey: string, raw: string) => {
    const parsed = Number(raw);
    const nextValue = normalizeToPercent(parsed);
    const rowKey = String(roleId);
    const key = cellKey(phase, rowKey, weekKey);

    const keys = Array.from(selectedCellsRef.current);
    const applyToSelection = keys.length > 1 && selectedCellsRef.current.has(key);

    if (applyToSelection) {
      const updates: Array<{ phase: string; roleId: number; weekKey: string; value: number }> = [];
      const phasesTouched = new Set<string>();
      keys.forEach((selectedKey) => {
        const parsedKey = parseCellKey(selectedKey);
        if (!parsedKey) return;
        const selectedRoleId = Number(parsedKey.rowKey);
        if (!Number.isFinite(selectedRoleId)) return;
        updates.push({
          phase: parsedKey.phase,
          roleId: selectedRoleId,
          weekKey: parsedKey.weekKey,
          value: nextValue,
        });
        phasesTouched.add(parsedKey.phase);
      });
      applyPercentUpdates(updates);
      markDirtyPhases(Array.from(phasesTouched));
      return;
    }

    setRoleRowByPhase(phase, roleId, (row) => ({
      ...row,
      percentByWeek: { ...(row.percentByWeek || {}), [weekKey]: nextValue },
    }));
    markDirtyPhases([phase]);
  }, [applyPercentUpdates, cellKey, markDirtyPhases, normalizeToPercent, parseCellKey, setRoleRowByPhase]);

  const resolveKeyboardEditCellKey = React.useCallback(() => {
    const selectedKeys = Array.from(selectedCellsRef.current);
    if (!selectedKeys.length) return null;

    const current = editingCellKeyRef.current;
    if (current && selectedCellsRef.current.has(current)) return current;

    if (anchorRef.current) {
      const { rowIndex, columnIndex } = anchorRef.current;
      const rowKey = rowOrder[rowIndex];
      const col = flatWeekColumns[columnIndex];
      if (rowKey && col) {
        const anchoredKey = cellKey(col.phase, rowKey, col.weekKey);
        if (selectedCellsRef.current.has(anchoredKey)) return anchoredKey;
      }
    }

    return selectedKeys[0] || null;
  }, [cellKey, flatWeekColumns, rowOrder]);

  const commitKeyboardEdit = React.useCallback(() => {
    const targetKey = resolveKeyboardEditCellKey();
    if (!targetKey) return;

    const parsedTarget = parseCellKey(targetKey);
    if (!parsedTarget) return;

    const roleId = Number(parsedTarget.rowKey);
    if (!Number.isFinite(roleId)) return;

    const trimmed = editingValue.trim();
    const valueToApply = trimmed === '' || trimmed === '.' || trimmed === '-' || trimmed === '-.' ? '0' : trimmed;
    updateRowPercent(parsedTarget.phase, roleId, parsedTarget.weekKey, valueToApply);
    setEditingCellKey(null);
    editingCellKeyRef.current = null;
    setFocusedCellKey(null);
    setEditingValue('');
  }, [editingValue, parseCellKey, resolveKeyboardEditCellKey, updateRowPercent]);

  const cancelKeyboardEdit = React.useCallback(() => {
    setEditingCellKey(null);
    editingCellKeyRef.current = null;
    setFocusedCellKey(null);
    setEditingValue('');
  }, []);

  const beginKeyboardEdit = React.useCallback((seed: string) => {
    const targetKey = resolveKeyboardEditCellKey();
    if (!targetKey) return;
    editingCellKeyRef.current = targetKey;
    setEditingCellKey(targetKey);
    setFocusedCellKey(targetKey);
    setEditingValue(seed);
  }, [resolveKeyboardEditCellKey]);

  const isEditableEventTarget = React.useCallback((target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return target.isContentEditable || Boolean(target.closest('input, textarea, select'));
  }, []);

  const isGridCellEventTarget = React.useCallback((target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest('[data-auto-hours-cell]'));
  }, []);

  const buildSelectionCopyMatrix = React.useCallback(() => {
    const keys = Array.from(selectedCellsRef.current);
    if (!keys.length) return null;

    type SelectedCellMeta = {
      rowIndex: number;
      columnIndex: number;
      phase: string;
      rowKey: string;
      weekKey: string;
    };

    const selected: SelectedCellMeta[] = [];
    keys.forEach((key) => {
      const parsed = parseCellKey(key);
      if (!parsed) return;
      const rowIndex = rowIndexMap.get(parsed.rowKey);
      const columnIndex = columnIndexMap.get(`${parsed.phase}:${parsed.weekKey}`);
      if (rowIndex == null || columnIndex == null) return;
      selected.push({
        rowIndex,
        columnIndex,
        phase: parsed.phase,
        rowKey: parsed.rowKey,
        weekKey: parsed.weekKey,
      });
    });

    if (!selected.length) return null;

    const rowMin = Math.min(...selected.map((cell) => cell.rowIndex));
    const rowMax = Math.max(...selected.map((cell) => cell.rowIndex));
    const colMin = Math.min(...selected.map((cell) => cell.columnIndex));
    const colMax = Math.max(...selected.map((cell) => cell.columnIndex));

    const matrix: Array<Array<string | null>> = Array.from(
      { length: rowMax - rowMin + 1 },
      () => Array.from({ length: colMax - colMin + 1 }, () => null as string | null),
    );

    selected.forEach((cell) => {
      const roleId = Number(cell.rowKey);
      if (!Number.isFinite(roleId)) return;
      const row = rowsByPhaseRoleId[cell.phase]?.get(roleId);
      const percent = row?.percentByWeek?.[cell.weekKey] ?? 0;
      const display = displayValueFromPercent(percent);
      matrix[cell.rowIndex - rowMin][cell.columnIndex - colMin] = String(display);
    });

    return matrix;
  }, [columnIndexMap, displayValueFromPercent, parseCellKey, rowIndexMap, rowsByPhaseRoleId]);

  const matrixToClipboardText = React.useCallback((matrix: Array<Array<string | null>>) => {
    return matrix.map((row) => row.map((value) => value ?? '').join('\t')).join('\n');
  }, []);

  const parseClipboardTextToMatrix = React.useCallback((text: string | null | undefined) => {
    const normalized = String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (!normalized.trim()) return null;
    const rows = normalized.split('\n');
    return rows.map((row) => row.split('\t').map((value) => value));
  }, []);

  const pasteMatrixAtSelection = React.useCallback((matrix: Array<Array<string | null>>) => {
    if (!matrix.length) return;
    const startKey = resolveKeyboardEditCellKey();
    if (!startKey) return;

    const parsedStart = parseCellKey(startKey);
    if (!parsedStart) return;

    const startRowIndex = rowIndexMap.get(parsedStart.rowKey);
    if (startRowIndex == null) return;

    const targetPhase = parsedStart.phase;
    const targetPhaseWeeks = phaseWeekKeys[targetPhase] || [];
    const startWeekIndex = targetPhaseWeeks.indexOf(parsedStart.weekKey);
    if (startWeekIndex < 0) return;

    const updates: Array<{ phase: string; roleId: number; weekKey: string; value: number }> = [];
    const pastedSelection = new Set<string>();

    matrix.forEach((rowValues, rOffset) => {
      const targetRowIndex = startRowIndex + rOffset;
      const targetRowKey = rowOrder[targetRowIndex];
      if (!targetRowKey) return;
      const targetRoleId = Number(targetRowKey);
      if (!Number.isFinite(targetRoleId)) return;

      rowValues.forEach((rawValue, cOffset) => {
        if (rawValue == null) return;

        const targetWeekIndex = startWeekIndex + cOffset;
        if (targetWeekIndex < 0 || targetWeekIndex >= targetPhaseWeeks.length) return;

        const trimmed = String(rawValue).trim();
        if (!trimmed.length) return;

        const parsedNumber = Number(trimmed);
        if (!Number.isFinite(parsedNumber)) return;

        const weekKey = targetPhaseWeeks[targetWeekIndex];
        updates.push({
          phase: targetPhase,
          roleId: targetRoleId,
          weekKey,
          value: normalizeToPercent(parsedNumber),
        });
        pastedSelection.add(cellKey(targetPhase, targetRowKey, weekKey));
      });
    });

    if (!updates.length) return;

    applyPercentUpdates(updates);
    markDirtyPhases([targetPhase]);
    if (pastedSelection.size > 0) {
      setSelectedCellsState(pastedSelection);
    }
    setEditingCellKey(null);
    editingCellKeyRef.current = null;
    setFocusedCellKey(null);
    setEditingValue('');
  }, [
    applyPercentUpdates,
    cellKey,
    markDirtyPhases,
    normalizeToPercent,
    parseCellKey,
    phaseWeekKeys,
    resolveKeyboardEditCellKey,
    rowIndexMap,
    rowOrder,
    setSelectedCellsState,
  ]);

  const getMappedPeopleRoleIds = React.useCallback((roleId: number): number[] => {
    for (const phase of activePhaseKeys) {
      const row = rowsByPhaseRoleId[phase]?.get(roleId);
      if (row) return Array.from(new Set((row.peopleRoleIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id))));
    }
    return [];
  }, [activePhaseKeys, rowsByPhaseRoleId]);

  const updateRowPeopleRoleIds = React.useCallback((roleId: number, selectedIds: number[]) => {
    const nextIds = Array.from(new Set(selectedIds)).sort((a, b) => a - b);
    setRowsByPhase((prev) => {
      const next = { ...prev };
      activePhaseKeys.forEach((phase) => {
        const phaseRows = next[phase] || [];
        const idx = phaseRows.findIndex((row) => row.roleId === roleId);
        if (idx < 0) return;
        const updatedRows = phaseRows.slice();
        updatedRows[idx] = { ...updatedRows[idx], peopleRoleIds: nextIds };
        next[phase] = updatedRows;
      });
      return next;
    });
    markDirtyPhases(activePhaseKeys);
  }, [activePhaseKeys, markDirtyPhases]);

  const removeRowPeopleRoleId = React.useCallback((roleId: number, peopleRoleId: number) => {
    const nextIds = getMappedPeopleRoleIds(roleId).filter((id) => id !== peopleRoleId);
    updateRowPeopleRoleIds(roleId, nextIds);
  }, [getMappedPeopleRoleIds, updateRowPeopleRoleIds]);

  const addMappedPeopleRole = React.useCallback((roleId: number, peopleRoleId: number) => {
    if (!Number.isFinite(Number(peopleRoleId))) return;
    const mappedIds = getMappedPeopleRoleIds(roleId);
    if (mappedIds.includes(Number(peopleRoleId))) {
      setActivePeopleRoleMenuRowId(null);
      return;
    }
    updateRowPeopleRoleIds(roleId, [...mappedIds, Number(peopleRoleId)]);
    setActivePeopleRoleMenuRowId(null);
  }, [getMappedPeopleRoleIds, updateRowPeopleRoleIds]);

  const adjustRoleCount = React.useCallback((phase: string, roleId: number, delta: number) => {
    setRoleRowByPhase(phase, roleId, (row) => {
      const current = Number.isFinite(row.roleCount) ? Number(row.roleCount) : 1;
      const nextCount = Math.max(0, current + delta);
      return { ...row, roleCount: nextCount };
    });
    markDirtyPhases([phase]);
  }, [markDirtyPhases, setRoleRowByPhase]);

  const handleWeeksCountChange = React.useCallback((phase: string, value: string) => {
    if (value.trim() === '') {
      setWeeksByPhaseDraft((prev) => ({ ...prev, [phase]: 0 }));
      markDirtyPhases([phase]);
      return;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    const nextCount = clampWeeksCount(parsed);
    const current = getWeeksCountForPhase(phase);
    if (nextCount === current) return;
    setWeeksByPhaseDraft((prev) => ({ ...prev, [phase]: nextCount }));
    markDirtyPhases([phase]);
  }, [clampWeeksCount, getWeeksCountForPhase, markDirtyPhases]);

  const getCellClasses = React.useCallback((value: number, isSelected: boolean) => {
    const clamped = Math.min(100, Math.max(0, Number(value) || 0));
    const hoursEquivalent = inputMode === 'hours' ? displayValueFromPercent(clamped) : (clamped / 100) * fullCapacityHours;
    const level = resolveUtilizationLevel({ hours: hoursEquivalent, scheme });
    const colorClasses = utilizationLevelToClasses(level);
    const selectionClasses = isSelected ? 'ring-1 ring-[var(--primary)] border-[var(--primary)]' : '';
    return `w-full rounded px-1 py-1 text-sm text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield] ${colorClasses} ${selectionClasses}`;
  }, [displayValueFromPercent, fullCapacityHours, inputMode, scheme]);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setTemplatesLoading(true);
        const list = await autoHoursTemplatesApi.list();
        if (!mounted) return;
        setTemplates(list || []);
        if (selectedTemplateId == null) {
          setSelectedTemplateId(GLOBAL_TEMPLATE_ID);
        } else if (selectedTemplateId !== GLOBAL_TEMPLATE_ID) {
          const exists = (list || []).some((t) => t.id === selectedTemplateId);
          if (!exists) setSelectedTemplateId(GLOBAL_TEMPLATE_ID);
        }
      } catch (e: any) {
        showToast(e?.message || 'Failed to load templates', 'error');
      } finally {
        if (mounted) setTemplatesLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [GLOBAL_TEMPLATE_ID, selectedTemplateId]);

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
        setPhaseMeta(mapping.phases || []);
        setPhaseMetaLoaded(true);
      } catch {
        // keep defaults
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await rolesApi.listAll({ include_inactive: 1 });
        if (!mounted) return;
        const sorted = [...(list || [])].sort((a, b) => {
          const aSortOrder = Number.isFinite(Number(a.sortOrder)) ? Number(a.sortOrder) : Number.MAX_SAFE_INTEGER;
          const bSortOrder = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : Number.MAX_SAFE_INTEGER;
          if (aSortOrder !== bSortOrder) return aSortOrder - bSortOrder;
          const activeCmp = Number(Boolean(b.isActive)) - Number(Boolean(a.isActive));
          if (activeCmp !== 0) return activeCmp;
          return String(a.name || '').localeCompare(String(b.name || ''));
        });
        setPeopleRoles(sorted);
      } catch {
        // keep editor usable
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    if (selectedTemplateId === GLOBAL_TEMPLATE_ID) {
      setTemplateName('');
      setTemplateDescription('');
      setIsEditingTitle(false);
      setIsEditingDescription(false);
      return;
    }
    setTemplateName(selectedTemplate?.name || '');
    setTemplateDescription(selectedTemplate?.description || '');
    setIsEditingTitle(false);
    setIsEditingDescription(false);
  }, [GLOBAL_TEMPLATE_ID, selectedTemplate, selectedTemplateId]);

  React.useEffect(() => {
    const nextPhase = activePhaseKeys.includes(selectedPhase) ? selectedPhase : activePhaseKeys[0];
    if (nextPhase && nextPhase !== selectedPhase) {
      setSelectedPhase(nextPhase);
    }
  }, [activePhaseKeys, selectedPhase]);

  const loadAllRoles = React.useCallback(async (phase: string) => {
    try {
      const response = await autoHoursSettingsApi.list(undefined, phase);
      setAllRoles(response?.settings || []);
      if (response?.weekLimits) {
        setWeeksConfig((prev) => ({
          max: Number.isFinite(response.weekLimits.maxWeeksCount) ? Number(response.weekLimits.maxWeeksCount) : prev.max,
          default: Number.isFinite(response.weekLimits.defaultWeeksCount) ? Number(response.weekLimits.defaultWeeksCount) : prev.default,
        }));
      }
    } catch {
      // ignore all roles sync failures
    }
  }, []);

  const loadTemplateSettings = React.useCallback(async (templateId: TemplateId, phases: string[]) => {
    if (!phases.length) {
      setRowsByPhase({});
      setWeeksByPhaseDraft({});
      setDirtyPhases(new Set());
      setPhaseErrors({});
      clearSelection();
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setPhaseErrors({});

      const results = await Promise.allSettled(
        phases.map(async (phase) => {
          if (templateId === GLOBAL_TEMPLATE_ID) {
            const response = await autoHoursSettingsApi.list(undefined, phase);
            const rows = response?.settings || [];
            const weeksCountFromData = rows.find((row) => row.weeksCount != null)?.weeksCount;
            return {
              phase,
              rows,
              weeksCount: weeksCountFromData != null ? Number(weeksCountFromData) : undefined,
              weekLimits: response?.weekLimits,
            };
          }

          const rows = await autoHoursTemplatesApi.listSettings(Number(templateId), phase);
          const weeksCountFromData = rows.find((row) => row.weeksCount != null)?.weeksCount;
          return {
            phase,
            rows: rows || [],
            weeksCount: weeksCountFromData != null ? Number(weeksCountFromData) : undefined,
          };
        })
      );

      const nextRowsByPhase: Record<string, AutoHoursRoleSetting[]> = {};
      const nextWeeksByPhaseDraft: Record<string, number> = {};
      const failures: string[] = [];

      results.forEach((result, idx) => {
        const phase = phases[idx];
        if (result.status === 'fulfilled') {
          nextRowsByPhase[phase] = result.value.rows || [];
          if (result.value.weeksCount != null) {
            nextWeeksByPhaseDraft[phase] = clampWeeksCount(result.value.weeksCount);
          }
          if (result.value.weekLimits) {
            setWeeksConfig((prev) => ({
              max: Number.isFinite(result.value.weekLimits.maxWeeksCount) ? Number(result.value.weekLimits.maxWeeksCount) : prev.max,
              default: Number.isFinite(result.value.weekLimits.defaultWeeksCount) ? Number(result.value.weekLimits.defaultWeeksCount) : prev.default,
            }));
          }
        } else {
          failures.push(phase);
        }
      });

      setRowsByPhase(nextRowsByPhase);
      setWeeksByPhaseDraft(nextWeeksByPhaseDraft);
      setDirtyPhases(new Set());
      clearSelection();

      if (failures.length > 0) {
        setError(`Failed to load project template settings for phase(s): ${failures.join(', ')}`);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load project template settings');
    } finally {
      setLoading(false);
    }
  }, [GLOBAL_TEMPLATE_ID, clampWeeksCount, clearSelection]);

  React.useEffect(() => {
    if (selectedTemplateId == null) {
      setRowsByPhase({});
      setWeeksByPhaseDraft({});
      clearSelection();
      return;
    }
    void loadTemplateSettings(selectedTemplateId, activePhaseKeys);
  }, [activePhaseKeys, clearSelection, loadTemplateSettings, selectedTemplateId]);

  React.useEffect(() => {
    const firstPhase = activePhaseKeys[0];
    if (!firstPhase) return;
    void loadAllRoles(firstPhase);
  }, [activePhaseKeys, loadAllRoles]);

  React.useEffect(() => {
    const key = `${GROUP_STORAGE_PREFIX}${templateKey}`;
    const defaults: Record<number, boolean> = {};
    groupedRoles.forEach((group) => {
      defaults[group.departmentId] = true;
    });

    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        setExpandedDepartments(defaults);
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      const hydrated: Record<number, boolean> = { ...defaults };
      Object.entries(parsed || {}).forEach(([deptId, expanded]) => {
        const numericDept = Number(deptId);
        if (Number.isFinite(numericDept) && numericDept in hydrated) {
          hydrated[numericDept] = Boolean(expanded);
        }
      });
      setExpandedDepartments(hydrated);
    } catch {
      setExpandedDepartments(defaults);
    }
  }, [groupedRoles, templateKey]);

  const persistExpandedDepartments = React.useCallback((next: Record<number, boolean>) => {
    const key = `${GROUP_STORAGE_PREFIX}${templateKey}`;
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // ignore storage failures
    }
  }, [templateKey]);

  const toggleDepartmentExpanded = React.useCallback((departmentId: number) => {
    setExpandedDepartments((prev) => {
      const next = { ...prev, [departmentId]: !(prev[departmentId] !== false) };
      persistExpandedDepartments(next);
      return next;
    });
  }, [persistExpandedDepartments]);

  const isDepartmentExpanded = React.useCallback((departmentId: number) => {
    return expandedDepartments[departmentId] !== false;
  }, [expandedDepartments]);

  const onSaveAll = React.useCallback(async (): Promise<boolean> => {
    if (selectedTemplateId == null) return false;

    const phasesToSave = Array.from(dirtyPhasesRef.current).filter((phase) => activePhaseKeys.includes(phase));
    if (phasesToSave.length === 0) return true;

    try {
      setSaving(true);
      setError(null);

      const saveResults = await Promise.allSettled(
        phasesToSave.map(async (phase) => {
          const settings = (rowsByPhaseRef.current[phase] || []).map((row) => ({
            roleId: row.roleId,
            percentByWeek: row.percentByWeek || {},
            ...(row.roleCount != null ? { roleCount: row.roleCount } : {}),
            peopleRoleIds: row.peopleRoleIds || [],
          }));
          const weeksCount = getWeeksCountForPhase(phase);

          if (selectedTemplateId === GLOBAL_TEMPLATE_ID) {
            const response = await autoHoursSettingsApi.update(undefined, settings, phase, weeksCount);
            return {
              phase,
              rows: response?.settings || [],
              weekLimits: response?.weekLimits,
            };
          }

          const rows = await autoHoursTemplatesApi.updateSettings(Number(selectedTemplateId), settings, phase, undefined, weeksCount);
          return {
            phase,
            rows: rows || [],
          };
        })
      );

      const successPhases: string[] = [];
      const failedPhases: Array<{ phase: string; message: string }> = [];

      const nextPhaseErrors: Record<string, string | null> = {};
      const successRowsByPhase: Record<string, AutoHoursRoleSetting[]> = {};

      saveResults.forEach((result, idx) => {
        const phase = phasesToSave[idx];
        if (result.status === 'fulfilled') {
          successRowsByPhase[phase] = result.value.rows || [];
          successPhases.push(phase);
          nextPhaseErrors[phase] = null;
          if (result.value.weekLimits) {
            setWeeksConfig((prevCfg) => ({
              max: Number.isFinite(result.value.weekLimits.maxWeeksCount) ? Number(result.value.weekLimits.maxWeeksCount) : prevCfg.max,
              default: Number.isFinite(result.value.weekLimits.defaultWeeksCount) ? Number(result.value.weekLimits.defaultWeeksCount) : prevCfg.default,
            }));
          }
        } else {
          const reasonMessage = (result.reason as any)?.message || 'Failed to save';
          failedPhases.push({ phase, message: reasonMessage });
          nextPhaseErrors[phase] = reasonMessage;
        }
      });

      setRowsByPhase((prev) => ({ ...prev, ...successRowsByPhase }));

      setPhaseErrors((prev) => ({ ...prev, ...nextPhaseErrors }));

      setDirtyPhases((prev) => {
        const next = new Set(prev);
        successPhases.forEach((phase) => next.delete(phase));
        return next;
      });

      if (failedPhases.length === 0) {
        showToast(
          selectedTemplateId === GLOBAL_TEMPLATE_ID ? 'Global defaults updated' : 'Template settings updated',
          'success'
        );
        return true;
      }

      const failedLabels = failedPhases.map((entry) => phaseLabelByKey.get(entry.phase) || entry.phase).join(', ');
      if (successPhases.length > 0) {
        setError(`Saved ${successPhases.length} phase(s). Failed: ${failedLabels}`);
        showToast(`Partial save completed. Failed phases: ${failedLabels}`, 'warning');
      } else {
        setError(`Failed to save phase(s): ${failedLabels}`);
        showToast(`Failed to save phase(s): ${failedLabels}`, 'error');
      }
      return false;
    } catch (e: any) {
      setError(e?.message || 'Failed to save template settings');
      showToast(e?.message || 'Failed to save template settings', 'error');
      return false;
    } finally {
      setSaving(false);
    }
  }, [GLOBAL_TEMPLATE_ID, activePhaseKeys, getWeeksCountForPhase, phaseLabelByKey, selectedTemplateId]);

  const toggleTemplatePhase = React.useCallback(async (phaseKey: string) => {
    if (selectedTemplateId == null || selectedTemplateId === GLOBAL_TEMPLATE_ID) return;
    const current = new Set(activePhaseKeys);
    if (current.has(phaseKey)) {
      current.delete(phaseKey);
    } else {
      current.add(phaseKey);
    }

    const next = phaseOptions.map((opt) => opt.value).filter((key) => current.has(key));
    if (next.length === 0) {
      showToast('At least one phase is required', 'error');
      return;
    }

    try {
      const updated = await autoHoursTemplatesApi.update(Number(selectedTemplateId), { phaseKeys: next });
      setTemplates((prev) => prev.map((t) => (t.id === selectedTemplateId ? updated : t)));
      setDirtyPhases((prev) => {
        const nextDirty = new Set(prev);
        Array.from(nextDirty).forEach((phase) => {
          if (!next.includes(phase)) nextDirty.delete(phase);
        });
        return nextDirty;
      });
      if (!next.includes(selectedPhase)) {
        setSelectedPhase(next[0]);
      }
    } catch (e: any) {
      showToast(e?.message || 'Failed to update template phases', 'error');
    }
  }, [GLOBAL_TEMPLATE_ID, activePhaseKeys, phaseOptions, selectedPhase, selectedTemplateId]);

  const handleCreateTemplate = React.useCallback(async () => {
    const name = newTemplateName.trim();
    if (!name) return;
    try {
      const created = await autoHoursTemplatesApi.create({ name });
      setTemplates((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedTemplateId(created.id);
      setNewTemplateName('');
      showToast('Template created', 'success');
    } catch (e: any) {
      showToast(e?.message || 'Failed to create template', 'error');
    }
  }, [newTemplateName]);

  const handleDeleteTemplate = React.useCallback(async () => {
    if (selectedTemplateId == null || selectedTemplateId === GLOBAL_TEMPLATE_ID) return;
    const template = templates.find((t) => t.id === selectedTemplateId);
    const name = template?.name || 'this template';
    const confirmed = await confirmAction({
      title: 'Delete Template',
      message: `Delete ${name}? This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!confirmed) return;

    try {
      await autoHoursTemplatesApi.delete(Number(selectedTemplateId));
      const next = templates.filter((t) => t.id !== selectedTemplateId);
      setTemplates(next);
      setSelectedTemplateId(next[0]?.id ?? GLOBAL_TEMPLATE_ID);
      showToast('Template deleted', 'success');
    } catch (e: any) {
      showToast(e?.message || 'Failed to delete template', 'error');
    }
  }, [GLOBAL_TEMPLATE_ID, selectedTemplateId, templates]);

  const handleDuplicateTemplate = React.useCallback(async () => {
    if (selectedTemplateId == null) return;
    const isDefault = selectedTemplateId === GLOBAL_TEMPLATE_ID;
    const base = isDefault ? null : templates.find((t) => t.id === selectedTemplateId);
    const baseName = isDefault ? 'Default' : base?.name || 'Template';
    const copyName = `${baseName} Copy`;

    try {
      const phaseKeys = base?.phaseKeys && base.phaseKeys.length ? base.phaseKeys : phaseOptions.map((opt) => opt.value);
      if (!phaseKeys.length) {
        showToast('No phases available to duplicate', 'error');
        return;
      }

      const created = isDefault
        ? await autoHoursTemplatesApi.duplicateDefault({ name: copyName, phaseKeys })
        : await autoHoursTemplatesApi.duplicate(Number(base!.id), { name: copyName });

      setTemplates((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedTemplateId(created.id);
      showToast('Template duplicated', 'success');
    } catch (e: any) {
      showToast(e?.message || 'Failed to duplicate template', 'error');
    }
  }, [GLOBAL_TEMPLATE_ID, phaseOptions, selectedTemplateId, templates]);

  const handleRenameTemplate = React.useCallback(async (nextName?: string) => {
    if (selectedTemplateId == null || selectedTemplateId === GLOBAL_TEMPLATE_ID) return;
    const name = (nextName ?? templateName).trim();
    if (!name) return;
    if (selectedTemplate?.name === name) return;

    try {
      setRenaming(true);
      const updated = await autoHoursTemplatesApi.update(Number(selectedTemplateId), { name });
      setTemplates((prev) => prev.map((t) => (t.id === selectedTemplateId ? updated : t)));
      setTemplateName(updated.name);
      showToast('Template renamed', 'success');
    } catch (e: any) {
      showToast(e?.message || 'Failed to rename template', 'error');
    } finally {
      setRenaming(false);
    }
  }, [GLOBAL_TEMPLATE_ID, selectedTemplate?.name, selectedTemplateId, templateName]);

  const handleUpdateDescription = React.useCallback(async (nextDescription?: string) => {
    if (selectedTemplateId == null || selectedTemplateId === GLOBAL_TEMPLATE_ID) return;
    const description = (nextDescription ?? templateDescription).trim();
    if ((selectedTemplate?.description || '') === description) return;

    try {
      setRenaming(true);
      const updated = await autoHoursTemplatesApi.update(Number(selectedTemplateId), { description });
      setTemplates((prev) => prev.map((t) => (t.id === selectedTemplateId ? updated : t)));
      setTemplateDescription(updated.description || '');
      showToast('Template description updated', 'success');
    } catch (e: any) {
      showToast(e?.message || 'Failed to update description', 'error');
    } finally {
      setRenaming(false);
    }
  }, [GLOBAL_TEMPLATE_ID, selectedTemplate?.description, selectedTemplateId, templateDescription]);

  const updateTemplateExclusions = React.useCallback(async (nextExcludedRoleIds: number[], nextExcludedDepartmentIds: number[]) => {
    if (selectedTemplateId == null || selectedTemplateId === GLOBAL_TEMPLATE_ID) return;

    try {
      setUpdatingExclusions(true);
      const updated = await autoHoursTemplatesApi.update(Number(selectedTemplateId), {
        excludedRoleIds: nextExcludedRoleIds,
        excludedDepartmentIds: nextExcludedDepartmentIds,
      });
      setTemplates((prev) => prev.map((t) => (t.id === selectedTemplateId ? updated : t)));
      await loadTemplateSettings(selectedTemplateId, activePhaseKeys);
    } catch (e: any) {
      showToast(e?.message || 'Failed to update template exclusions', 'error');
    } finally {
      setUpdatingExclusions(false);
    }
  }, [GLOBAL_TEMPLATE_ID, activePhaseKeys, loadTemplateSettings, selectedTemplateId]);

  const handleExcludeDepartment = React.useCallback(async (departmentId: number) => {
    const next = Array.from(new Set([...(excludedDepartmentIds || []), departmentId]));
    await updateTemplateExclusions(excludedRoleIds || [], next);
  }, [excludedDepartmentIds, excludedRoleIds, updateTemplateExclusions]);

  const handleIncludeDepartment = React.useCallback(async (departmentId: number) => {
    const next = (excludedDepartmentIds || []).filter((id) => id !== departmentId);
    await updateTemplateExclusions(excludedRoleIds || [], next);
  }, [excludedDepartmentIds, excludedRoleIds, updateTemplateExclusions]);

  const handleExcludeRole = React.useCallback(async (roleId: number) => {
    const next = Array.from(new Set([...(excludedRoleIds || []), roleId]));
    await updateTemplateExclusions(next, excludedDepartmentIds || []);
  }, [excludedDepartmentIds, excludedRoleIds, updateTemplateExclusions]);

  const handleIncludeRole = React.useCallback(async (roleId: number) => {
    const next = (excludedRoleIds || []).filter((id) => id !== roleId);
    await updateTemplateExclusions(next, excludedDepartmentIds || []);
  }, [excludedDepartmentIds, excludedRoleIds, updateTemplateExclusions]);

  React.useEffect(() => {
    const onMouseUp = () => {
      draggingRef.current = false;
    };
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, []);

  React.useEffect(() => {
    const onMouseDown = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      const inCell = target?.closest('[data-auto-hours-cell]');
      if (inCell) return;
      if (selectedCellsRef.current.size > 0) clearSelection();
    };
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, [clearSelection]);

  React.useEffect(() => {
    const onMouseDown = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      const inRoleMenu = target?.closest('[data-people-role-menu]');
      if (inRoleMenu) return;
      setActivePeopleRoleMenuRowId(null);
    };
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, []);

  React.useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (selectedCellsRef.current.size === 0) return;

      if (isEditableEventTarget(ev.target)) return;

      if (ev.key === 'Enter') {
        if (!editingCellKeyRef.current) return;
        ev.preventDefault();
        commitKeyboardEdit();
        return;
      }

      if (ev.key === 'Escape') {
        if (!editingCellKeyRef.current) return;
        ev.preventDefault();
        cancelKeyboardEdit();
        return;
      }

      if (ev.key === 'Backspace' || ev.key === 'Delete') {
        if (!editingCellKeyRef.current) return;
        ev.preventDefault();
        setEditingValue((prev) => prev.slice(0, -1));
        return;
      }

      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;

      if (/^[0-9.-]$/.test(ev.key)) {
        ev.preventDefault();
        if (!editingCellKeyRef.current || !selectedCellsRef.current.has(editingCellKeyRef.current)) {
          beginKeyboardEdit(ev.key);
          return;
        }
        setEditingValue((prev) => {
          const base = prev || '';
          if (ev.key === '-' && base.length > 0) return base;
          const next = `${base}${ev.key}`;
          return /^-?\d*\.?\d*$/.test(next) ? next : base;
        });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [beginKeyboardEdit, cancelKeyboardEdit, commitKeyboardEdit, isEditableEventTarget]);

  React.useEffect(() => {
    const onCopy = (ev: ClipboardEvent) => {
      if (selectedCellsRef.current.size === 0) return;
      if (isEditableEventTarget(ev.target) && !isGridCellEventTarget(ev.target)) return;

      const matrix = buildSelectionCopyMatrix();
      if (!matrix || !matrix.length) return;

      copiedMatrixRef.current = matrix;
      const text = matrixToClipboardText(matrix);
      if (ev.clipboardData) {
        ev.clipboardData.setData('text/plain', text);
        ev.preventDefault();
      }
    };

    const onPaste = (ev: ClipboardEvent) => {
      if (selectedCellsRef.current.size === 0) return;
      if (isEditableEventTarget(ev.target) && !isGridCellEventTarget(ev.target)) return;

      const fromClipboard = parseClipboardTextToMatrix(ev.clipboardData?.getData('text/plain'));
      const matrix = fromClipboard || copiedMatrixRef.current;
      if (!matrix || !matrix.length) return;

      pasteMatrixAtSelection(matrix);
      ev.preventDefault();
    };

    window.addEventListener('copy', onCopy);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('copy', onCopy);
      window.removeEventListener('paste', onPaste);
    };
  }, [
    buildSelectionCopyMatrix,
    isGridCellEventTarget,
    isEditableEventTarget,
    matrixToClipboardText,
    parseClipboardTextToMatrix,
    pasteMatrixAtSelection,
  ]);

  const handleCellMouseDown = React.useCallback((phase: string, rowKey: string, weekKey: string, ev: React.MouseEvent) => {
    const rowIndex = rowIndexMap.get(rowKey);
    const columnIndex = columnIndexMap.get(`${phase}:${weekKey}`);
    if (rowIndex == null || columnIndex == null) return;

    const isCtrl = ev.ctrlKey || ev.metaKey;
    const isShift = ev.shiftKey;

    if (isShift && anchorRef.current) {
      const range = buildRangeSelection(anchorRef.current, { rowIndex, columnIndex });
      const next = isCtrl ? mergeSelection(selectedCellsRef.current, range) : range;
      setSelectedCellsState(next);
      anchorRef.current = { rowIndex, columnIndex };
      return;
    }

    const key = cellKey(phase, rowKey, weekKey);
    const isAlreadySelected = selectedCellsRef.current.has(key);
    const hasMultiSelection = selectedCellsRef.current.size > 1;

    anchorRef.current = { rowIndex, columnIndex };
    dragStartRef.current = { rowIndex, columnIndex };
    draggingRef.current = true;
    dragAddRef.current = isCtrl;
    dragBaseSelectionRef.current = isCtrl ? new Set(selectedCellsRef.current) : new Set();

    if (isCtrl) {
      setSelectedCellsState((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      return;
    }

    if (isAlreadySelected && hasMultiSelection) return;
    setSelectedCellsState(new Set([key]));
  }, [buildRangeSelection, cellKey, columnIndexMap, mergeSelection, rowIndexMap, setSelectedCellsState]);

  const handleCellMouseEnter = React.useCallback((phase: string, rowKey: string, weekKey: string) => {
    if (!draggingRef.current || !dragStartRef.current) return;

    const rowIndex = rowIndexMap.get(rowKey);
    const columnIndex = columnIndexMap.get(`${phase}:${weekKey}`);
    if (rowIndex == null || columnIndex == null) return;

    const range = buildRangeSelection(dragStartRef.current, { rowIndex, columnIndex });
    if (dragAddRef.current) {
      setSelectedCellsState(mergeSelection(dragBaseSelectionRef.current, range));
    } else {
      setSelectedCellsState(range);
    }
  }, [buildRangeSelection, columnIndexMap, mergeSelection, rowIndexMap, setSelectedCellsState]);

  const handleCellClick = React.useCallback((phase: string, rowKey: string, weekKey: string, ev: React.MouseEvent) => {
    const rowIndex = rowIndexMap.get(rowKey);
    const columnIndex = columnIndexMap.get(`${phase}:${weekKey}`);
    if (rowIndex == null || columnIndex == null) return;

    const isCtrl = ev.ctrlKey || ev.metaKey;
    const isShift = ev.shiftKey;
    if (isShift || isCtrl) return;

    const key = cellKey(phase, rowKey, weekKey);
    if (!selectedCellsRef.current.has(key) || selectedCellsRef.current.size <= 1) {
      setSelectedCellsState(new Set([key]));
    }
    anchorRef.current = { rowIndex, columnIndex };
  }, [cellKey, columnIndexMap, rowIndexMap, setSelectedCellsState]);

  const renderRoleMetaCell = (role: RoleMeta) => {
    const mappedRoleIds = getMappedPeopleRoleIds(role.roleId);
    const mappedRoleIdSet = new Set(mappedRoleIds.map((id) => Number(id)));
    const availablePeopleRoles = peopleRoles.filter((peopleRole) => !mappedRoleIdSet.has(Number(peopleRole.id)));
    const showPeopleRoleDropdown = activePeopleRoleMenuRowId === role.roleId && availablePeopleRoles.length > 0;
    const mappedPeopleRoles = mappedRoleIds.map((id) => peopleRoleById.get(id)).filter(Boolean) as PeopleRole[];

    return (
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="block truncate">{role.roleName}</span>
            {selectedTemplateId !== GLOBAL_TEMPLATE_ID && (
              <button
                type="button"
                className="text-sm text-red-400 hover:text-red-300 px-1"
                onClick={() => {
                  void handleExcludeRole(role.roleId);
                }}
                disabled={updatingExclusions}
                title="Remove role from template"
              >
                x
              </button>
            )}
          </div>
          <div className="flex w-[240px] shrink-0 items-center gap-2" data-people-role-menu>
            <div className="relative flex-1">
              <button
                type="button"
                className="w-full px-1 py-1 text-xs text-[var(--muted)] text-left hover:text-[var(--text)] disabled:opacity-60"
                onClick={() => {
                  setActivePeopleRoleMenuRowId((prev) => (prev === role.roleId ? null : role.roleId));
                }}
                disabled={availablePeopleRoles.length === 0}
              >
                {availablePeopleRoles.length === 0 ? 'No roles available' : 'Add Mapped Role'}
              </button>
              {showPeopleRoleDropdown && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-auto rounded border border-[var(--border)] bg-[var(--card)] shadow-lg">
                  {availablePeopleRoles.map((peopleRole) => (
                    <button
                      key={peopleRole.id}
                      type="button"
                      className="block w-full px-2 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[var(--surfaceHover)]"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        addMappedPeopleRole(role.roleId, Number(peopleRole.id));
                      }}
                    >
                      {peopleRole.name}
                      {peopleRole.isActive ? '' : ' (inactive)'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {mappedPeopleRoles.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {mappedPeopleRoles.map((mappedRole) => (
              <span
                key={`mapped-${role.roleId}-${mappedRole.id}`}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[10px] text-[var(--text)]"
              >
                <span>
                  {mappedRole.name}
                  {mappedRole.isActive ? '' : ' (inactive)'}
                </span>
                <button
                  type="button"
                  className="text-red-400 hover:text-red-300 leading-none"
                  onClick={() => removeRowPeopleRoleId(role.roleId, Number(mappedRole.id))}
                  title="Remove mapped people role"
                >
                  x
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderCellInput = (phase: string, roleId: number, weekKey: string, value: number) => {
    const rowKey = String(roleId);
    const key = cellKey(phase, rowKey, weekKey);
    const isSelected = selectedCells.has(key);
    const displayValue = displayValueFromPercent(value);
    const isFocused = focusedCellKey === key;
    const isEditing = editingCellKey === key;
    const hideZero = !isEditing && !isFocused && Number(displayValue) === 0;
    const inputValue = isEditing ? editingValue : hideZero ? '' : String(displayValue);

    return (
      <td
        key={key}
        className={`py-2 px-0 ${isSelected ? 'bg-[var(--surfaceHover)]' : ''}`}
        data-auto-hours-cell
        onMouseDown={(e) => {
          e.preventDefault();
          handleCellMouseDown(phase, rowKey, weekKey, e);
        }}
        onMouseEnter={() => handleCellMouseEnter(phase, rowKey, weekKey)}
        onClick={(e) => handleCellClick(phase, rowKey, weekKey, e)}
      >
        <div className="relative flex items-center">
          <input
            type="number"
            min={0}
            max={inputMode === 'hours' ? fullCapacityHours : 100}
            step="0.25"
            value={inputValue}
            className={`${getCellClasses(value, isSelected)} ${inputMode === 'percent' ? 'pr-3' : ''}`}
            onChange={(e) => {
              const nextRaw = e.currentTarget.value;
              editingCellKeyRef.current = key;
              setEditingCellKey(key);
              setEditingValue(nextRaw);
              const isMultiSelection = selectedCellsRef.current.size > 1 && selectedCellsRef.current.has(key);
              const trimmed = nextRaw.trim();
              if (trimmed === '' || trimmed === '.' || trimmed === '-' || trimmed === '-.') return;
              if (Number.isFinite(Number(trimmed)) && !isMultiSelection) {
                updateRowPercent(phase, roleId, weekKey, trimmed);
              }
            }}
            onFocus={(e) => {
              setFocusedCellKey(key);
              editingCellKeyRef.current = key;
              setEditingCellKey(key);
              setEditingValue(hideZero ? '' : String(displayValue));
              e.currentTarget.select();
            }}
            onBlur={(e) => {
              setFocusedCellKey((prev) => (prev === key ? null : prev));
              setEditingCellKey((prev) => {
                if (prev === key) {
                  editingCellKeyRef.current = null;
                  return null;
                }
                return prev;
              });
              const finalRaw = e.currentTarget.value;
              const trimmed = finalRaw.trim();
              const isMultiSelection = selectedCellsRef.current.size > 1 && selectedCellsRef.current.has(key);
              if (!isMultiSelection) {
                if (trimmed === '' || trimmed === '.' || trimmed === '-' || trimmed === '-.') {
                  updateRowPercent(phase, roleId, weekKey, '0');
                } else if (Number.isFinite(Number(trimmed))) {
                  updateRowPercent(phase, roleId, weekKey, trimmed);
                }
              }
              setEditingValue('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const trimmed = e.currentTarget.value.trim();
                const isMultiSelection = selectedCellsRef.current.size > 1 && selectedCellsRef.current.has(key);
                if (trimmed !== '' && trimmed !== '.' && trimmed !== '-' && trimmed !== '-.' && Number.isFinite(Number(trimmed))) {
                  updateRowPercent(phase, roleId, weekKey, trimmed);
                } else if (!isMultiSelection) {
                  updateRowPercent(phase, roleId, weekKey, '0');
                }
                editingCellKeyRef.current = null;
                e.currentTarget.blur();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setEditingCellKey((prev) => {
                  if (prev === key) {
                    editingCellKeyRef.current = null;
                    return null;
                  }
                  return prev;
                });
                setEditingValue('');
                e.currentTarget.blur();
              }
            }}
            onClick={(e) => {
              e.currentTarget.focus();
              e.currentTarget.select();
            }}
            onDragStart={(e) => e.preventDefault()}
          />
          {inputMode === 'percent' && !hideZero && (
            <span className="pointer-events-none absolute right-[6px] text-[10px] text-[var(--muted)]">%</span>
          )}
        </div>
      </td>
    );
  };

  const renderDesktopMatrix = () => {
    const totalPhaseDataColumns = activePhaseKeys.reduce((sum, phase) => sum + 1 + (phaseWeekKeys[phase] || []).length, 0);

    return (
      <div ref={gridRef} className="overflow-x-auto overflow-y-visible border border-[var(--border)] rounded-lg scrollbar-theme">
        <table className="w-max min-w-full text-sm table-fixed border-collapse">
          <colgroup>
            <col style={{ width: roleColumnWidth }} />
            {activePhaseKeys.map((phase) => (
              <React.Fragment key={`col-${phase}`}>
                <col style={{ width: roleCountColumnWidth }} />
                {(phaseWeekKeys[phase] || []).map((weekKey) => (
                  <col key={`col-${phase}-${weekKey}`} style={{ width: weekColumnWidth }} />
                ))}
              </React.Fragment>
            ))}
          </colgroup>

          <thead>
            <tr>
              <th
                rowSpan={2}
                className="sticky left-0 top-0 z-40 bg-[var(--card)] border-b border-[var(--border)] px-3 py-2 text-left"
              >
                <div className="text-sm text-[var(--muted)]">Role</div>
              </th>

              {activePhaseKeys.map((phase, phaseIndex) => (
                <th
                  key={`phase-header-${phase}`}
                  colSpan={1 + (phaseWeekKeys[phase] || []).length}
                  className={`sticky top-0 z-30 bg-[var(--card)] border-b border-[var(--border)] px-2 py-2 ${phaseIndex > 0 ? 'border-l border-[var(--border)]' : 'border-l border-[var(--border)]'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[var(--text)]">{phaseLabelByKey.get(phase) || phase.toUpperCase()}</span>
                    <div className="inline-flex items-center gap-2 text-xs text-[var(--muted)]">
                      <span>Weeks</span>
                      <input
                        type="number"
                        min={0}
                        max={maxWeeksCount}
                        step={1}
                        value={getWeeksCountForPhase(phase) === 0 ? '' : getWeeksCountForPhase(phase)}
                        onChange={(e) => handleWeeksCountChange(phase, e.currentTarget.value)}
                        className="w-14 bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded px-2 py-1 text-xs focus:border-[var(--primary)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                  </div>
                </th>
              ))}
            </tr>

            <tr>
              {activePhaseKeys.map((phase, phaseIndex) => {
                const weekKeys = phaseWeekKeys[phase] || [];
                return (
                  <React.Fragment key={`weeks-${phase}`}>
                    <th className={`sticky top-11 z-30 bg-[var(--card)] border-b border-[var(--border)] py-2 text-center text-xs text-[var(--muted)] ${phaseIndex > 0 ? 'border-l border-[var(--border)]' : 'border-l border-[var(--border)]'}`}>
                      Cnt
                    </th>
                    {weekKeys.map((weekKey) => (
                      <th
                        key={`week-${phase}-${weekKey}`}
                        className="sticky top-11 z-30 bg-[var(--card)] border-b border-[var(--border)] py-2 text-center text-xs text-[var(--muted)]"
                      >
                        {Number(weekKey) === 0 ? '0w' : `${weekKey}w`}
                      </th>
                    ))}
                  </React.Fragment>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {groupedRoles.map((group) => {
              const expanded = isDepartmentExpanded(group.departmentId);
              return (
                <React.Fragment key={`dept-${group.departmentId}`}>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                    <td className="sticky left-0 z-20 bg-[var(--surface)] px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          className="text-sm font-semibold text-[var(--text)] hover:text-[var(--text)]"
                          onClick={() => toggleDepartmentExpanded(group.departmentId)}
                          title={expanded ? 'Collapse department' : 'Expand department'}
                        >
                          {group.departmentName}
                        </button>
                        {selectedTemplateId !== GLOBAL_TEMPLATE_ID && (
                          <button
                            type="button"
                            className="text-sm text-red-400 hover:text-red-300 px-1"
                            onClick={() => {
                              void handleExcludeDepartment(group.departmentId);
                            }}
                            disabled={updatingExclusions}
                            title="Remove department from template"
                          >
                            x
                          </button>
                        )}
                      </div>
                    </td>
                    <td colSpan={totalPhaseDataColumns} className="py-2" />
                  </tr>

                  {expanded &&
                    group.rows.map((role) => {
                      const isMappedRoleMenuOpen = activePeopleRoleMenuRowId === role.roleId;
                      return (
                        <tr key={`role-${group.departmentId}-${role.roleId}`} className="hover:bg-[var(--surfaceHover)] transition-colors border-b border-[var(--border)]">
                          <td className={`sticky left-0 bg-[var(--card)] px-3 py-2 align-top ${isMappedRoleMenuOpen ? 'z-50' : 'z-10'}`}>{renderRoleMetaCell(role)}</td>

                          {activePhaseKeys.map((phase, phaseIndex) => {
                            const row = rowsByPhaseRoleId[phase]?.get(role.roleId);
                            const weekKeys = phaseWeekKeys[phase] || [];
                            const roleCount = Number.isFinite(row?.roleCount) ? Number(row?.roleCount) : 1;

                            return (
                              <React.Fragment key={`phase-row-${phase}-${role.roleId}`}>
                                <td className={`py-2 px-1 ${phaseIndex > 0 ? 'border-l border-[var(--border)]' : 'border-l border-[var(--border)]'}`}>
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      type="button"
                                      className="h-5 w-5 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--primary)] text-xs leading-none"
                                      onClick={() => adjustRoleCount(phase, role.roleId, -1)}
                                      title="Decrease role count"
                                    >
                                      -
                                    </button>
                                    <span className="text-xs text-[var(--muted)] w-4 text-center">{roleCount}</span>
                                    <button
                                      type="button"
                                      className="h-5 w-5 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--primary)] text-xs leading-none"
                                      onClick={() => adjustRoleCount(phase, role.roleId, 1)}
                                      title="Increase role count"
                                    >
                                      +
                                    </button>
                                  </div>
                                </td>

                                {weekKeys.map((weekKey) => {
                                  const value = row?.percentByWeek?.[weekKey] ?? 0;
                                  return renderCellInput(phase, role.roleId, weekKey, value);
                                })}
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      );
                    })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderMobileSinglePhase = () => {
    const phaseRows = rowsByPhase[selectedPhase] || [];
    const weekKeys = phaseWeekKeys[selectedPhase] || [];

    const groups: Array<{ departmentId: number; departmentName: string; rows: AutoHoursRoleSetting[] }> = [];
    let current: { departmentId: number; departmentName: string; rows: AutoHoursRoleSetting[] } | null = null;
    phaseRows.forEach((row) => {
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

    return (
      <div ref={gridRef} className="overflow-x-auto space-y-6 scrollbar-theme">
        {groups.map((group, index) => (
          <div key={group.departmentId} className="min-w-full">
            <div className="grid items-center mb-2" style={{ gridTemplateColumns: `${roleColumnWidth}px 1fr` }}>
              <div className="relative" style={{ width: roleColumnWidth }}>
                <span className="text-sm font-semibold text-[var(--text)] block pr-6">{group.departmentName}</span>
                {selectedTemplateId !== GLOBAL_TEMPLATE_ID && (
                  <button
                    type="button"
                    className="absolute top-0 text-sm text-red-400 hover:text-red-300 px-1"
                    style={{ right: 0 }}
                    onClick={() => {
                      void handleExcludeDepartment(group.departmentId);
                    }}
                    disabled={updatingExclusions}
                    title="Remove department from template"
                  >
                    x
                  </button>
                )}
              </div>
              <div />
            </div>

            <table className="w-max text-sm table-fixed border-collapse">
              <colgroup>
                <col style={{ width: roleColumnWidth }} />
                <col style={{ width: roleCountColumnWidth }} />
                {weekKeys.map((weekKey) => (
                  <col key={`mobile-col-${selectedPhase}-${weekKey}`} style={{ width: weekColumnWidth }} />
                ))}
              </colgroup>

              <thead className="text-[var(--muted)]">
                <tr className="border-b border-[var(--border)]">
                  <th className="py-2 pr-2 text-left">Role</th>
                  <th className="py-2 px-0 text-center">Cnt</th>
                  {weekKeys.map((weekKey) => (
                    <th key={`mobile-week-${weekKey}`} className="py-2 px-0 text-center whitespace-nowrap">
                      {Number(weekKey) === 0 ? '0w' : `${weekKey}w`}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-[var(--border)]">
                {group.rows.map((row) => {
                  const isMappedRoleMenuOpen = activePeopleRoleMenuRowId === row.roleId;
                  return (
                    <tr key={`mobile-row-${row.roleId}`} className="hover:bg-[var(--surfaceHover)] transition-colors">
                      <td className={`py-2 pr-0 text-[var(--text)] align-top ${isMappedRoleMenuOpen ? 'relative z-30' : ''}`}>{renderRoleMetaCell({
                      roleId: row.roleId,
                      roleName: row.roleName,
                      departmentId: row.departmentId,
                      departmentName: row.departmentName,
                      isActive: row.isActive,
                      sortOrder: row.sortOrder,
                    })}</td>

                      <td className="py-2 px-1">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            className="h-5 w-5 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--primary)] text-xs leading-none"
                            onClick={() => adjustRoleCount(selectedPhase, row.roleId, -1)}
                            title="Decrease role count"
                          >
                            -
                          </button>
                          <span className="text-xs text-[var(--muted)] w-4 text-center">{Number.isFinite(row.roleCount) ? row.roleCount : 1}</span>
                          <button
                            type="button"
                            className="h-5 w-5 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--primary)] text-xs leading-none"
                            onClick={() => adjustRoleCount(selectedPhase, row.roleId, 1)}
                            title="Increase role count"
                          >
                            +
                          </button>
                        </div>
                      </td>

                      {weekKeys.map((weekKey) => {
                        const value = row.percentByWeek?.[weekKey] ?? 0;
                        return renderCellInput(selectedPhase, row.roleId, weekKey, value);
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {index < groups.length - 1 && <div className="border-b border-[var(--border)] mx-3 my-4" />}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div ref={containerRef}>
      <div className="flex flex-col gap-4 lg:flex-row">
        {isTemplatePanelCollapsedEffective ? (
          <div className="hidden lg:flex lg:w-14 lg:pr-4 lg:relative lg:after:content-[''] lg:after:absolute lg:after:top-0 lg:after:bottom-0 lg:after:right-[-8px] lg:after:w-px lg:after:bg-[var(--border)]">
            <div className="w-full flex flex-col items-center gap-2">
              <button
                type="button"
                className="h-8 w-full rounded border border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]"
                onClick={() => setIsTemplatePanelCollapsed(false)}
                title="Show templates"
              >
                Show
              </button>
              <div className="text-[10px] text-[var(--muted)] text-center break-words">
                Templates
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full lg:w-72 lg:pr-6 lg:relative lg:after:content-[''] lg:after:absolute lg:after:top-0 lg:after:bottom-0 lg:after:right-[-12px] lg:after:w-px lg:after:bg-[var(--border)]">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-sm text-[var(--muted)]">Templates</div>
              {!isMobileLayout && (
                <button
                  type="button"
                  className="h-7 px-2 rounded border border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]"
                  onClick={() => setIsTemplatePanelCollapsed(true)}
                  title="Hide templates panel"
                >
                  Hide
                </button>
              )}
            </div>
            <div className="space-y-2 mb-3">
              <div className="grid w-full grid-cols-3 gap-2">
                <Button className="w-full" variant="ghost" size="sm" onClick={handleCreateTemplate} disabled={!newTemplateName.trim()}>
                  Create
                </Button>
                <Button className="w-full" variant="ghost" size="sm" onClick={handleDuplicateTemplate} disabled={selectedTemplateId == null}>
                  Duplicate
                </Button>
                <Button
                  className="w-full"
                  variant="ghost"
                  size="sm"
                  onClick={handleDeleteTemplate}
                  disabled={selectedTemplateId == null || selectedTemplateId === GLOBAL_TEMPLATE_ID}
                >
                  Delete
                </Button>
              </div>

              <input
                type="text"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.currentTarget.value)}
                placeholder="New template name"
                className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded px-2 py-1 text-sm focus:border-[var(--primary)]"
              />
            </div>

            <div className="max-h-[360px] overflow-y-auto border border-[var(--border)] rounded bg-[var(--card)]">
              <div className="divide-y divide-[var(--border)]">
                <button
                  type="button"
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    selectedTemplateId === GLOBAL_TEMPLATE_ID
                      ? 'bg-[var(--surfaceHover)] text-[var(--text)]'
                      : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]'
                  }`}
                  onClick={() => setSelectedTemplateId(GLOBAL_TEMPLATE_ID)}
                >
                  Default
                </button>

                {templatesLoading ? (
                  <div className="text-sm text-[var(--muted)] p-3">Loading templates...</div>
                ) : templates.length === 0 ? (
                  <div className="text-sm text-[var(--muted)] p-3">No templates yet.</div>
                ) : (
                  templates.map((template) => {
                    const isActive = selectedTemplateId === template.id;
                    return (
                      <button
                        key={template.id}
                        type="button"
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                          isActive
                            ? 'bg-[var(--surfaceHover)] text-[var(--text)]'
                            : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]'
                        }`}
                        onClick={() => setSelectedTemplateId(template.id)}
                      >
                        {template.name}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 lg:pl-6 min-w-0">
          <div className="mb-2">
            {selectedTemplateId === GLOBAL_TEMPLATE_ID ? (
              <div className="text-lg font-semibold text-[var(--text)]">Default</div>
            ) : isEditingTitle ? (
              <input
                type="text"
                value={templateName}
                autoFocus
                onChange={(e) => setTemplateName(e.currentTarget.value)}
                onBlur={() => {
                  setIsEditingTitle(false);
                  void handleRenameTemplate();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    setIsEditingTitle(false);
                    void handleRenameTemplate();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setTemplateName(selectedTemplate?.name || '');
                    setIsEditingTitle(false);
                  }
                }}
                className="text-lg font-semibold text-[var(--text)] bg-transparent border-b border-[var(--border)] focus:border-[var(--primary)] outline-none w-full"
                disabled={renaming}
              />
            ) : (
              <button
                type="button"
                className="text-lg font-semibold text-[var(--text)] hover:text-[var(--text)]"
                onClick={() => setIsEditingTitle(true)}
              >
                {selectedTemplate?.name || 'Template'}
              </button>
            )}
          </div>

          <div className="mb-4">
            {selectedTemplateId === GLOBAL_TEMPLATE_ID ? (
              <div className="space-y-1">
                <div className="text-sm text-[var(--muted)]">Default settings used when no template is assigned.</div>
                <div className="text-xs text-[var(--muted)]">Total weeks (percent phases): {totalPercentWeeksLabel}</div>
              </div>
            ) : isEditingDescription ? (
              <textarea
                value={templateDescription}
                autoFocus
                onChange={(e) => setTemplateDescription(e.currentTarget.value)}
                onBlur={() => {
                  setIsEditingDescription(false);
                  void handleUpdateDescription();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setTemplateDescription(selectedTemplate?.description || '');
                    setIsEditingDescription(false);
                  }
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    setIsEditingDescription(false);
                    void handleUpdateDescription();
                  }
                }}
                placeholder="Add a description"
                rows={2}
                className="w-full text-sm text-[var(--text)] bg-transparent border border-[var(--border)] rounded px-2 py-1 focus:border-[var(--primary)] outline-none resize-none"
                disabled={renaming}
              />
            ) : (
              <div className="space-y-1">
                <button
                  type="button"
                  className="text-sm text-[var(--muted)] text-left hover:text-[var(--text)]"
                  onClick={() => setIsEditingDescription(true)}
                >
                  {selectedTemplate?.description || 'Add a description'}
                </button>
                <div className="text-xs text-[var(--muted)]">Total weeks (percent phases): {totalPercentWeeksLabel}</div>
              </div>
            )}
          </div>

          {selectedTemplateId !== GLOBAL_TEMPLATE_ID && (
            <div className="mb-4">
              {excludedDepartments.length > 0 || excludedRoles.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-xs text-[var(--muted)] uppercase tracking-wide">Excluded</div>
                  <div className="flex flex-wrap gap-2">
                    {excludedDepartments.map((dept) => (
                      <button
                        key={`dept-${dept.id}`}
                        type="button"
                        className="text-xs px-2 py-1 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--primary)]"
                        onClick={() => {
                          void handleIncludeDepartment(dept.id);
                        }}
                        disabled={updatingExclusions}
                        title="Add department back"
                      >
                        + {dept.name}
                      </button>
                    ))}
                    {excludedRoles.map((role) => (
                      <button
                        key={`role-${role.roleId}`}
                        type="button"
                        className="text-xs px-2 py-1 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--primary)]"
                        onClick={() => {
                          void handleIncludeRole(role.roleId);
                        }}
                        disabled={updatingExclusions}
                        title="Add role back"
                      >
                        + {role.roleName}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-[var(--muted)]">All roles and departments included.</div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between pb-3 mb-4 border-b border-[var(--border)]">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="text-sm text-[var(--muted)] cursor-help"
                  title="Enable which deliverable phases this template applies to. Disabled phases are hidden in this matrix."
                >
                  Select Applicable Phase
                </span>
                <div className="flex items-center rounded border border-[var(--border)] overflow-hidden">
                  {phaseOptions.map((opt) => {
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
                        onClick={() => {
                          void toggleTemplatePhase(opt.value);
                        }}
                        disabled={selectedTemplateId == null || selectedTemplateId === GLOBAL_TEMPLATE_ID}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="inline-flex items-center gap-2 text-sm text-[var(--muted)]">
                <span>Input mode</span>
                <div className="inline-flex items-center rounded border border-[var(--border)] bg-[var(--card)] overflow-hidden">
                  {(['percent', 'hours'] as const).map((mode) => {
                    const isActive = inputMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        className={`px-3 py-1 text-xs transition-colors border-r border-[var(--border)] last:border-r-0 ${
                          isActive
                            ? 'bg-[var(--surfaceHover)] text-[var(--text)]'
                            : 'text-[var(--muted)] hover:text-[var(--text)]'
                        }`}
                        onClick={() => setInputMode(mode)}
                      >
                        {mode === 'percent' ? 'Percent' : 'Hours'}
                      </button>
                    );
                  })}
                </div>
                <span className="text-xs text-[var(--muted)]">({fullCapacityHours}h = 100%)</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (selectedTemplateId != null) {
                    void loadTemplateSettings(selectedTemplateId, activePhaseKeys);
                  }
                }}
                disabled={loading || saving || selectedTemplateId == null}
              >
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  void onSaveAll();
                }}
                disabled={dirtyPhases.size === 0 || saving || loading || selectedTemplateId == null}
              >
                {saving ? 'Saving...' : 'Save All'}
              </Button>
            </div>
          </div>

          <div className="bg-[var(--card)]">
            {isMobileLayout && (
              <div className="flex flex-wrap items-center gap-3 px-3 pt-3 border-b border-[var(--border)]">
                <div role="tablist" aria-label="Template phases" className="inline-flex items-center">
                  {phaseOptions
                    .filter((opt) => activePhaseKeys.includes(opt.value))
                    .map((opt) => {
                      const isActive = selectedPhase === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          className={`px-3 py-1 text-sm transition-colors ${
                            isActive
                              ? 'relative bg-[var(--surfaceHover)] text-[var(--text)] font-semibold border border-[var(--border)] border-b-transparent border-t-4 border-t-[var(--primary)] rounded-t -mb-px after:content-[\'\'] after:absolute after:left-0 after:right-0 after:bottom-[-1px] after:h-[2px] after:bg-[var(--card)]'
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
            )}

            <div className="border border-[var(--border)] rounded-b-lg px-3 pb-3 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--muted)] mb-3">
                <span>
                  Set percent of weekly capacity (0-100%) or hours (0-{fullCapacityHours}) for each week leading up to a deliverable.
                </span>
              </div>

              {error && <div className="text-sm text-red-400 mb-3">{error}</div>}

              {Object.entries(phaseErrors)
                .filter(([, message]) => !!message)
                .map(([phase, message]) => (
                  <div key={`phase-error-${phase}`} className="text-sm text-amber-300 mb-2">
                    {phaseLabelByKey.get(phase) || phase.toUpperCase()}: {message}
                  </div>
                ))}

              {templatesLoading ? (
                <div className="text-sm text-[var(--text)] py-4">Loading templates...</div>
              ) : loading ? (
                <div className="text-sm text-[var(--text)] py-4">Loading...</div>
              ) : groupedRoles.length === 0 ? (
                <div className="text-sm text-[var(--muted)] py-4">No roles found.</div>
              ) : isMobileLayout ? (
                renderMobileSinglePhase()
              ) : (
                renderDesktopMatrix()
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AutoHoursTemplatesEditor;
