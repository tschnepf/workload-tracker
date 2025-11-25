import React from 'react';
import Card from '@/components/ui/Card';
import { getUtilizationPill, defaultUtilizationScheme } from '@/util/utilization';
import { useUtilizationScheme } from '@/hooks/useUtilizationScheme';

type Props = {
  weekKeys: string[];
  weeklyCapacity: number;
  weekTotals: Record<string, number>;
  className?: string;
};

const MyScheduleStrip: React.FC<Props> = ({ weekKeys, weeklyCapacity, weekTotals, className }) => {
  const { data: schemeData } = useUtilizationScheme();
  const scheme = schemeData || defaultUtilizationScheme;
  const weekLabels = weekKeys.map((wk) => {
    const [year, month, day] = wk.split('-');
    return `${month}/${day}`;
  });
  return (
    <Card className={`bg-[var(--card)] border-[var(--border)] ${className || ''}`}>
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--text)]">My Schedule</h3>
            <p className="text-xs text-[var(--muted)]">Scroll sideways to preview upcoming weeks</p>
          </div>
          <div className="text-xs text-[#94a3b8]">Capacity {weeklyCapacity}h</div>
        </div>
        <div className="relative">
          <div className="sticky left-0 top-0 h-full flex items-center pr-3 bg-gradient-to-r from-[var(--card)] to-transparent text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
            Weeks
          </div>
          <div
            className="overflow-x-auto pl-12 snap-x snap-mandatory pb-2"
            aria-label="Upcoming weeks utilization"
            role="list"
          >
            <div className="min-w-[320px] flex gap-4">
              {weekKeys.map((wk, idx) => {
                const hours = weekTotals[wk] || 0;
                const pill = getUtilizationPill({ hours, capacity: weeklyCapacity || 0, scheme, output: 'token' });
                const bg = pill.tokens?.bg || '#10b981';
                return (
                  <div
                    key={wk}
                    className="w-20 shrink-0 snap-center flex flex-col items-center gap-2 border border-[var(--border)] rounded-lg p-2 bg-[var(--surface)]"
                    role="listitem"
                    aria-label={`Week of ${weekLabels[idx]}: ${Math.round(hours)} hours booked`}
                  >
                    <div className="text-xs text-[var(--muted)] font-medium sticky top-2 text-center w-full bg-[var(--surface)]/80">
                      {weekLabels[idx]}
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <div className="text-xs text-[var(--muted)]">{Math.round(hours)}h</div>
                      <div
                        title={`${wk} · ${Math.round(hours)}h`}
                        className="w-12 h-12 rounded-lg border border-[var(--border)]"
                        style={{ background: bg, opacity: 0.9 }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default MyScheduleStrip;
