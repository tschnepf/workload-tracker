import React, { useEffect, useState } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import Card from '../ui/Card';
import { darkTheme } from '../../theme/tokens';
import { peopleApi } from '../../services/api';
import { PersonCapacityHeatmapItem } from '../../types/models';

type Props = {
  weeks?: number;
  department?: string; // department id as string (matches dashboard state)
};

const CapacityHeatmap: React.FC<Props> = ({ weeks = 12, department }) => {
  const [rows, setRows] = useState<PersonCapacityHeatmapItem[]>([]);
  const [loading, setLoading] = useState(true);

  useAuthenticatedEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const data = await peopleApi.capacityHeatmap({ weeks, department });
        setRows(data);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [weeks, department]);

  return (
    <Card className="bg-[#2d2d30] border-[#3e3e42]">
      <h3 className="text-lg font-semibold text-[#cccccc] mb-4">Capacity Heatmap</h3>
      {loading ? (
        <div className="text-[#969696]">Loading heatmap…</div>
      ) : rows.length === 0 ? (
        <div className="text-[#969696]">No data</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: darkTheme.spacing.xs }}>Person</th>
                {rows[0]?.weekKeys?.map((wk) => (
                  <th key={wk} style={{ textAlign: 'center', padding: darkTheme.spacing.xs, fontWeight: 500 }}>{wk.slice(5)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td style={{ padding: darkTheme.spacing.xs }}>{row.name}</td>
                  {row.weekKeys.map((wk) => {
                    const h = row.weekTotals[wk] || 0;
                    const pct = row.weeklyCapacity ? (h / row.weeklyCapacity) * 100 : 0;
                    let bg = darkTheme.colors.semantic.success;
                    if (pct > 100) bg = darkTheme.colors.semantic.error;
                    else if (pct > 85) bg = darkTheme.colors.semantic.warning;
                    else if (pct > 70) bg = darkTheme.colors.brand.primary;
                    return (
                      <td key={wk} title={`${h}h`} style={{
                        padding: darkTheme.spacing.xs,
                        textAlign: 'center',
                        color: darkTheme.colors.text.primary,
                        background: bg + '33'
                      }}>
                        {Math.round(h)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

export default CapacityHeatmap;

