import React from 'react';
import { darkTheme } from '../../theme/tokens';

type Props = {
  weekKeys: string[];
  weeklyCapacity: number;
  weekTotals: Record<string, number>;
  size?: number; // cell size in px
};

const CompactHeatStrip: React.FC<Props> = ({ weekKeys, weeklyCapacity, weekTotals, size = 10 }) => {
  const cells = weekKeys.map((wk) => {
    const h = weekTotals[wk] || 0;
    const pct = weeklyCapacity ? (h / weeklyCapacity) * 100 : 0;
    let bg = darkTheme.colors.utilization.available;
    if (pct > 100) bg = darkTheme.colors.utilization.overallocated;
    else if (pct > 85) bg = darkTheme.colors.utilization.high;
    else if (pct > 70) bg = darkTheme.colors.utilization.optimal;

    return (
      <div
        key={wk}
        title={`${wk} — ${Math.round(h)}h`}
        aria-label={`${wk} — ${Math.round(h)} hours`}
        style={{
          width: size,
          height: size,
          background: bg,
          opacity: 0.6,
          borderRadius: 2,
          marginRight: 4,
          border: `1px solid ${darkTheme.colors.border.secondary}`,
        }}
      />
    );
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {cells}
    </div>
  );
};

export default CompactHeatStrip;

