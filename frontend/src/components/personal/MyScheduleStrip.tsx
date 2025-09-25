import React from 'react';
import Card from '@/components/ui/Card';

type Props = {
  weekKeys: string[];
  weeklyCapacity: number;
  weekTotals: Record<string, number>;
  className?: string;
};

const MyScheduleStrip: React.FC<Props> = ({ weekKeys, weeklyCapacity, weekTotals, className }) => {
  return (
    <Card className={`bg-[var(--card)] border-[var(--border)] ${className || ''}`}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-[var(--text)]">My Schedule</h3>
          <div className="text-xs text-[#94a3b8]">Capacity {weeklyCapacity}h</div>
        </div>
        <div className="flex gap-2 items-center" aria-label="Next weeks utilization">
          {weekKeys.map((wk) => {
            const hours = weekTotals[wk] || 0;
            const pct = weeklyCapacity ? (hours / weeklyCapacity) * 100 : 0;
            let bg = '#10b981';
            if (pct > 100) bg = '#ef4444';
            else if (pct > 85) bg = '#f59e0b';
            else if (pct > 70) bg = '#3b82f6';
            return (
              <div key={wk} title={`${wk} · ${Math.round(hours)}h`} style={{ width: 16, height: 16, background: bg, opacity: 0.75, borderRadius: 3, border: '1px solid #64748b' }} />
            );
          })}
        </div>
      </div>
    </Card>
  );
};

export default MyScheduleStrip;

