import { useState, useCallback } from 'react';

export function useEditingCell() {
  const [editingCell, setEditingCell] = useState<{ personId: number; assignmentId: number; week: string } | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');

  const startEditing = useCallback((personId: number, assignmentId: number, week: string, currentValue: string) => {
    setEditingCell({ personId, assignmentId, week });
    setEditingValue(currentValue);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
  }, []);

  const sanitizeHours = useCallback((val: string | number, max: number = 168): number => {
    const n = typeof val === 'number' ? val : parseFloat(val);
    if (!isFinite(n) || isNaN(n)) return 0;
    if (n < 0) return 0;
    return n > max ? max : n;
  }, []);

  return { editingCell, setEditingCell, editingValue, setEditingValue, startEditing, cancelEdit, sanitizeHours } as const;
}

