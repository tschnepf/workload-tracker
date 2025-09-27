import React from 'react';

const Bar: React.FC<{ w?: string; h?: string }>= ({ w = '100%', h = '12px' }) => (
  <div className="bg-[#3e3e42] rounded animate-pulse" style={{ width: w, height: h }} />
);

const ProjectsSkeleton: React.FC = () => {
  return (
    <div className="h-full min-h-0 flex bg-[#1e1e1e]" role="status" aria-live="polite" aria-busy="true">
      {/* Left list */}
      <div className="w-1/2 border-r border-[#3e3e42] flex flex-col min-w-0 min-h-0 p-3">
        <div className="mb-3 flex items-center justify-between">
          <Bar w="120px" h="18px" />
          <Bar w="60px" h="24px" />
        </div>
        <div className="space-y-2 overflow-y-auto">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="grid grid-cols-8 gap-2 px-2 py-1.5">
              <Bar w="80%" />
              <div className="col-span-3">
                <Bar w="90%" />
                <div className="mt-1"><Bar w="60%" /></div>
              </div>
              <Bar w="50%" />
              <Bar w="70%" />
            </div>
          ))}
        </div>
      </div>
      {/* Right panel */}
      <div className="flex-1 p-4 space-y-3">
        <Bar w="30%" h="24px" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Bar key={i} w="100%" h="16px" />
        ))}
      </div>
      <span className="sr-only">Loading projects…</span>
    </div>
  );
};

export default ProjectsSkeleton;
