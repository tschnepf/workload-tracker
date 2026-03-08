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
    const [, month, day] = wk.split('-');
    return `${month}/${day}`;
  });
  return (
    <Card className={`bg-[var(--card)] border-[var(--border)] h-full min-h-0 ${className || ''}`}>
      <div className="p-4 h-full min-h-0 flex flex-col">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--text)]">My Schedule</h3>
            <p className="text-xs text-[var(--muted)]">Weekly personal utilization heatmap</p>
          </div>
          <div className="text-xs text-[var(--chart-neutral)]">Capacity {weeklyCapacity}h</div>
        </div>
        <div className="mt-3 min-h-0 flex-1 flex flex-col">
          <div
            className="min-h-0 overflow-x-auto overflow-y-hidden pb-1"
            aria-label="Upcoming weeks utilization"
            role="list"
          >
            <div className="inline-grid min-w-max grid-flow-col auto-cols-[3.125rem] gap-1.5 pr-2">
              {weekKeys.map((wk, idx) => {
                const hours = weekTotals[wk] || 0;
                const pill = getUtilizationPill({ hours, capacity: weeklyCapacity || 0, scheme, output: 'token' });
                const bg = pill.tokens?.bg || 'var(--color-state-success)';
                return (
                  <div
                    key={wk}
                    className="shrink-0 flex flex-col items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)]/55 px-1.5 py-1.5"
                    role="listitem"
                    aria-label={`Week of ${weekLabels[idx]}: ${Math.round(hours)} hours booked`}
                  >
                    <div className="w-full text-center text-[10px] font-medium text-[var(--muted)]">
                      {weekLabels[idx]}
                    </div>
                    <div
                      title={`${wk} · ${Math.round(hours)}h`}
                      className="h-5 w-5 rounded-[var(--radius-xs)] border border-[var(--border)]"
                      style={{ background: bg, opacity: 0.9 }}
                    />
                    <div className="text-[10px] font-semibold text-[var(--text)]">{Math.round(hours)}h</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-[var(--muted)]">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-[var(--radius-xs)] bg-[var(--color-state-info)]" /> 0-70%</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-[var(--radius-xs)] bg-[var(--color-state-success)]" /> 71-85%</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-[var(--radius-xs)] bg-[var(--color-state-warning)]" /> 86-100%</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-[var(--radius-xs)] bg-[var(--color-state-danger)]" /> 100%+</span>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default MyScheduleStrip;
