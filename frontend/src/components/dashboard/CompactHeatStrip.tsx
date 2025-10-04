import React from 'react';
import { darkTheme } from '../../theme/tokens';
import { useUtilizationScheme } from '@/hooks/useUtilizationScheme';
import { getUtilizationPill, defaultUtilizationScheme } from '@/util/utilization';

type Props = {
  weekKeys: string[];
  weeklyCapacity: number;
  weekTotals: Record<string, number>;
  size?: number; // cell size in px
};

const CompactHeatStrip: React.FC<Props> = ({ weekKeys, weeklyCapacity, weekTotals, size = 10 }) => {
  const { data: schemeData } = useUtilizationScheme();
  const cells = weekKeys.map((wk) => {
    const h = weekTotals[wk] || 0;
    const pill = getUtilizationPill({ hours: h, capacity: weeklyCapacity || 0, scheme: schemeData || defaultUtilizationScheme, output: 'token' });
    const bg = pill.tokens?.bg || darkTheme.colors.utilization.available;

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
