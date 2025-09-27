import React from 'react';

const Bar: React.FC<{ w?: string; h?: string }>= ({ w = '100%', h = '12px' }) => (
  <div className="bg-[#3e3e42] rounded animate-pulse" style={{ width: w, height: h }} />
);

const AssignmentsSkeleton: React.FC = () => {
  return (
    <div className="p-6" role="status" aria-live="polite" aria-busy="true">
      <div className="mb-4 flex items-center gap-4">
        <Bar w="160px" h="18px" />
        <Bar w="120px" h="18px" />
        <Bar w="200px" h="18px" />
      </div>
      {/* Header row */}
      <div className="grid gap-px mb-2" style={{ gridTemplateColumns: '220px 320px 40px repeat(8, 1fr)' }}>
        <Bar w="100%" />
        <Bar w="100%" />
        <Bar w="100%" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Bar key={i} w="100%" />
        ))}
      </div>
      {/* A few rows */}
      {Array.from({ length: 6 }).map((_, r) => (
        <div key={r} className="grid gap-px mb-1" style={{ gridTemplateColumns: '220px 320px 40px repeat(8, 1fr)' }}>
          <Bar w="70%" />
          <Bar w="60%" />
          <Bar w="60%" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center justify-center">
              <Bar w="40px" />
            </div>
          ))}
        </div>
      ))}
      <span className="sr-only">Loading assignments…</span>
    </div>
  );
};

export default AssignmentsSkeleton;
