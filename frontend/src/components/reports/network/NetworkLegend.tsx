import React from 'react';

const itemClass = 'inline-flex items-center gap-2 px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface)] text-xs';

const Dot: React.FC<{ color: string }> = ({ color }) => (
  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
);

const NetworkLegend: React.FC = () => {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={itemClass}><Dot color="#3b82f6" />Person</span>
      <span className={itemClass}><Dot color="#14b8a6" />Project</span>
      <span className={itemClass}><Dot color="#f59e0b" />Client</span>
      <span className={itemClass}>Edges scale by score</span>
    </div>
  );
};

export default NetworkLegend;
