import React from 'react';
import type { WeekHeader } from '@/pages/Assignments/grid/utils';

export interface EmptyStateRowProps {
  weeks: WeekHeader[];
  gridTemplate: string;
}

const EmptyStateRow: React.FC<EmptyStateRowProps> = ({ weeks, gridTemplate }) => {
  return (
    <div className="grid gap-px p-1 bg-[var(--surface)]" style={{ gridTemplateColumns: gridTemplate }}>
      <div className="col-span-2 flex items-center py-1 pl-[60px] pr-2">
        <div className="text-[var(--muted)] text-xs italic">No assignments</div>
      </div>
      <div></div>
      {weeks.map((week) => (
        <div key={week.date} className="flex items-center justify-center">
          <div className="w-12 h-6 flex items-center justify-center text-[var(--muted)] text-xs"></div>
        </div>
      ))}
    </div>
  );
};

export default EmptyStateRow;
