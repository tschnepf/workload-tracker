import React from 'react';
import Card from '@/components/ui/Card';

export type DeliverableItem = { id: number; project: number; projectName: string | null; title: string; date: string | null; isCompleted: boolean };

const MyDeliverablesCard: React.FC<{ deliverables: DeliverableItem[]; className?: string }> = ({ deliverables, className }) => {
  const upcoming = deliverables.filter(d => !d.isCompleted).slice(0, 5);
  return (
    <Card className={`bg-[#2d2d30] border-[#3e3e42] ${className || ''}`}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-[#cccccc]">My Deliverables</h3>
          <div className="text-xs text-[#94a3b8]">{deliverables.length}</div>
        </div>
        {upcoming.length === 0 ? (
          <div className="text-[#969696] text-sm">No upcoming deliverables</div>
        ) : (
          <ul className="space-y-2 text-sm">
            {upcoming.map(d => (
              <li key={d.id} className="flex items-center justify-between">
                <div className="text-[#cccccc]">{d.title}{d.projectName ? <span className="text-[#94a3b8]"> · {d.projectName}</span> : null}</div>
                <div className="text-[#94a3b8]">{d.date || '—'}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
};

export default MyDeliverablesCard;

