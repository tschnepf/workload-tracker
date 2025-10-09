import React from 'react';
import LegendComp from '@/pages/Assignments/grid/components/Legend';

export interface StatusBarProps {
  labels: { blue: string; green: string; orange: string; red: string };
  selectionSummary?: string;
}

const StatusBar: React.FC<StatusBarProps> = ({ labels, selectionSummary }) => {
  return (
    <div className="flex justify-between items-center text-xs text-[var(--muted)] px-1">
      <LegendComp labels={labels} />
      {selectionSummary ? (
        <div className="px-2 py-0.5 rounded border border-[var(--border)] text-[var(--muted)]">
          {selectionSummary}
        </div>
      ) : null}
    </div>
  );
};

export default StatusBar;

