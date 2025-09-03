import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../../components/layout/Layout';
import Card from '../../components/ui/Card';
import { deliverablesApi } from '../../services/api';
import { DeliverableCalendarItem } from '../../types/models';
import { darkTheme } from '../../theme/tokens';

function fmtDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfWeekSunday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay(); // 0=Sun
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

const typeColors: Record<string, string> = {
  bulletin: '#3b82f6',
  cd: '#fb923c',
  dd: '#818cf8',
  ifc: '#06b6d4',
  ifp: '#f472b6',
  masterplan: '#a78bfa',
  sd: '#f59e0b',
  milestone: '#64748b',
};

function classify(item: DeliverableCalendarItem): string {
  const t = (item.title || '').toLowerCase();
  if (/(\b)bulletin(\b)/.test(t)) return 'bulletin';
  if (/(\b)cd(\b)/.test(t)) return 'cd';
  if (/(\b)dd(\b)/.test(t)) return 'dd';
  if (/(\b)ifc(\b)/.test(t)) return 'ifc';
  if (/(\b)ifp(\b)/.test(t)) return 'ifp';
  if (/(master ?plan)/.test(t)) return 'masterplan';
  if (/(\b)sd(\b)/.test(t)) return 'sd';
  return 'milestone';
}

function buildEventLabel(ev: DeliverableCalendarItem): string {
  const base = (ev.title || '').trim();
  const client = (ev.projectClient || '').trim();
  const proj = (ev.projectName || `Project ${ev.project}` || '').trim();
  const extras = [client, proj].filter(Boolean).join(' ');
  return extras ? `${base} - ${extras}` : base;
}

function buildTooltip(ev: DeliverableCalendarItem): string {
  const client = (ev.projectClient || '').trim();
  const proj = (ev.projectName || `Project ${ev.project}` || '').trim();
  const parts = [client, proj].filter(Boolean).join(' ');
  return parts ? `${ev.title} - ${parts}` : (ev.title || 'Deliverable');
}

const MilestoneCalendarPage: React.FC = () => {
  const [anchor, setAnchor] = useState<Date>(() => startOfWeekSunday(new Date()));
  const [weeksCount, setWeeksCount] = useState<number>(8);
  const start = useMemo(() => fmtDate(anchor), [anchor]);
  const end = useMemo(() => {
    const d = new Date(anchor);
    d.setDate(d.getDate() + 7 * weeksCount - 1);
    return fmtDate(d);
  }, [anchor, weeksCount]);

  const [items, setItems] = useState<DeliverableCalendarItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await deliverablesApi.calendar(start, end);
        if (active) setItems(data || []);
      } catch (e: any) {
        if (active) setError(e?.message || 'Failed to load calendar');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [start, end]);

  const dateMap = useMemo(() => {
    const m = new Map<string, DeliverableCalendarItem[]>();
    for (const it of items) {
      if (!it.date) continue;
      if (!m.has(it.date)) m.set(it.date, []);
      m.get(it.date)!.push(it);
    }
    return m;
  }, [items]);

  const weeks: Date[][] = useMemo(() => {
    const rows: Date[][] = [];
    let day = new Date(anchor);
    for (let r = 0; r < weeksCount; r++) {
      const row: Date[] = [];
      for (let c = 0; c < 7; c++) {
        row.push(new Date(day));
        day.setDate(day.getDate() + 1);
      }
      rows.push(row);
    }
    return rows;
  }, [anchor, weeksCount]);

  const goPrev = () => {
    const d = new Date(anchor);
    d.setDate(d.getDate() - 7);
    setAnchor(startOfWeekSunday(d));
  };
  const goNext = () => {
    const d = new Date(anchor);
    d.setDate(d.getDate() + 7);
    setAnchor(startOfWeekSunday(d));
  };

  const isToday = (d: Date) => {
    const t = new Date();
    return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
  };

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[#cccccc]">{`Deliverables Calendar (${weeksCount} Weeks)`}</h1>
            <p className="text-[#969696] mt-1">Weeks start on Sunday; current week at top</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={goPrev} className="px-3 py-1.5 text-sm rounded bg-[#3e3e42] text-[#cbd5e1] hover:bg-[#4e4e52]">&lt; Prev Week</button>
            <button onClick={goNext} className="px-3 py-1.5 text-sm rounded bg-[#3e3e42] text-[#cbd5e1] hover:bg-[#4e4e52]">Next Week &gt;</button>
            <div className="flex items-center gap-2 ml-2">
              <span className="text-sm text-[#cbd5e1]">Weeks:</span>
              {[8, 12, 16].map((w) => (
                <button
                  key={w}
                  onClick={() => setWeeksCount(w)}
                  aria-pressed={weeksCount === w}
                  className={`px-2 py-1 text-xs rounded transition-colors ${weeksCount === w ? "bg-[#007acc] text-white" : "bg-[#3e3e42] text-[#cbd5e1] hover:bg-[#4e4e52]"}`}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
          <Card className="bg-[#2d2d30] border-[#3e3e42]">
            <div className="grid grid-cols-7 border-b border-[#3e3e42]">
              {dayNames.map((n) => (
                <div key={n} className="px-3 py-2 text-sm font-medium text-[#cbd5e1] border-r border-[#3e3e42] last:border-r-0">{n}</div>
              ))}
            </div>
            {loading ? (
              <div className="p-4 text-[#969696]">Loading calendar...</div>
            ) : error ? (
              <div className="p-4 text-red-400">{error}</div>
            ) : (
              <div>
                {weeks.map((row, i) => (
                  <div key={i} className="grid grid-cols-7 border-b border-[#3e3e42] min-h-[96px]">
                    {row.map((d, j) => {
                      const key = fmtDate(d);
                      const isFirst = d.getDate() === 1;
                      const monthShort = d.toLocaleDateString('en-US', { month: 'short' });
                      const anchorIdx = anchor.getFullYear() * 12 + anchor.getMonth();
                      const cellIdx = d.getFullYear() * 12 + d.getMonth();
                      let monthOffset = cellIdx - anchorIdx;
                      // Use a 5-shade rolling palette for month backgrounds
                      const monthShades = ['#2d2d30', '#2a2a2e', '#26262a', '#232327', '#1f1f24'];
                      if (monthOffset < 0) monthOffset = 0; // don't special-shade prior-month spill
                      const monthBg = monthShades[monthOffset % monthShades.length];
                      const dayItems = (dateMap.get(key) || []).sort((a, b) => (a.projectName || '').localeCompare(b.projectName || ''));
                      return (
                        <div key={j} className="border-r border-[#3e3e42] last:border-r-0 p-2 align-top" style={{ position: 'relative', background: monthBg }}>
                          <div className="text-xs text-[#94a3b8] mb-1 flex items-center gap-1">
                            <span className={`inline-block px-1 rounded ${isToday(d) ? 'bg-[#007acc] text-white' : ''}`}>{isFirst ? `${monthShort} ${d.getDate()}` : d.getDate()}</span>
                          </div>
                          <div className="space-y-1">
                            {dayItems.map((ev) => {
                              const type = classify(ev);
                              const color = typeColors[type] || typeColors.milestone;
                              return (
                                <div key={`${ev.id}-${ev.date}`} title={buildTooltip(ev)}
                                     className="text-xs text-white rounded px-2 py-1 truncate"
                                     style={{ background: color }}>
                                  {buildEventLabel(ev)}
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
            )}
          </Card>

          <div className="space-y-4">
            <Card className="bg-[#2d2d30] border-[#3e3e42]">
              <div className="p-4">
                <div className="text-[#cccccc] font-semibold mb-2">Deliverable Types</div>
                <div className="space-y-2 text-sm">
                  {[
                    ['Bulletin', 'bulletin'],
                    ['CD', 'cd'],
                    ['DD', 'dd'],
                    ['IFC', 'ifc'],
                    ['IFP', 'ifp'],
                    ['Masterplan', 'masterplan'],
                    ['SD', 'sd'],
                    ['Milestone', 'milestone'],
                  ].map(([label, key]) => (
                    <div key={key as string} className="flex items-center gap-2 text-[#cbd5e1]">
                      <span className="inline-block w-3 h-3 rounded" style={{ background: typeColors[key as string] }} />
                      {label}
                    </div>
                  ))}
                </div>
              </div>
            </Card>
            <Card className="bg-[#2d2d30] border-[#3e3e42]">
              <div className="p-4 text-sm text-[#cbd5e1] space-y-2">
                <div className="font-semibold">How to use</div>
                <ul className="list-disc ml-5 space-y-1 text-[#94a3b8]">
                  <li>Today is highlighted with the accent color</li>
                  <li>Prev/Next shifts the view by one week</li>
                  <li>Colors indicate deliverable type (parsed from title)</li>
                </ul>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default MilestoneCalendarPage;









