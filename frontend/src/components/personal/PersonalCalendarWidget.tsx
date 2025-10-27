import React from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import { useAuth } from '@/hooks/useAuth';
import { apiClient, authHeaders } from '@/api/client';
import { deliverablesApi, deliverableAssignmentsApi } from '@/services/api';
import type { DeliverableCalendarItem } from '@/types/models';
import CalendarGrid from '@/components/deliverables/CalendarGrid';
import { fmtDate, startOfWeekSunday } from '@/components/deliverables/calendar.utils';
import { subscribeGridRefresh } from '@/lib/gridRefreshBus';

// Grid helpers come from shared calendar.utils via CalendarGrid

type CalendarItemUnion = (DeliverableCalendarItem & { itemType?: 'deliverable' }) | {
  itemType: 'pre_deliverable'; id: number; parentDeliverableId: number; project: number; projectName?: string | null; projectClient?: string | null; preDeliverableType?: string; title: string; date: string | null; isCompleted: boolean; isOverdue?: boolean;
};

type Props = { className?: string };

const PersonalCalendarWidget: React.FC<Props> = ({ className }) => {
  const auth = useAuth();
  const personId = auth?.person?.id;

  const [anchor, setAnchor] = React.useState<Date>(() => startOfWeekSunday(new Date()));
  const [weeksCount, setWeeksCount] = React.useState<number>(6);
  const [showPre, setShowPre] = React.useState<boolean>(true);
  const [items, setItems] = React.useState<CalendarItemUnion[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshTick, setRefreshTick] = React.useState<number>(0);

  const start = React.useMemo(() => fmtDate(anchor), [anchor]);
  const end = React.useMemo(() => {
    const d = new Date(anchor);
    d.setDate(d.getDate() + 7 * weeksCount - 1);
    return fmtDate(d);
  }, [anchor, weeksCount]);

  // Live refresh when deliverables change elsewhere (e.g., popover)
  React.useEffect(() => {
    const unsub = subscribeGridRefresh((p) => {
      const r = (p?.reason || '').toLowerCase();
      if (r.includes('deliverable')) {
        setRefreshTick((t) => t + 1);
      }
    });
    return unsub;
  }, []);

  useAuthenticatedEffect(() => {
    let active = true;
    if (!personId) { setItems([]); return; }
    (async () => {
      setLoading(true); setError(null);
      try {
        // Unified endpoint first (server-side person scoping)
        const params: any = { query: { start, end, mine_only: 1 } };
        const res = await apiClient.GET('/deliverables/calendar_with_pre_items/' as any, { params, headers: authHeaders() });
        if (res.data && active) {
          setItems(res.data as unknown as CalendarItemUnion[]);
          return;
        }
        // Fallback path: filter deliverables client-side using assignment links
        const [calRes, linksRes, projAssigns] = await Promise.all([
          (async () => {
            try { return await deliverablesApi.calendar(start, end); } catch { return [] as DeliverableCalendarItem[]; }
          })(),
          (async () => {
            try { return await deliverableAssignmentsApi.byPerson(personId as number); } catch { return [] as any[]; }
          })(),
          (async () => {
            try {
              // Use assignments.by_person to collect project IDs for fallback scoping
              const res = await apiClient.GET('/assignments/by_person/' as any, { params: { query: { person_id: personId } }, headers: authHeaders() });
              return (res.data as any[]) || [];
            } catch {
              return [] as any[];
            }
          })(),
        ]);
        const allowedDeliverableIds = new Set<number>((linksRes as any[]).map((l: any) => l.deliverable).filter(Boolean));
        const allowedProjectIds = new Set<number>((projAssigns as any[]).map((a: any) => a.project).filter(Boolean));
        const filteredDeliverables = (calRes || []).filter(d => allowedDeliverableIds.has(d.id) || allowedProjectIds.has((d as any).project));
        // Pre-items with mine_only=1
        let preItems: any[] = [];
        try {
          const preRes = await apiClient.GET('/deliverables/pre_deliverable_items/' as any, { params: { query: { mine_only: 1, start, end, page_size: 100 } }, headers: authHeaders() });
          const payload: any = (preRes as any).data;
          preItems = Array.isArray(payload) ? payload : ((payload && payload.results) || []);
        } catch { preItems = []; }
        const union: CalendarItemUnion[] = [
          ...filteredDeliverables.map(it => ({ ...it, itemType: 'deliverable' as const })),
          ...preItems.map((pi: any) => ({
            itemType: 'pre_deliverable' as const,
            id: pi.id,
            parentDeliverableId: pi.deliverable,
            project: pi.parentDeliverable?.project || pi.project || 0,
            projectName: pi.projectName ?? pi.parentDeliverable?.description ?? null,
            projectClient: pi.projectClient ?? null,
            preDeliverableType: pi.typeName ?? pi.preDeliverableType ?? undefined,
            title: `PRE: ${pi.typeName || pi.preDeliverableType || ''}`.trim(),
            date: pi.generatedDate ?? null,
            isCompleted: !!pi.isCompleted,
            isOverdue: !!pi.isOverdue,
          })),
        ];
        if (active) setItems(union);
      } catch (e: any) {
        if (active) setError(e?.message || 'Failed to load personal calendar');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [personId, start, end, refreshTick]);

  // Build date grid
  // Grid rows and date mapping handled by CalendarGrid

  const prevWeek = () => setAnchor(a => { const d = new Date(a); d.setDate(d.getDate() - 7); return d; });
  const nextWeek = () => setAnchor(a => { const d = new Date(a); d.setDate(d.getDate() + 7); return d; });
  const today = () => setAnchor(startOfWeekSunday(new Date()));
  const isToday = (d: Date) => fmtDate(d) === fmtDate(new Date());

  return (
    <Card className={className}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[var(--text)] font-semibold">My Calendar</div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={prevWeek}>Prev</Button>
          <Button size="sm" onClick={today}>Today</Button>
          <Button size="sm" onClick={nextWeek}>Next</Button>
          <select
            className="ml-2 bg-[var(--surface)] border border-[var(--border)] rounded text-[var(--text)] text-sm px-2 py-1"
            value={weeksCount}
            onChange={(e) => setWeeksCount(Math.max(1, Math.min(12, parseInt(e.target.value || '6'))))}
          >
            {[4,6,8,10,12].map(n => <option key={n} value={n}>{n}w</option>)}
          </select>
          <label className="ml-3 text-sm text-[#cbd5e1] inline-flex items-center gap-2">
            <input type="checkbox" checked={showPre} onChange={e => setShowPre(e.currentTarget.checked)} />
            Show Pre-Deliverables
          </label>
        </div>
      </div>

      {(!personId) && (
        <div className="text-sm text-[#94a3b8]">Link your account to a Person to view your calendar.</div>
      )}

      {personId && (
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-4 text-sm text-[#94a3b8]">Loading…</div>
          ) : error ? (
            <div className="p-4 text-sm text-[#fca5a5]">{error}</div>
          ) : (
            <CalendarGrid items={items} anchor={anchor} weeksCount={weeksCount} showPre={showPre} />
          )}
        </div>
      )}
    </Card>
  );
};

export default PersonalCalendarWidget;
