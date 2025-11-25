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
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-[var(--text)]">My Schedule</h3>
          <div className="text-xs text-[#94a3b8]">Capacity {weeklyCapacity}h</div>
        </div>
        <div className="relative">
          <div className="sticky left-0 top-0 h-full flex items-center pr-3 bg-gradient-to-r from-[var(--card)] to-transparent text-xs font-semibold text-[var(--muted)]">
            Weeks
          </div>
          <div className="overflow-x-auto pl-12" aria-label="Upcoming weeks utilization">
            <div className="min-w-[320px]">
              <div className="flex gap-4 text-xs text-[var(--muted)] sticky top-0 bg-[var(--card)] pb-2">
                {weekLabels.map((label, idx) => (
                  <div key={`label-${weekKeys[idx]}`} className="w-16 text-center shrink-0">
                    {label}
                  </div>
                ))}
              </div>
              <div className="flex gap-4 items-center">
                {weekKeys.map((wk) => {
                  const hours = weekTotals[wk] || 0;
                  const pill = getUtilizationPill({ hours, capacity: weeklyCapacity || 0, scheme, output: 'token' });
                  const bg = pill.tokens?.bg || '#10b981';
                  return (
                    <div key={wk} className="w-16 shrink-0 flex flex-col items-center gap-2">
                      <div className="text-xs text-[var(--muted)]">{Math.round(hours)}h</div>
                      <div
                        title={`${wk} · ${Math.round(hours)}h`}
                        className="w-10 h-10 rounded-lg border border-[var(--border)]"
                        style={{ background: bg, opacity: 0.85 }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default MyScheduleStrip;
