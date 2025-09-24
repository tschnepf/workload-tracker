import React, { useMemo, useState } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import Layout from '../../components/layout/Layout';
import Card from '../../components/ui/Card';
import { deliverablesApi } from '../../services/api';
import { DeliverableCalendarItem } from '../../types/models';
import { resolveApiBase } from '@/utils/apiBase';
import { getAccessToken } from '@/utils/auth';
import { darkTheme } from '../../theme/tokens';
import CalendarGrid from '@/components/deliverables/CalendarGrid';
import { fmtDate, startOfWeekSunday, typeColors } from '@/components/deliverables/calendar.utils';

type CalendarItemUnion = (DeliverableCalendarItem & { itemType?: 'deliverable' }) | {
  itemType: 'pre_deliverable'; id: number; parentDeliverableId: number; project: number; projectName?: string | null; projectClient?: string | null; preDeliverableType?: string; title: string; date: string | null; isCompleted: boolean; isOverdue?: boolean;
};

const MilestoneCalendarPage: React.FC = () => {
  const [anchor, setAnchor] = useState<Date>(() => startOfWeekSunday(new Date()));
  const [weeksCount, setWeeksCount] = useState<number>(8);
  const start = useMemo(() => fmtDate(anchor), [anchor]);
  const end = useMemo(() => {
    const d = new Date(anchor);
    d.setDate(d.getDate() + 7 * weeksCount - 1);
    return fmtDate(d);
  }, [anchor, weeksCount]);

  const [items, setItems] = useState<CalendarItemUnion[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showPre, setShowPre] = useState<boolean>(true);

  useAuthenticatedEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        // Try unified endpoint first; fallback to legacy calendar
        const base = resolveApiBase((import.meta as any)?.env?.VITE_API_URL as string | undefined);
        const token = getAccessToken();
        try {
          const params = new URLSearchParams();
          if (start) params.set('start', start);
          if (end) params.set('end', end);
          const resp = await fetch(`${base}/deliverables/calendar_with_pre_items/?${params.toString()}`, { headers: { 'Authorization': token ? `Bearer ${token}` : '' } });
          if (resp.ok) {
            const union = await resp.json();
            if (active) setItems(union || []);
            return;
          }
        } catch {}
        // Fallback
        const legacy = await deliverablesApi.calendar(start, end);
        if (active) setItems((legacy || []).map(it => ({ ...it, itemType: 'deliverable' as const })));
      } catch (e: any) {
        if (active) setError(e?.message || 'Failed to load calendar');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [start, end]);

  const dateMap = useMemo(() => {
    const m = new Map<string, CalendarItemUnion[]>();
    for (const it of items) {
      if (!it.date) continue;
      if (!m.has(it.date)) m.set(it.date, []);
      if (it.itemType === 'pre_deliverable' && !showPre) continue;
      m.get(it.date)!.push(it);
    }
    return m;
  }, [items, showPre]);

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
              <div className="overflow-x-auto">
                <CalendarGrid items={items} anchor={anchor} weeksCount={weeksCount} showPre={showPre} />
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
                  <div className="flex items-center gap-2 text-[#cbd5e1]">
                    <span className="inline-block w-3 h-3 rounded" style={{ background: typeColors['pre_deliverable'] }} />
                    Pre-Deliverable
                  </div>
                  <div className="mt-3">
                    <label className="inline-flex items-center gap-2 text-[#cbd5e1]">
                      <input type="checkbox" checked={showPre} onChange={e => setShowPre(e.currentTarget.checked)} />
                      Show Pre-Deliverables
                    </label>
                  </div>
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














