import React from 'react';
import Card from '@/components/ui/Card';

type RecentAssignment = {
  person: string;
  project: string;
  role?: string | null;
  created: string;
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const RecentAssignmentsCard: React.FC<{
  assignments: RecentAssignment[];
  className?: string;
}> = ({ assignments, className }) => {
  const items = React.useMemo(() => {
    return [...(assignments || [])].sort((a, b) => {
      const aTime = new Date(a.created).getTime();
      const bTime = new Date(b.created).getTime();
      return bTime - aTime;
    });
  }, [assignments]);

  return (
    <Card className={`rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_10px_28px_rgba(0,0,0,0.25)] flex flex-col min-h-[240px] ${className ?? ''}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[var(--text)]">Recent Assignments</h3>
          <div className="text-xs text-[var(--muted)]">Last 7 days</div>
        </div>
        <span className="text-xs text-[var(--muted)]">{items.length}</span>
      </div>

      <div className="mt-4 flex-1 min-h-0 overflow-y-auto pr-2">
        {items.length === 0 ? (
          <div className="text-sm text-[var(--muted)]">No assignments in the last 7 days.</div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_minmax(0,1fr)_auto] items-center gap-3 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
              <div>Name</div>
              <div>Project</div>
              <div>Project Role</div>
              <div className="text-right">Date</div>
            </div>
            {items.map((item, idx) => (
              <div
                key={`${item.person}-${item.project}-${item.created}-${idx}`}
                className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_minmax(0,1fr)_auto] items-center gap-3 border-b border-white/10 pb-3 last:border-b-0 last:pb-0"
              >
                <div className="min-w-0 text-sm font-semibold text-[var(--text)] truncate">{item.person}</div>
                <div className="min-w-0 text-sm text-[var(--text)] truncate">{item.project}</div>
                <div className="min-w-0 text-sm text-[var(--muted)] truncate">{item.role || '—'}</div>
                <div className="text-xs text-[var(--muted)] whitespace-nowrap">{formatDate(item.created)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
};

export default RecentAssignmentsCard;
