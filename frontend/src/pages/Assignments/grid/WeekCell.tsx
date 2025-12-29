import React from 'react';
import { formatDateWithWeekday } from '@/utils/dates';
import type { DeliverableMarker } from '../ProjectAssignmentsGrid';

export type WeekCellProps = {
  projectId: number;
  assignmentId: number;
  weekKey: string;
  rowIndex: number;
  weekIndex: number;
  hours: number;
  isSelected: boolean;
  isSaving: boolean;
  deliverableMarkers: DeliverableMarker[];
  typeColors: Record<string, string>;
  isEditing: boolean;
  editingSeed: string | null;
  onBeginEditing: (assignmentId: number, weekKey: string, seed?: string) => void;
  onCommitEditing: (assignmentId: number, weekKey: string, value: number) => void;
  onCancelEditing: () => void;
  onMouseDown: (assignmentId: number, weekKey: string, e?: MouseEvent | React.MouseEvent) => void;
  onMouseEnter: (assignmentId: number, weekKey: string) => void;
  onSelect: (assignmentId: number, weekKey: string, isShiftClick?: boolean) => void;
};

export const WeekCell: React.FC<WeekCellProps> = React.memo((props) => {
  const {
    projectId,
    assignmentId,
    weekKey,
    rowIndex,
    weekIndex,
    hours,
    isSelected,
    isSaving,
    deliverableMarkers,
    typeColors,
    isEditing,
    editingSeed,
    onBeginEditing,
    onCommitEditing,
    onCancelEditing,
    onMouseDown,
    onMouseEnter,
    onSelect,
  } = props;

  const [value, setValue] = React.useState<string>('');
  const wasEditingRef = React.useRef(false);

  // Initialize local value when editing starts
  React.useEffect(() => {
    if (isEditing && !wasEditingRef.current) {
      const initial = editingSeed != null ? editingSeed : (hours > 0 ? String(hours) : '');
      setValue(initial);
      wasEditingRef.current = true;
    } else if (!isEditing && wasEditingRef.current) {
      wasEditingRef.current = false;
    }
  }, [isEditing, editingSeed, hours]);

  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement | HTMLInputElement> = (e) => {
    if (e.currentTarget instanceof HTMLInputElement) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const v = parseFloat(value);
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
      setValue(seed);
      onBeginEditing(assignmentId, weekKey, seed);
      return;
    }
    if (e.key === '.' || e.key === 'Decimal') {
      e.preventDefault();
      const seed = '0.';
      setValue(seed);
      onBeginEditing(assignmentId, weekKey, seed);
      return;
    }
    if (e.key === 'Enter') {
      const seed = hours ? String(hours) : '';
      setValue(seed);
      onBeginEditing(assignmentId, weekKey, seed);
    } else if (e.key === 'Escape') {
      onCancelEditing();
    }
  };

  const title = React.useMemo(() => {
    if (!deliverableMarkers.length) return undefined;
    const dtHeader = formatDateWithWeekday(weekKey);
    return deliverableMarkers
      .flatMap((m) => {
        const dates = (m as any).dates as string[] | undefined;
        const base = `${m.percentage != null ? `${m.percentage}% ` : ''}${m.type.toUpperCase()}`;
        if (dates && dates.length) {
          return dates.map((d) => `${formatDateWithWeekday(d)} — ${base}`);
        }
        return [`${dtHeader} — ${base}`];
      })
      .join('\n');
  }, [deliverableMarkers, weekKey]);

  const entries = deliverableMarkers;

  return (
    <div
      className={`relative cursor-pointer transition-colors border-l border-[var(--border)] ${
        isSelected ? 'bg-[var(--surfaceOverlay)] border-[var(--primary)]' : 'hover:bg-[var(--surfaceHover)]'
      }`}
      onMouseDown={(e) => { e.preventDefault(); onMouseDown(assignmentId, weekKey, e as any); }}
      onMouseEnter={() => onMouseEnter(assignmentId, weekKey)}
      onClick={(e) => onSelect(assignmentId, weekKey, (e as any).shiftKey)}
      onDoubleClick={() => {
        const seed = hours ? String(hours) : '';
        setValue(seed);
        onBeginEditing(assignmentId, weekKey, seed);
      }}
      aria-selected={isSelected}
      title={title}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {isEditing ? (
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
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
