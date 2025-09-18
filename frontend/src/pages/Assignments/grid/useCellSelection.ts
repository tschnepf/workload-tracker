import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';

export type CellKey = { rowKey: string; weekKey: string };

export type UseCellSelection = {
  selectedCells: CellKey[];
  selectedCell: CellKey | null;
  selectionStart: CellKey | null;
  isDragging: boolean;
  onCellMouseDown: (rowKey: string, weekKey: string, ev?: MouseEvent | React.MouseEvent) => void;
  onCellMouseEnter: (rowKey: string, weekKey: string) => void;
  onCellSelect: (rowKey: string, weekKey: string, isShiftClick?: boolean) => void;
  clearSelection: () => void;
  isCellSelected: (rowKey: string, weekKey: string) => boolean;
  selectionSummary: string;
};

/**
 * Generic, row-scoped cell selection hook for spreadsheet-like grids.
 * - Selection range is limited to a single row (rowKey) across contiguous week columns
 * - Shift+Click selects a contiguous range between anchor and target within the same row
 * - Drag selection: mouse down anchors; mouse enter extends range until mouse up
 * - Consumers provide ordered `weeks` (YYYY-MM-DD) to determine range semantics
 */
export function useCellSelection(weeks: string[], rowOrder?: string[]): UseCellSelection {
  const [selectedCells, setSelectedCells] = useState<CellKey[]>([]);
  const [selectedCell, setSelectedCell] = useState<CellKey | null>(null);
  const [selectionStart, setSelectionStart] = useState<CellKey | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const weekIndex = useMemo(() => {
    const map = new Map<string, number>();
    weeks.forEach((w, i) => map.set(w, i));
    return map;
  }, [weeks]);
  const rowIndex = useMemo(() => {
    const map = new Map<string, number>();
    (rowOrder || []).forEach((rk, i) => map.set(rk, i));
    return map;
  }, [rowOrder]);

  const buildRange = useCallback((rowKey: string, a: string, b: string): CellKey[] => {
    const ia = weekIndex.get(a);
    const ib = weekIndex.get(b);
    if (ia == null || ib == null) return [{ rowKey, weekKey: a }];
    const lo = Math.min(ia, ib);
    const hi = Math.max(ia, ib);
    const range: CellKey[] = [];
    for (let i = lo; i <= hi; i++) range.push({ rowKey, weekKey: weeks[i] });
    return range;
  }, [weekIndex, weeks]);

  const onCellMouseDown = useCallback((rowKey: string, weekKey: string, ev?: MouseEvent | React.MouseEvent) => {
    try { ev?.preventDefault?.(); } catch {}
    const anchor: CellKey = { rowKey, weekKey };
    setSelectionStart(anchor);
    setSelectedCell(anchor);
    setSelectedCells([anchor]);
    setIsDragging(true);
  }, []);

  const onCellMouseEnter = useCallback((rowKey: string, weekKey: string) => {
    if (!isDragging || !selectionStart) return;
    const startRow = selectionStart.rowKey;
    const startWeek = selectionStart.weekKey;
    const idxA = rowIndex.get(startRow);
    const idxB = rowIndex.get(rowKey);
    const hasRowOrder = idxA != null && idxB != null;

    // Build rectangular selection across rows (if row order provided)
    if (hasRowOrder && rowOrder && rowOrder.length > 0) {
      const lo = Math.min(idxA!, idxB!);
      const hi = Math.max(idxA!, idxB!);
      const rangeWeeks = buildRange('', startWeek, weekKey).map(c => c.weekKey);
      const out: CellKey[] = [];
      for (let i = lo; i <= hi; i++) {
        const rk = rowOrder[i];
        rangeWeeks.forEach(wk => out.push({ rowKey: rk, weekKey: wk }));
      }
      setSelectedCells(out);
      setSelectedCell({ rowKey, weekKey });
      return;
    }

    // Fallback: same-row range only
    if (rowKey !== startRow) return;
    const range = buildRange(rowKey, startWeek, weekKey);
    setSelectedCells(range);
    setSelectedCell({ rowKey, weekKey });
  }, [isDragging, selectionStart, buildRange, rowIndex, rowOrder]);

  const onCellSelect = useCallback((rowKey: string, weekKey: string, isShiftClick?: boolean) => {
    if (isShiftClick && selectionStart) {
      const idxA = rowIndex.get(selectionStart.rowKey);
      const idxB = rowIndex.get(rowKey);
      const hasRowOrder = idxA != null && idxB != null && rowOrder && rowOrder.length > 0;
      if (hasRowOrder) {
        const lo = Math.min(idxA!, idxB!);
        const hi = Math.max(idxA!, idxB!);
        const rangeWeeks = buildRange('', selectionStart.weekKey, weekKey).map(c => c.weekKey);
        const out: CellKey[] = [];
        for (let i = lo; i <= hi; i++) {
          const rk = rowOrder![i];
          rangeWeeks.forEach(wk => out.push({ rowKey: rk, weekKey: wk }));
        }
        setSelectedCells(out);
        setSelectedCell({ rowKey, weekKey });
        return;
      }
      // Fallback same-row
      if (selectionStart.rowKey === rowKey) {
        const range = buildRange(rowKey, selectionStart.weekKey, weekKey);
        setSelectedCells(range);
        setSelectedCell({ rowKey, weekKey });
        return;
      }
    }
    const single: CellKey = { rowKey, weekKey };
    setSelectionStart(single);
    setSelectedCell(single);
    setSelectedCells([single]);
  }, [selectionStart, buildRange, rowIndex, rowOrder]);

  const clearSelection = useCallback(() => {
    setSelectedCells([]);
    setSelectedCell(null);
    setSelectionStart(null);
    setIsDragging(false);
  }, []);

  // End drag on global mouseup
  const draggingRef = useRef(isDragging);
  useEffect(() => { draggingRef.current = isDragging; }, [isDragging]);
  useEffect(() => {
    const onUp = () => { if (draggingRef.current) setIsDragging(false); };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, []);

  const isCellSelected = useCallback((rowKey: string, weekKey: string) => {
    if (selectedCells.length === 0) return false;
    return selectedCells.some(c => c.rowKey === rowKey && c.weekKey === weekKey);
  }, [selectedCells]);

  const selectionSummary = useMemo(() => {
    if (selectedCells.length === 0) return '';
    // Summarize by row. Most selections are single-row ranges, but support multi-row gracefully.
    const byRow = new Map<string, number>();
    selectedCells.forEach(c => byRow.set(c.rowKey, (byRow.get(c.rowKey) || 0) + 1));
    const rows = byRow.size;
    const cells = selectedCells.length;
    const weeksCount = rows === 0 ? 0 : Math.round(cells / rows);
    return `${rows} row${rows !== 1 ? 's' : ''} × ${weeksCount} week${weeksCount !== 1 ? 's' : ''} = ${cells} cell${cells !== 1 ? 's' : ''}`;
  }, [selectedCells]);

  return {
    selectedCells,
    selectedCell,
    selectionStart,
    isDragging,
    onCellMouseDown,
    onCellMouseEnter,
    onCellSelect,
    clearSelection,
    isCellSelected,
    selectionSummary,
  };
}
