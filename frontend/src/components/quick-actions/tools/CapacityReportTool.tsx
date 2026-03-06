import React, { useEffect, useState } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import { peopleApi } from '../../../services/api';
import InlineAlert from '@/components/ui/InlineAlert';
import PanelHeader from '@/components/ui/PanelHeader';

interface Props { onClose: () => void }

const CapacityReportTool: React.FC<Props> = () => {
  const [heatmap, setHeatmap] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useAuthenticatedEffect(() => {
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
    <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_2fr]">
      <div className="space-y-2 border-b border-[var(--color-border)] pb-4 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
        <PanelHeader title="Summary" />
        <div className="text-sm text-[var(--color-text-secondary)]">
          Team capacity vs allocation across upcoming weeks.
        </div>
      </div>
      <div>
        {loading ? (
          <InlineAlert tone="info">Loading heatmap...</InlineAlert>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-2 py-1 text-left text-sm text-[var(--color-text-primary)]">Person</th>
                  {heatmap[0]?.weekKeys?.map((wk: string) => (
                    <th key={wk} className="px-2 py-1 text-center text-sm font-medium text-[var(--color-text-primary)]">{wk.slice(5)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmap.map((row: any) => (
                  <tr key={row.id}>
                    <td className="px-2 py-1 text-[var(--color-text-primary)]">{row.name}</td>
                    {row.weekKeys.map((wk: string) => {
                      const h = row.weekTotals[wk] || 0;
                      const pct = row.weeklyCapacity ? (h / row.weeklyCapacity) * 100 : 0;
                      let bg = 'var(--color-surface)';
                      if (pct > 100) bg = 'color-mix(in srgb, var(--color-state-danger) 25%, transparent)';
                      else if (pct > 85) bg = 'color-mix(in srgb, var(--color-state-warning) 25%, transparent)';
                      else if (pct > 70) bg = 'color-mix(in srgb, var(--color-action-primary) 25%, transparent)';
                      else bg = 'color-mix(in srgb, var(--color-state-success) 25%, transparent)';
                      return (
                        <td
                          key={wk}
                          title={`${h}h`}
                          className="px-2 py-1 text-center text-[var(--color-text-primary)]"
                          style={{ background: bg }}
                        >
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
      </div>
    </div>
  );
};

export default CapacityReportTool;
