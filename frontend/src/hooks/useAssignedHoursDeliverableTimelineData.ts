import { useState } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import { getAssignedHoursDeliverableTimeline } from '@/services/analyticsApi';

export type TimelineWeeks = 4 | 8 | 12 | 16;

export function useAssignedHoursDeliverableTimelineData({ weeks, departmentId, includeChildren, includeActiveCa = true }: { weeks: TimelineWeeks; departmentId?: number | null; includeChildren?: boolean; includeActiveCa?: boolean; }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weekKeys, setWeekKeys] = useState<string[]>([]);
  const [series, setSeries] = useState<{ sd: number[]; dd: number[]; ifp: number[]; masterplan: number[]; bulletins: number[]; ca: number[] }>({ sd: [], dd: [], ifp: [], masterplan: [], bulletins: [], ca: [] });
  const [extras, setExtras] = useState<Array<{ label: string; values: number[] }>>([]);

  useAuthenticatedEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const debugFlag = typeof window !== 'undefined' && window?.location?.search ? (new URLSearchParams(window.location.search).get('debug') === '1') : false;
        const res = await getAssignedHoursDeliverableTimeline({
          weeks,
          department: departmentId != null ? Number(departmentId) : undefined,
          include_children: departmentId != null ? (includeChildren ? 1 : 0) : undefined,
          include_active_ca: includeActiveCa ? 1 : 0,
          debug: debugFlag ? 1 : undefined,
        });
        if (!mounted) return;
        setWeekKeys(res.weekKeys || []);
        const s = res.series || { sd: [], dd: [], ifp: [], masterplan: [], bulletins: [], ca: [] } as any;
        setSeries({ sd: s.sd || [], dd: s.dd || [], ifp: s.ifp || [], masterplan: s.masterplan || [], bulletins: s.bulletins || [], ca: s.ca || [] });
        setExtras(res.extras || []);
        if (debugFlag && (res as any).unspecifiedDebug) {
          // eslint-disable-next-line no-console
          console.log('Deliverable timeline unspecifiedDebug', {
            weeks,
            departmentId,
            includeChildren,
            includeActiveCa,
            entries: (res as any).unspecifiedDebug,
          });
        }
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Failed to load deliverable timeline');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [weeks, departmentId, includeChildren, includeActiveCa]);

  const totalByWeek = (weekKeys.length ? weekKeys : new Array(weeks).fill('')).map((_, i) => {
    let extraSum = 0;
    for (const e of extras) {
      extraSum += e.values[i] || 0;
    }
    return (series.sd[i] || 0) + (series.dd[i] || 0) + (series.ifp[i] || 0) + (series.masterplan[i] || 0) + (series.bulletins[i] || 0) + (series.ca[i] || 0) + extraSum;
  });
  const maxY = totalByWeek.reduce((m, v) => (v > m ? v : m), 0);
  return { loading, error, weekKeys, series, extras, totalByWeek, maxY };
}
