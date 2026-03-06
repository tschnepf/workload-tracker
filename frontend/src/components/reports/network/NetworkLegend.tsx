import React from 'react';

const itemClass = 'inline-flex items-center gap-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text-primary)]';

const Dot: React.FC<{ color: string }> = ({ color }) => (
  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
);

const NetworkLegend: React.FC = () => {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={itemClass}><Dot color="var(--chart-person)" />Person</span>
      <span className={itemClass}><Dot color="var(--chart-project)" />Project</span>
      <span className={itemClass}><Dot color="var(--chart-client)" />Client</span>
      <span className={itemClass}>Edges scale by score</span>
    </div>
  );
};

export default NetworkLegend;
