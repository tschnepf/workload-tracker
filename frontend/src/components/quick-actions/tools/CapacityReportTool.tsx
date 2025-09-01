import React, { useEffect, useState } from 'react';
import { darkTheme } from '../../../theme/tokens';
import { peopleApi } from '../../../services/api';

interface Props { onClose: () => void }

const CapacityReportTool: React.FC<Props> = () => {
  const [heatmap, setHeatmap] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      try {
        const data = await peopleApi.capacityHeatmap({ weeks: 12 });
        setHeatmap(data);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: darkTheme.spacing.md }}>
      <div style={{ borderRight: `1px solid ${darkTheme.colors.border.secondary}`, paddingRight: darkTheme.spacing.md }}>
        <div style={{ color: darkTheme.colors.text.secondary, marginBottom: darkTheme.spacing.sm }}>Summary</div>
        <div style={{ fontSize: darkTheme.typography.fontSize.sm, color: darkTheme.colors.text.muted }}>
          Team capacity vs allocation across upcoming weeks.
        </div>
      </div>
      <div>
        {loading ? (
          <div style={{ color: darkTheme.colors.text.muted }}>Loading heatmap…</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: darkTheme.spacing.xs }}>Person</th>
                  {heatmap[0]?.weekKeys?.map((wk: string) => (
                    <th key={wk} style={{ textAlign: 'center', padding: darkTheme.spacing.xs, fontWeight: 500 }}>{wk.slice(5)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmap.map((row: any) => (
                  <tr key={row.id}>
                    <td style={{ padding: darkTheme.spacing.xs }}>{row.name}</td>
                    {row.weekKeys.map((wk: string) => {
                      const h = row.weekTotals[wk] || 0;
                      const pct = row.weeklyCapacity ? (h / row.weeklyCapacity) * 100 : 0;
                      let bg = darkTheme.colors.background.tertiary;
                      if (pct > 100) bg = darkTheme.colors.semantic.error;
                      else if (pct > 85) bg = darkTheme.colors.semantic.warning;
                      else if (pct > 70) bg = darkTheme.colors.brand.primary;
                      else bg = darkTheme.colors.semantic.success;
                      return (
                        <td key={wk} title={`${h}h`} style={{
                          padding: darkTheme.spacing.xs,
                          textAlign: 'center',
                          color: darkTheme.colors.text.primary,
                          background: bg + '33'
                        }}>{Math.round(h)}</td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default CapacityReportTool;
