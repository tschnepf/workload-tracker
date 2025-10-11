import React from 'react';

const DeliverablesSectionLoader: React.FC = () => (
  <div className="border border-[var(--border)] rounded-lg p-6 bg-[var(--card)]">
    <div className="flex items-center justify-center py-8">
      <div className="flex items-center space-x-3">
        <div className="animate-spin motion-reduce:animate-none rounded-full h-6 w-6 border-b-2 border-[var(--primary)]"></div>
        <div className="text-[var(--muted)]">Loading deliverables...</div>
      </div>
    </div>
  </div>
);

export default DeliverablesSectionLoader;

