import React, { useMemo, useState } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import Layout from '../../components/layout/Layout';
import Card from '../../components/ui/Card';
import { assignmentsApi, deliverablesApi, deliverableAssignmentsApi, peopleApi } from '../../services/api';
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

  // Person filter state
  const [personQuery, setPersonQuery] = useState<string>('');
  const [personResults, setPersonResults] = useState<Array<{ id: number; name: string }>>([]);
  const [selectedPersonIndex, setSelectedPersonIndex] = useState<number>(-1);
  const [selectedPerson, setSelectedPerson] = useState<{ id: number; name: string } | null>(null);
  const [allowedDeliverableIds, setAllowedDeliverableIds] = useState<Set<number> | null>(null);
  const [allowedProjectIds, setAllowedProjectIds] = useState<Set<number> | null>(null);
  const [filterLoading, setFilterLoading] = useState<boolean>(false);

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

  // When a person is selected, fetch their deliverable links and project assignments once
  useAuthenticatedEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!selectedPerson) { setAllowedDeliverableIds(null); setAllowedProjectIds(null); return; }
        setFilterLoading(true);
        const [links, projects] = await Promise.all([
          (async () => { try { return await deliverableAssignmentsApi.byPerson(selectedPerson.id); } catch { return [] as any[]; } })(),
          (async () => { try { return await assignmentsApi.byPerson(selectedPerson.id); } catch { return [] as any[]; } })(),
        ]);
        if (!active) return;
        const dset = new Set<number>((links as any[]).map((l: any) => l.deliverable).filter((n: any) => Number.isFinite(n)));
        const pset = new Set<number>((projects as any[]).map((a: any) => a.project).filter((n: any) => Number.isFinite(n)));
        setAllowedDeliverableIds(dset);
        setAllowedProjectIds(pset);
      } finally {
        if (active) setFilterLoading(false);
      }
    })();
    return () => { active = false; };
  }, [selectedPerson]);

  const filteredItems = useMemo(() => {
    if (!selectedPerson) return items;
    const dset = allowedDeliverableIds; const pset = allowedProjectIds;
    if (!dset && !pset) return [];
    return items.filter((it) => {
      if (it.itemType === 'pre_deliverable') {
        const parentId = (it as any).parentDeliverableId as number | undefined;
        const projId = (it as any).project as number | undefined;
        return (parentId != null && dset?.has(parentId)) || (projId != null && pset?.has(projId));
      }
      // deliverable item
      const delivId = (it as any).id as number | undefined;
      const projId = (it as any).project as number | undefined;
      return (delivId != null && dset?.has(delivId)) || (projId != null && pset?.has(projId));
    });
  }, [items, selectedPerson, allowedDeliverableIds, allowedProjectIds]);

  const dateMap = useMemo(() => {
    const m = new Map<string, CalendarItemUnion[]>();
    const src = filteredItems;
    for (const it of src) {
      if (!it.date) continue;
      if (!m.has(it.date)) m.set(it.date, []);
      if (it.itemType === 'pre_deliverable' && !showPre) continue;
      m.get(it.date)!.push(it);
    }
    return m;
  }, [filteredItems, showPre]);

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
            <div className="hidden sm:flex items-center gap-2 mr-2">
              <label className="text-sm text-[var(--muted)] whitespace-nowrap">Person Filter</label>
              <div className="relative">
                {selectedPerson ? (
                  <div className="flex items-center gap-2 border rounded px-2 py-1 text-sm bg-[var(--card)] border-[var(--border)] text-[var(--text)]">
                    <span>{selectedPerson.name}</span>
                    <button
                      className="text-[var(--muted)] hover:text-[var(--text)]"
                      onClick={() => { setSelectedPerson(null); setPersonQuery(''); setPersonResults([]); setSelectedPersonIndex(-1); }}
                      title="Clear person filter"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      className="w-56 bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)] text-sm px-2 py-1"
                      placeholder="Type a name…"
                      value={personQuery}
                      onChange={async (e) => {
                        const q = e.currentTarget.value;
                        setPersonQuery(q);
                        if (!q || q.trim().length === 0) { setPersonResults([]); setSelectedPersonIndex(-1); return; }
                        try {
                          const res = await peopleApi.autocomplete(q, 20);
                          setPersonResults(res || []);
                          setSelectedPersonIndex((res && res.length > 0) ? 0 : -1);
                        } catch {}
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedPersonIndex(i => Math.min(i + 1, personResults.length - 1)); }
                        else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedPersonIndex(i => Math.max(i - 1, 0)); }
                        else if (e.key === 'Enter') {
                          e.preventDefault();
                          const sel = selectedPersonIndex >= 0 ? personResults[selectedPersonIndex] : null;
                          if (sel) { setSelectedPerson(sel); setPersonResults([]); }
                        }
                      }}
                    />
                    {personResults && personResults.length > 0 && (
                      <div className="absolute z-10 mt-1 w-56 max-h-64 overflow-auto border border-[var(--border)] bg-[var(--card)] rounded shadow">
                        {personResults.map((p, idx) => (
                          <div
                            key={p.id}
                            className={`px-2 py-1 text-sm cursor-pointer ${idx === selectedPersonIndex ? 'bg-[var(--cardHover)] text-[var(--text)]' : 'text-[var(--muted)] hover:bg-[var(--cardHover)] hover:text-[var(--text)]'}`}
                            onMouseEnter={() => setSelectedPersonIndex(idx)}
                            onMouseDown={(e) => { e.preventDefault(); setSelectedPerson(p); setPersonResults([]); }}
                          >
                            {p.name}
                          </div>
                        ))}
                        {filterLoading && (
                          <div className="px-2 py-1 text-xs text-[var(--muted)]">Loading…</div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            <button onClick={goPrev} className="px-3 py-1.5 text-sm rounded border bg-[var(--card)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--cardHover)]">&lt; Prev Week</button>
            <button onClick={goNext} className="px-3 py-1.5 text-sm rounded border bg-[var(--card)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--cardHover)]">Next Week &gt;</button>
            <div className="flex items-center gap-2 ml-2">
              <span className="text-sm text-[var(--muted)]">Weeks:</span>
              {[8, 12, 16].map((w) => (
                <button
                  key={w}
                  onClick={() => setWeeksCount(w)}
                  aria-pressed={weeksCount === w}
                  className={`px-2 py-1 text-xs rounded border transition-colors ${
                    weeksCount === w
                      ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
                      : 'bg-[var(--card)] border-[var(--border)] text-[var(--muted)] hover:bg-[var(--cardHover)] hover:text-[var(--text)]'
                  }`}
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
                <CalendarGrid items={filteredItems} anchor={anchor} weeksCount={weeksCount} showPre={showPre} />
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














