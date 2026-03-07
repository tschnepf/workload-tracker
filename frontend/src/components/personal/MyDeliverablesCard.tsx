import React from 'react';
import Card from '@/components/ui/Card';

export type DeliverableItem = { id: number; project: number; projectName: string | null; title: string; date: string | null; isCompleted: boolean };

const MyDeliverablesCard: React.FC<{ deliverables: DeliverableItem[]; className?: string }> = ({ deliverables, className }) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const upcoming = deliverables
    .filter(d => !d.isCompleted && d.date && d.date >= todayStr)
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  return (
    <Card className={`bg-[var(--card)] border-[var(--border)] h-full min-h-0 ${className || ''}`}>
      <div className="p-4 h-full min-h-0 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-[var(--text)]">My Deliverables</h3>
          <div className="text-xs text-[#94a3b8]">{upcoming.length}</div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {upcoming.length === 0 ? (
            <div className="text-[var(--muted)] text-sm">No upcoming deliverables</div>
          ) : (
            <ul className="space-y-2 text-sm">
              {upcoming.map(d => (
                <li key={d.id} className="flex items-center justify-between gap-2">
                  <div className="text-[var(--text)] min-w-0 truncate">{d.title}{d.projectName ? <span className="text-[#94a3b8]"> · {d.projectName}</span> : null}</div>
                  <div className="text-[#94a3b8] shrink-0">{d.date || '—'}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
};

export default MyDeliverablesCard;
