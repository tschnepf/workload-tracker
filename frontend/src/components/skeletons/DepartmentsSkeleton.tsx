import React from 'react';

const Bar: React.FC<{ w?: string; h?: string }>= ({ w = '100%', h = '12px' }) => (
  <div className="bg-[var(--color-border)] rounded animate-pulse" style={{ width: w, height: h }} />
);

const DepartmentsSkeleton: React.FC = () => {
  return (
    <div className="h-full min-h-0 flex bg-[var(--color-bg)]" role="status" aria-live="polite" aria-busy="true">
      <div className="w-1/3 p-6 border-r border-[var(--color-border)] bg-[var(--color-surface)] min-h-0">
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <Bar w="140px" h="22px" />
            <Bar w="90px" h="30px" />
          </div>
          <Bar w="100%" h="32px" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div key={idx} className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded">
              <Bar w="60%" />
              <div className="mt-2"><Bar w="40%" /></div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 p-6 space-y-3">
        <Bar w="30%" h="24px" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Bar key={i} w="100%" h="16px" />
        ))}
      </div>
      <span className="sr-only">Loading departments…</span>
    </div>
  );
};

export default DepartmentsSkeleton;
