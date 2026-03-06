import React, { useEffect, useState } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import Card from '../ui/Card';
import { useUtilizationScheme } from '@/hooks/useUtilizationScheme';
import { getUtilizationPill, defaultUtilizationScheme } from '@/util/utilization';
import { peopleApi } from '../../services/api';
import { PersonCapacityHeatmapItem } from '../../types/models';
import InlineAlert from '@/components/ui/InlineAlert';

type Props = {
  weeks?: number;
  department?: string; // department id as string (matches dashboard state)
};

const CapacityHeatmap: React.FC<Props> = ({ weeks = 12, department }) => {
  const [rows, setRows] = useState<PersonCapacityHeatmapItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { data: schemeData } = useUtilizationScheme();

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
    <Card variant="surface">
      <h3 className="mb-4 text-lg font-semibold text-[var(--color-text-primary)]">Capacity Heatmap</h3>
      {loading ? (
        <InlineAlert tone="info">Loading heatmap...</InlineAlert>
      ) : rows.length === 0 ? (
        <InlineAlert tone="info">No data</InlineAlert>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="px-2 py-1 text-left text-sm text-[var(--color-text-primary)]">Person</th>
                {rows[0]?.weekKeys?.map((wk) => (
                  <th key={wk} className="px-2 py-1 text-center text-sm font-medium text-[var(--color-text-primary)]">{wk.slice(5)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-2 py-1 text-[var(--color-text-primary)]">{row.name}</td>
                  {row.weekKeys.map((wk) => {
                    const h = row.weekTotals[wk] || 0;
                    const pill = getUtilizationPill({ hours: h, capacity: row.weeklyCapacity || 0, scheme: schemeData || defaultUtilizationScheme, output: 'token' });
                    const bg = `color-mix(in srgb, ${pill.tokens?.bg || 'var(--color-state-success)'} 28%, transparent)`;
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
    </Card>
  );
};

export default CapacityHeatmap;
