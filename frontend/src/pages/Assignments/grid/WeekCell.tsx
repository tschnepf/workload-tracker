import React from 'react';
import type { DeliverableMarker } from '@/pages/Assignments/projectAssignments/types';

export type WeekCellProps = {
  assignmentId: number;
  weekKey: string;
  hours: number;
  isSaving: boolean;
  deliverableMarkers: DeliverableMarker[];
  tooltip?: string;
  typeColors: Record<string, string>;
  isEditing: boolean;
  editingValue: string;
  onEditValueChange: (value: string) => void;
  onBeginEditing: (assignmentId: number, weekKey: string, seed?: string) => void;
  onCommitEditing: (assignmentId: number, weekKey: string, value: number) => void;
  onCancelEditing: () => void;
  onMouseDown: (assignmentId: number, weekKey: string, e?: MouseEvent | React.MouseEvent) => void;
  onMouseEnter: (assignmentId: number, weekKey: string) => void;
  onSelect: (assignmentId: number, weekKey: string, isShiftClick?: boolean) => void;
};

export const WeekCell: React.FC<WeekCellProps> = React.memo((props) => {
  const {
    assignmentId,
    weekKey,
    hours,
    isSaving,
    deliverableMarkers,
    tooltip,
    typeColors,
    isEditing,
    editingValue,
    onEditValueChange,
    onBeginEditing,
    onCommitEditing,
    onCancelEditing,
    onMouseDown,
    onMouseEnter,
    onSelect,
  } = props;

  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement | HTMLInputElement> = (e) => {
    if (e.currentTarget instanceof HTMLInputElement) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const v = parseFloat(editingValue);
        onCommitEditing(assignmentId, weekKey, v);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancelEditing();
      }
      return;
    }

    if (isEditing) return;

    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      const seed = e.key;
      onBeginEditing(assignmentId, weekKey, seed);
      return;
    }
    if (e.key === '.' || e.key === 'Decimal') {
      e.preventDefault();
      const seed = '0.';
      onBeginEditing(assignmentId, weekKey, seed);
      return;
    }
    if (e.key === 'Enter') {
      const seed = hours ? String(hours) : '';
      onBeginEditing(assignmentId, weekKey, seed);
    } else if (e.key === 'Escape') {
      onCancelEditing();
    }
  };

  const entries = deliverableMarkers;

  return (
    <div
      className="relative cursor-pointer transition-colors border-l border-[var(--border)] hover:bg-[var(--surfaceHover)]"
      data-week-cell-editing={isEditing ? 'true' : undefined}
      onMouseDown={(e) => {
        e.preventDefault();
        const isShift = (e as any).shiftKey;
        onMouseDown(assignmentId, weekKey, e as any);
        if (isShift) {
          onSelect(assignmentId, weekKey, true);
        }
      }}
      onMouseEnter={() => onMouseEnter(assignmentId, weekKey)}
      onDoubleClick={() => {
        const seed = hours ? String(hours) : '';
        onBeginEditing(assignmentId, weekKey, seed);
      }}
      title={tooltip}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {isEditing ? (
        <input
          autoFocus
          value={editingValue}
          onChange={(e) => onEditValueChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full h-8 px-1 text-xs bg-[var(--bg)] text-[var(--text)] font-medium border border-[var(--primary)] rounded focus:outline-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield] [appearance:textfield] text-center"
        />
      ) : (
        <div className="h-8 flex items-center justify-center text-xs text-[var(--text)] font-medium">
          {hours > 0 ? hours : ''}
        </div>
      )}
      {entries.length > 0 && (
        <div className="absolute right-0 top-1 bottom-1 flex items-stretch gap-0.5 pr-[2px] pointer-events-none">
          {entries.slice(0, 3).map((e, idx) => (
            <div key={idx} className="w-[3px] rounded" style={{ background: typeColors[e.type] || 'var(--primary)' }} />
          ))}
        </div>
      )}
      {isSaving && (
        <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="inline-block w-3 h-3 border-2 border-[var(--muted)] border-t-transparent rounded-full animate-spin" />
        </span>
      )}
    </div>
  );
});

WeekCell.displayName = 'WeekCell';
