import { useEffect } from 'react';
import type { WeekHeader } from '@/pages/Assignments/grid/utils';

export interface GridKeyboardArgs {
  selectedCell: { personId: number; assignmentId: number; week: string } | null;
  editingCell: { personId: number; assignmentId: number; week: string } | null;
  isAddingAssignment: boolean;
  weeks: WeekHeader[];
  csSelect: (rowKey: string, week: string, isShift: boolean) => void;
  setEditingCell: (cell: { personId: number; assignmentId: number; week: string }) => void;
  setEditingValue: (val: string) => void;
  findAssignment: (personId: number, assignmentId: number) => boolean;
}

export function useGridKeyboardNavigation({ selectedCell, editingCell, isAddingAssignment, weeks, csSelect, setEditingCell, setEditingValue, findAssignment }: GridKeyboardArgs) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedCell || editingCell || isAddingAssignment) return;

      const { personId, assignmentId, week } = selectedCell;
      if (!findAssignment(personId, assignmentId)) return;

      const currentWeekIndex = weeks.findIndex(w => w.date === week);

      if (/^[0-9.]$/.test(e.key)) {
        e.preventDefault();
        setEditingCell({ personId, assignmentId, week });
        setEditingValue(e.key);
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (currentWeekIndex < weeks.length - 1) {
          const nextCell = { personId, assignmentId, week: weeks[currentWeekIndex + 1].date };
          csSelect(`${nextCell.personId}:${nextCell.assignmentId}`, nextCell.week, false);
        }
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        if (currentWeekIndex < weeks.length - 1) {
          const nextCell = { personId, assignmentId, week: weeks[currentWeekIndex + 1].date };
          csSelect(`${nextCell.personId}:${nextCell.assignmentId}`, nextCell.week, e.shiftKey);
        }
        return;
      }

      let newCell: { personId: number; assignmentId: number; week: string } | null = null;
      switch (e.key) {
        case 'ArrowLeft':
          if (currentWeekIndex > 0) newCell = { personId, assignmentId, week: weeks[currentWeekIndex - 1].date };
          break;
        case 'ArrowRight':
          if (currentWeekIndex < weeks.length - 1) newCell = { personId, assignmentId, week: weeks[currentWeekIndex + 1].date };
          break;
      }

      if (newCell) {
        e.preventDefault();
        csSelect(`${newCell.personId}:${newCell.assignmentId}`, newCell.week, e.shiftKey);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCell, editingCell, isAddingAssignment, weeks, csSelect, setEditingCell, setEditingValue, findAssignment]);
}

export type UseGridKeyboardNavigationReturn = ReturnType<typeof useGridKeyboardNavigation>;

