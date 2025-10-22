import React from 'react';
import type { WeekHeader as WeekHeaderType } from '@/pages/Assignments/grid/utils';

export interface WeekHeaderProps {
  top: number | string;
  minWidth: number | string;
  gridTemplate: string;
  weeks: WeekHeaderType[];
  onStartResize: (column: 'client' | 'project', e: React.MouseEvent) => void;
  scrollRef?: React.Ref<HTMLDivElement>;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
  onClientClick?: () => void;
  onWeeksClick?: () => void;
}

const WeekHeader: React.FC<WeekHeaderProps> = ({ top, minWidth, gridTemplate, weeks, onStartResize, scrollRef, onScroll, onClientClick, onWeeksClick }) => {
  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="sticky left-0 right-0 bg-[var(--card)] border-b border-[var(--border)] z-20 overflow-x-auto"
      style={{ top, marginTop: 0 }}
    >
      <div style={{ minWidth }}>
        <div className="grid gap-px p-2" style={{ gridTemplateColumns: gridTemplate }}>
          <div
            className={`font-medium text-[var(--text)] text-sm px-2 py-1 relative group ${onClientClick ? 'cursor-pointer hover:text-[var(--text)]' : ''}`}
            onClick={onClientClick}
            role={onClientClick ? 'button' : undefined}
            aria-label={onClientClick ? 'Sort by client' : undefined}
            title={onClientClick ? 'Sort by Client' : undefined}
          >
            Client
            <div
              className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize bg-transparent hover:bg-[var(--surfaceHover)] transition-colors"
              onMouseDown={(e) => onStartResize('client', e)}
              title="Drag to resize client column"
            />
          </div>

          <div className="font-medium text-[var(--text)] text-sm px-2 py-1 relative group">
            Project
            <div
              className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize bg-transparent hover:bg-[var(--surfaceHover)] transition-colors"
              onMouseDown={(e) => onStartResize('project', e)}
              title="Drag to resize project column"
            />
          </div>

          <div className="text-center text-xs text-[var(--muted)] px-1">+/-</div>
          {weeks.map((week, index) => (
            <div
              key={week.date}
              className={`text-center px-1 ${onWeeksClick ? 'cursor-pointer select-none hover:text-[var(--text)]' : ''}`}
              onClick={onWeeksClick}
              role={onWeeksClick ? 'columnheader' : undefined}
              aria-label={onWeeksClick ? `Week starting ${week.display}` : undefined}
              title={onWeeksClick ? 'Sort by next deliverable date' : undefined}
            >
              <div className="text-xs font-medium text-[var(--text)]">{week.display}</div>
              <div className="text-[10px] text-[var(--muted)]">W{index + 1}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WeekHeader;
