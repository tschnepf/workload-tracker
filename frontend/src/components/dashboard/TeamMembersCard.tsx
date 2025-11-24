import React from 'react';
import Card from '@/components/ui/Card';
import type { DashboardHeatmapRow } from '@/mobile/dashboardAdapters';

interface TeamMembersCardProps {
  rows: DashboardHeatmapRow[];
  loading: boolean;
  className?: string;
  title?: string;
}

const TeamMembersCard: React.FC<TeamMembersCardProps> = ({
  rows,
  loading,
  className,
  title = 'Team Members',
}) => {
  return (
    <Card className={`bg-[var(--card)] border-[var(--border)] ${className ?? ''}`}>
      <h3 className="text-lg font-semibold text-[var(--text)] mb-3">{title}</h3>
      {rows && rows.length > 0 ? (
        <div className="text-sm">
          {(() => {
            const counts = new Map<string, number>();
            for (const row of rows) {
              const dept = row.department || 'Unassigned';
              counts.set(dept, (counts.get(dept) || 0) + 1);
            }
            const items = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
            const total = rows.length;
            return (
              <div className="space-y-1">
                {items.map(([dept, count]) => (
                  <div key={dept} className="flex justify-between">
                    <span className="text-[var(--text)]">{dept}</span>
                    <span className="text-[var(--muted)]">{count}</span>
                  </div>
                ))}
                <div className="mt-3 border-t border-[var(--border)] pt-2 flex justify-between font-medium">
                  <span className="text-[var(--text)]">Total</span>
                  <span className="text-[var(--text)]">{total}</span>
                </div>
              </div>
            );
          })()}
        </div>
      ) : (
        <div className="text-[var(--muted)] text-sm">{loading ? 'Loading…' : 'No data'}</div>
      )}
    </Card>
  );
};

export default TeamMembersCard;
