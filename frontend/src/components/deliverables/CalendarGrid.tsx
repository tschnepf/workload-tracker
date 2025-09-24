import React from 'react';
import { fmtDate, typeColors, classify, buildEventLabel, buildPreLabel, startOfWeekSunday } from './calendar.utils';

type Props = {
  items: any[];
  anchor: Date;
  weeksCount: number;
  showPre: boolean;
  className?: string;
};

const CalendarGrid: React.FC<Props> = ({ items, anchor, weeksCount, showPre, className }) => {
  const weeks: Date[][] = React.useMemo(() => {
    const out: Date[][] = [];
    const baseSunday = startOfWeekSunday(anchor);
    for (let w = 0; w < weeksCount; w++) {
      const row: Date[] = [];
      const base = new Date(baseSunday);
      base.setDate(base.getDate() + 7 * w);
      for (let d = 0; d < 7; d++) {
        const day = new Date(base);
        day.setDate(base.getDate() + d);
        row.push(day);
      }
      out.push(row);
    }
    return out;
  }, [anchor, weeksCount]);

  const dateMap = React.useMemo(() => {
    const m = new Map<string, any[]>();
    for (const it of items || []) {
      const dt = (it as any).date as string | null;
      if (!dt) continue;
      if ((it as any).itemType === 'pre_deliverable' && !showPre) continue;
      if (!m.has(dt)) m.set(dt, []);
      m.get(dt)!.push(it);
    }
    return m;
  }, [items, showPre]);

  const isToday = (d: Date) => fmtDate(d) === fmtDate(new Date());

  return (
    <div className={className}>
      <div className="min-w-[600px] border border-[#3e3e42] rounded">
        {/* Header row: Sun..Sat */}
        <div className="grid grid-cols-7 text-xs text-[#94a3b8] bg-[#232327]">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
            <div key={d} className="px-2 py-2 border-r border-[#3e3e42] last:border-r-0">{d}</div>
          ))}
        </div>
        {/* Weeks */}
        <div>
          {weeks.map((row, i) => (
            <div key={i} className="grid grid-cols-7 border-t border-[#3e3e42]">
              {row.map((d, j) => {
                const key = fmtDate(d);
                // subtle month shading palette
                const anchorIdx = anchor.getFullYear() * 12 + anchor.getMonth();
                const cellIdx = d.getFullYear() * 12 + d.getMonth();
                let monthOffset = cellIdx - anchorIdx;
                const monthShades = ['#2d2d30', '#2a2a2e', '#26262a', '#232327', '#1f1f24'];
                if (monthOffset < 0) monthOffset = 0;
                const monthBg = monthShades[monthOffset % monthShades.length];
                const dayItems = (dateMap.get(key) || []).sort((a, b) => (('projectName' in a ? a.projectName||'' : '')).localeCompare(('projectName' in b ? b.projectName||'' : '')));
                return (
                  <div key={j} className="border-r border-[#3e3e42] last:border-r-0 p-2 align-top" style={{ position: 'relative', background: monthBg }}>
                    <div className="text-xs text-[#94a3b8] mb-1 flex items-center gap-1">
                      <span className={`inline-block px-1 rounded ${isToday(d) ? 'bg-[#007acc] text-white' : ''}`}>{d.getDate()}</span>
                    </div>
                    <div className="space-y-1">
                      {dayItems.map((ev) => {
                        const isPre = (ev as any).itemType === 'pre_deliverable';
                        const type = isPre ? 'pre_deliverable' : classify(ev);
                        const color = typeColors[type] || typeColors.milestone;
                        const label = isPre ? buildPreLabel(ev) : buildEventLabel(ev);
                        return (
                          <div
                            key={`${ev.id}-${(ev as any).date}`}
                            title={label}
                            className={`text-xs text-white rounded px-2 py-1 truncate ${isPre ? 'border' : ''}`}
                            style={{ background: color, border: isPre ? '1px solid rgba(147, 197, 253, 0.25)' : undefined }}
                          >
                            {label}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CalendarGrid;

