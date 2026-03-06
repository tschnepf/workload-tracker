import React from 'react';
import Card from '../ui/Card';
import { useUtilizationScheme } from '@/hooks/useUtilizationScheme';
import { getUtilizationPill, defaultUtilizationScheme, utilizationLevelToTokens } from '@/util/utilization';
import { PersonCapacityHeatmapItem } from '../../types/models';
import Button from '@/components/ui/Button';

type Props = {
  data: PersonCapacityHeatmapItem[];
  weeks: number;
  onWeeksChange: (w: number) => void;
};

const TeamHeatmapCard: React.FC<Props> = ({ data, weeks, onWeeksChange }) => {
  const weekKeys = data[0]?.weekKeys || [];
  const { data: schemeData } = useUtilizationScheme();

  return (
    <Card className="lg:col-span-2" variant="surface">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">Team Utilization Heat Map</h3>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[var(--color-text-secondary)]">Weeks:</span>
          {[4, 8, 12].map((w) => (
            <Button
              key={w}
              onClick={() => onWeeksChange(w)}
              size="xs"
              variant={weeks === w ? 'primary' : 'secondary'}
              className={weeks === w ? '' : 'text-[var(--color-text-secondary)]'}
              aria-pressed={weeks === w}
            >
              {w}
            </Button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="w-[30%] px-2 py-1 text-left text-sm text-[var(--color-text-primary)]">Person</th>
              {weekKeys.map((wk: string) => (
                <th key={wk} className="whitespace-nowrap px-1 py-1 text-center text-sm text-[var(--color-text-primary)]">{wk.slice(5)}</th>
              ))}
            </tr>
          </thead>
        </table>
      </div>

      <div className="max-h-64 overflow-y-auto overflow-x-hidden">
        <table className="w-full border-collapse">
          <tbody>
            {data.map((row) => (
              <tr key={row.id}>
                <td className="px-2 py-1 text-[var(--color-text-primary)]">{row.name}</td>
                {weekKeys.map((wk: string) => {
                  const h = row.weekTotals[wk] || 0;
                  const pill = getUtilizationPill({ hours: h, capacity: row.weeklyCapacity || 0, scheme: schemeData || defaultUtilizationScheme, output: 'token' });
                  const bg = pill.tokens?.bg || 'var(--color-state-success)';
                  return (
                    <td key={wk} title={`${wk}: ${Math.round(h)}h`} className="px-1 py-0.5">
                      <div
                        className="mx-auto h-4 w-4 rounded-[var(--radius-xs)] border border-[var(--color-border)] opacity-70"
                        style={{ background: bg }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend (hours when scheme is absolute; percent otherwise) */}
      {(() => {
        const s = schemeData || defaultUtilizationScheme;
        const labels = s.mode === 'absolute_hours'
          ? [
              `${s.blue_min}-${s.blue_max}h`,
              `${s.green_min}-${s.green_max}h`,
              `${s.orange_min}-${s.orange_max}h`,
              `${s.red_min}h+`,
            ]
          : ['0-70%', '70-85%', '85-100%', '100%+'];
        const blue = utilizationLevelToTokens('blue').bg;
        const green = utilizationLevelToTokens('green').bg;
        const orange = utilizationLevelToTokens('orange').bg;
        const red = utilizationLevelToTokens('red').bg;
        return (
          <div className="mt-3 flex items-center gap-4 text-xs text-[var(--color-text-secondary)]">
            <div className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-[var(--radius-xs)]" style={{ background: blue }}></span> {labels[0]}</div>
            <div className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-[var(--radius-xs)]" style={{ background: green }}></span> {labels[1]}</div>
            <div className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-[var(--radius-xs)]" style={{ background: orange }}></span> {labels[2]}</div>
            <div className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-[var(--radius-xs)]" style={{ background: red }}></span> {labels[3]}</div>
          </div>
        );
      })()}
    </Card>
  );
};

export default TeamHeatmapCard;
