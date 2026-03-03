import { useMemo, useState } from 'react';
import type { Assignment } from '@/types/models';
import { useCellSelection } from '@/pages/Assignments/grid/useCellSelection';
import { useGridKeyboardNavigation } from '@/pages/Assignments/grid/useGridKeyboardNavigation';
import { toWeekHeader } from '@/pages/Assignments/grid/utils';
import { applyHoursToCellsOptimistic } from '@/assignments/updateHoursOptimistic';
import { buildWeekKeys } from '@/pages/Projects/list/components/projectDetailsPanel.utils';

interface Params {
  assignments: Assignment[];
  currentWeekKey?: string;
  projectId?: number;
  reloadAssignments: (projectId: number) => Promise<void>;
  invalidateFilterMeta: () => Promise<void>;
}

/**
 * Reuses Assignments-grid selection/editing behavior for project details week cells.
 */
export function useAssignmentWeekGridEditing({
  assignments,
  currentWeekKey,
  projectId,
  reloadAssignments,
  invalidateFilterMeta,
}: Params) {
  const weekKeys = useMemo(() => buildWeekKeys(currentWeekKey), [currentWeekKey]);
  const rowOrder = useMemo(() => assignments.map((a) => String(a.id)), [assignments]);
  const selection = useCellSelection(weekKeys, rowOrder);

  const [editingCell, setEditingCell] = useState<{ personId: number; assignmentId: number; week: string } | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [optimisticHours, setOptimisticHours] = useState<Map<number, Record<string, number>>>(new Map());

  const isCellSelected = (assignmentId: number, weekKey: string) => selection.isCellSelected(String(assignmentId), weekKey);
  const isEditingCell = (assignmentId: number, weekKey: string) => editingCell?.assignmentId === assignmentId && editingCell?.week === weekKey;
  const onCellMouseDown = (assignmentId: number, weekKey: string) => selection.onCellMouseDown(String(assignmentId), weekKey);
  const onCellMouseEnter = (assignmentId: number, weekKey: string) => selection.onCellMouseEnter(String(assignmentId), weekKey);
  const onCellSelect = (assignmentId: number, weekKey: string, isShift: boolean) => selection.onCellSelect(String(assignmentId), weekKey, isShift);

  const onEditStartCell = (assignmentId: number, weekKey: string, currentValue: string) => {
    const assignment = assignments.find((x) => x.id === assignmentId);
    setEditingCell({ personId: assignment?.person || 0, assignmentId, week: weekKey });
    setEditingValue(currentValue);
  };

  const onEditCancelCell = () => {
    setEditingCell(null);
  };

  const onEditSaveCell = async () => {
    if (!editingCell) return;

    const value = parseFloat(editingValue);
    if (Number.isNaN(value)) {
      setEditingCell(null);
      return;
    }

    const selectedCells = selection.getSelectedCells();
    const cells = selectedCells.length > 0
      ? selectedCells.map((c) => ({ assignmentId: Number(c.rowKey), weekKey: c.weekKey }))
      : [{ assignmentId: editingCell.assignmentId, weekKey: editingCell.week }];

    const baseMaps = new Map<number, Record<string, number>>();
    assignments.forEach((assignment) => baseMaps.set(assignment.id!, { ...(assignment.weeklyHours || {}) }));
    const getMap = (assignmentId: number) => baseMaps.get(assignmentId) || {};

    const applyLocally = (updates: Map<number, Record<string, number>>) => {
      setOptimisticHours((prev) => {
        const next = new Map(prev);
        updates.forEach((map, assignmentId) => {
          next.set(assignmentId, { ...map });
        });
        return next;
      });
    };

    const revertLocally = (prev: Map<number, Record<string, number>>) => {
      setOptimisticHours(new Map(prev));
    };

    const afterSuccess = async () => {
      if (!projectId) return;
      try {
        await reloadAssignments(projectId);
        await invalidateFilterMeta();
        setOptimisticHours(new Map());
      } catch {}
    };

    try {
      await applyHoursToCellsOptimistic({ cells, value, getMap, applyLocally, revertLocally, afterSuccess });
    } finally {
      setEditingCell(null);
      selection.clearSelection();
    }
  };

  const onEditValueChangeCell = (v: string) => setEditingValue(v);

  const weeksHeader = useMemo(() => toWeekHeader(weekKeys), [weekKeys]);
  const selectedCellForKb = useMemo(() => {
    const selectedCell = selection.selectedCell;
    if (!selectedCell) return null as any;
    const assignmentId = Number(selectedCell.rowKey);
    const assignment = assignments.find((x) => x.id === assignmentId);
    return assignment ? { personId: assignment.person, assignmentId, week: selectedCell.weekKey } : null;
  }, [assignments, selection.selectedCell]);

  useGridKeyboardNavigation({
    selectedCell: selectedCellForKb,
    editingCell,
    isAddingAssignment: false,
    weeks: weeksHeader,
    csSelect: (rowKey, week, isShift) => selection.onCellSelect(rowKey, week, isShift),
    setEditingCell: ({ personId, assignmentId, week }) => setEditingCell({ personId, assignmentId, week }),
    setEditingValue: (val) => setEditingValue(val),
    findAssignment: (personId, assignmentId) => assignments.some((a) => a.id === assignmentId && a.person === personId),
  });

  return {
    weekKeys,
    editingValue,
    optimisticHours,
    isCellSelected,
    isEditingCell,
    onCellSelect,
    onCellMouseDown,
    onCellMouseEnter,
    onEditStartCell,
    onEditSaveCell,
    onEditCancelCell,
    onEditValueChangeCell,
  } as const;
}
