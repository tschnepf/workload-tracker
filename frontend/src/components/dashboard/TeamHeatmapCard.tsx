import React from 'react';
import Card from '../ui/Card';
import { darkTheme } from '../../theme/tokens';
import { PersonCapacityHeatmapItem } from '../../types/models';

type Props = {
  data: PersonCapacityHeatmapItem[];
  weeks: number;
  onWeeksChange: (w: number) => void;
};

const cellBg = (pct: number) => {
  if (pct > 100) return darkTheme.colors.utilization.overallocated;
  if (pct > 85) return darkTheme.colors.utilization.high;
  if (pct > 70) return darkTheme.colors.utilization.optimal;
  return darkTheme.colors.utilization.available;
};

const TeamHeatmapCard: React.FC<Props> = ({ data, weeks, onWeeksChange }) => {
  const weekKeys = data[0]?.weekKeys || [];

  return (
    <Card className="lg:col-span-2 bg-[#2d2d30] border-[#3e3e42]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-[#cccccc]">Team Utilization Heat Map</h3>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[#969696]">Weeks:</span>
          {[4, 8, 12].map((w) => (
            <button
              key={w}
              onClick={() => onWeeksChange(w)}
              className={`px-2 py-0.5 rounded ${weeks === w ? 'bg-[#007acc] text-white' : 'bg-[#3e3e42] text-[#969696] hover:text-[#cccccc]'}`}
              aria-pressed={weeks === w}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: darkTheme.spacing.xs, width: '30%' }}>Person</th>
              {weekKeys.map((wk: string) => (
                <th key={wk} style={{ textAlign: 'center', padding: 4, whiteSpace: 'nowrap' }}>{wk.slice(5)}</th>
              ))}
            </tr>
          </thead>
        </table>
      </div>

      <div style={{ maxHeight: '16rem', overflowY: 'auto', overflowX: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {data.map((row) => (
              <tr key={row.id}>
                <td style={{ padding: darkTheme.spacing.xs, color: darkTheme.colors.text.primary }}>{row.name}</td>
                {weekKeys.map((wk: string) => {
                  const h = row.weekTotals[wk] || 0;
                  const pct = row.weeklyCapacity ? (h / row.weeklyCapacity) * 100 : 0;
                  const bg = cellBg(pct);
                  return (
                    <td key={wk} title={`${wk} — ${Math.round(h)}h`} style={{ padding: 2 }}>
                      <div style={{
                        width: 16,
                        height: 16,
                        background: bg,
                        opacity: 0.7,
                        borderRadius: 3,
                        border: `1px solid ${darkTheme.colors.border.secondary}`,
                        margin: '0 auto'
                      }} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-4 text-xs text-[#969696]">
        <div className="flex items-center gap-2"><span style={{ width: 12, height: 12, background: darkTheme.colors.utilization.available, display: 'inline-block', borderRadius: 2 }}></span> 0–70%</div>
        <div className="flex items-center gap-2"><span style={{ width: 12, height: 12, background: darkTheme.colors.utilization.optimal, display: 'inline-block', borderRadius: 2 }}></span> 70–85%</div>
        <div className="flex items-center gap-2"><span style={{ width: 12, height: 12, background: darkTheme.colors.utilization.high, display: 'inline-block', borderRadius: 2 }}></span> 85–100%</div>
        <div className="flex items-center gap-2"><span style={{ width: 12, height: 12, background: darkTheme.colors.utilization.overallocated, display: 'inline-block', borderRadius: 2 }}></span> 100%+</div>
      </div>
    </Card>
  );
};

export default TeamHeatmapCard;

