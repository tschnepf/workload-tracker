import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';

export type CellKey = { rowKey: string; weekKey: string };

export type UseCellSelection = {
  // Lazily computed (for apply actions). Rendering uses O(1) checks.
  selectedCells: CellKey[];
  selectedCell: CellKey | null;
  selectionStart: CellKey | null;
  isDragging: boolean;
  onCellMouseDown: (rowKey: string, weekKey: string, ev?: MouseEvent | React.MouseEvent) => void;
  onCellMouseEnter: (rowKey: string, weekKey: string) => void;
  onCellSelect: (rowKey: string, weekKey: string, isShiftClick?: boolean) => void;
  clearSelection: () => void;
  // O(1) index-based selection check
  isCellSelected: (rowKey: string, weekKey: string) => boolean;
  selectionSummary: string;
};

/**
 * Range-based, throttled selection model optimized for rendering.
 * - Uses index math for O(1) isSelected checks (no large arrays during drag)
 * - rAF-throttles hover updates to avoid excessive re-renders
 * - Provides a lazily computed selectedCells list for apply/save actions
 */
export function useCellSelection(weeks: string[], rowOrder?: string[]): UseCellSelection {
  const [selectedCell, setSelectedCell] = useState<CellKey | null>(null);
  const [selectionStart, setSelectionStart] = useState<CellKey | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Index maps
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

  // Helpers for bounds
  const getWeekBounds = useCallback((a: string, b: string) => {
    const ia = weekIndex.get(a);
    const ib = weekIndex.get(b);
    if (ia == null || ib == null) return { lo: -1, hi: -1 };
    return { lo: Math.min(ia, ib), hi: Math.max(ia, ib) };
  }, [weekIndex]);

  const getRowBounds = useCallback((ra: string, rb: string) => {
    const ia = rowIndex.get(ra);
    const ib = rowIndex.get(rb);
    if (ia == null || ib == null) return { lo: -1, hi: -1, multi: false };
    const lo = Math.min(ia, ib);
    const hi = Math.max(ia, ib);
    return { lo, hi, multi: true };
  }, [rowIndex]);

  // Mouse interactions
  const onCellMouseDown = useCallback((rowKey: string, weekKey: string, ev?: MouseEvent | React.MouseEvent) => {
    try { ev?.preventDefault?.(); } catch {}
    const anchor: CellKey = { rowKey, weekKey };
    setSelectionStart(anchor);
    setSelectedCell(anchor);
    setIsDragging(true);
  }, []);

  // rAF-throttled hover updates
  const lastHoverRef = useRef<{ rowKey: string; weekKey: string } | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const onCellMouseEnter = useCallback((rowKey: string, weekKey: string) => {
    if (!isDragging || !selectionStart) return;
    const last = lastHoverRef.current;
    if (last && last.rowKey === rowKey && last.weekKey === weekKey) return;
    lastHoverRef.current = { rowKey, weekKey };
    if (rafIdRef.current != null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      const next = lastHoverRef.current;
      if (!next) return;
      setSelectedCell({ rowKey: next.rowKey, weekKey: next.weekKey });
    });
  }, [isDragging, selectionStart]);

  const onCellSelect = useCallback((rowKey: string, weekKey: string, isShiftClick?: boolean) => {
    if (isShiftClick && selectionStart) {
      setSelectedCell({ rowKey, weekKey });
      return;
    }
    const single: CellKey = { rowKey, weekKey };
    setSelectionStart(single);
    setSelectedCell(single);
  }, [selectionStart]);

  const clearSelection = useCallback(() => {
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

  // O(1) selection test
  const isCellSelected = useCallback((rowKey: string, weekKey: string) => {
    if (!selectionStart || !selectedCell) return false;
    const { lo: wl, hi: wh } = getWeekBounds(selectionStart.weekKey, selectedCell.weekKey);
    const wIdx = weekIndex.get(weekKey);
    if (wl === -1 || wh === -1 || wIdx == null) return false;
    if (wIdx < wl || wIdx > wh) return false;
    if (rowOrder && rowOrder.length > 0) {
      const { lo: rl, hi: rh, multi } = getRowBounds(selectionStart.rowKey, selectedCell.rowKey);
      if (!multi) return rowKey === selectionStart.rowKey;
      const rIdx = rowIndex.get(rowKey);
      if (rIdx == null) return false;
      return rIdx >= rl && rIdx <= rh;
    }
    return rowKey === selectionStart.rowKey;
  }, [selectionStart, selectedCell, getWeekBounds, getRowBounds, weekIndex, rowIndex, rowOrder]);

  const selectionSummary = useMemo(() => {
    if (!selectionStart || !selectedCell) return '';
    const { lo: wl, hi: wh } = getWeekBounds(selectionStart.weekKey, selectedCell.weekKey);
    if (wl === -1 || wh === -1) return '';
    const weeksCount = wh - wl + 1;
    let rowsCount = 1;
    if (rowOrder && rowOrder.length > 0) {
      const { lo: rl, hi: rh, multi } = getRowBounds(selectionStart.rowKey, selectedCell.rowKey);
      rowsCount = multi ? (rh - rl + 1) : 1;
    }
    const cells = rowsCount * weeksCount;
    return `${rowsCount} row${rowsCount !== 1 ? 's' : ''} × ${weeksCount} week${weeksCount !== 1 ? 's' : ''} = ${cells} cell${cells !== 1 ? 's' : ''}`;
  }, [selectionStart, selectedCell, getWeekBounds, getRowBounds, rowOrder]);

  // Lazily compute cells for actions (e.g., when user presses Enter to apply value)
  const selectedCells = useMemo<CellKey[]>(() => {
    if (!selectionStart || !selectedCell) return [];
    const out: CellKey[] = [];
    const { lo: wl, hi: wh } = getWeekBounds(selectionStart.weekKey, selectedCell.weekKey);
    if (wl === -1 || wh === -1) return [];
    if (rowOrder && rowOrder.length > 0) {
      const { lo: rl, hi: rh, multi } = getRowBounds(selectionStart.rowKey, selectedCell.rowKey);
      if (multi) {
        for (let r = rl; r <= rh; r++) {
          const rk = rowOrder![r];
          for (let w = wl; w <= wh; w++) out.push({ rowKey: rk, weekKey: weeks[w] });
        }
        return out;
      }
    }
    for (let w = wl; w <= wh; w++) out.push({ rowKey: selectionStart.rowKey, weekKey: weeks[w] });
    return out;
  }, [selectionStart, selectedCell, getWeekBounds, getRowBounds, weeks, rowOrder]);

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

