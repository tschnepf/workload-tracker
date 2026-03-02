import React from 'react';
import type { Deliverable } from '@/types/models';
import { useDeliverableBars } from '@/pages/Assignments/grid/useDeliverableBars';

export interface WeekCellProps {
  weekKey: string;
  isSelected: boolean;
  isEditing: boolean;
  isLocked?: boolean;
  lockedTooltip?: string;
  currentHours: number;
  onSelect: (isShift: boolean) => void;
  onMouseDown: () => void;
  onMouseEnter: () => void;
  onEditStart: () => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  editingValue: string;
  onEditValueChange: (v: string) => void;
  deliverablesForWeek: Deliverable[];
}

const WeekCell: React.FC<WeekCellProps> = ({ isSelected, isEditing, isLocked = false, lockedTooltip, currentHours, onSelect, onMouseDown, onMouseEnter, onEditStart, onEditSave, onEditCancel, editingValue, onEditValueChange, deliverablesForWeek }) => {
  const { entries, hasDeliverable, tooltip, colorFor } = useDeliverableBars(deliverablesForWeek);
  const title = isLocked ? (lockedTooltip || tooltip) : tooltip;

  return (
    <div
      className={`
        relative transition-colors border-l border-[var(--border)]
        ${isLocked ? 'cursor-not-allowed bg-[var(--surface)]/70' : 'cursor-pointer'}
        ${!isLocked && isSelected ? 'bg-[var(--surfaceHover)] border-[var(--primary)]' : ''}
        ${!isLocked && !isSelected ? 'hover:bg-[var(--surfaceHover)]' : ''}
      `}
      data-week-cell-editing={isEditing ? 'true' : undefined}
      onClick={(e) => { if (!isLocked) onSelect((e as any).shiftKey); }}
      onMouseDown={(e) => { if (isLocked) return; e.preventDefault(); onMouseDown(); }}
      onMouseEnter={() => { if (!isLocked) onMouseEnter(); }}
      onDoubleClick={() => { if (!isLocked) onEditStart(); }}
      title={title}
    >
      {isEditing && !isLocked ? (
        <input
          type="number"
          value={editingValue}
          onChange={(e) => onEditValueChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onEditSave();
            if (e.key === 'Escape') onEditCancel();
          }}
          className="w-full h-8 px-1 text-xs bg-[var(--surface)] text-[var(--text)] border border-[var(--border)] focus:border-[var(--focus)] rounded focus:outline-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield] [appearance:textfield]"
          autoFocus
        />
      ) : (
        <div className={`h-8 flex items-center justify-center text-xs ${isLocked ? 'text-[var(--muted)]' : 'text-[var(--text)]'}`}>
          {currentHours > 0 ? currentHours : ''}
        </div>
      )}
      {hasDeliverable && (
        <div className="absolute right-0 top-1 bottom-1 flex items-stretch gap-0.5 pr-[2px] pointer-events-none">
          {entries.slice(0,3).map((e, idx) => (
            <div key={idx} className="w-[3px] rounded" style={{ background: colorFor(e.type) }} />
          ))}
        </div>
      )}
    </div>
  );
};

export default WeekCell;
