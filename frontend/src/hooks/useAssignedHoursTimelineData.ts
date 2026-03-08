import { useState, useMemo } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import { getAssignedHoursStatusTimeline } from '@/services/analyticsApi';

export type TimelineWeeks = 4 | 8 | 12 | 16;

export type StatusTimelineSeriesItem = {
  key: string;
  label: string;
  colorHex: string;
  values: number[];
};

export type TimelineData = {
  loading: boolean;
  error: string | null;
  weekKeys: string[];
  series: StatusTimelineSeriesItem[]; // per-week values
  totalsByWeek: number[];
  maxY: number;
};

type Args = {
  weeks: TimelineWeeks;
  departmentId?: number | null;
  includeChildren?: boolean;
  vertical?: number | null;
  visibilityScope?: string;
};

export function useAssignedHoursTimelineData({ weeks, departmentId, includeChildren, vertical, visibilityScope = 'analytics.status_timeline' }: Args): TimelineData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weekKeys, setWeekKeys] = useState<string[]>([]);
  const [series, setSeries] = useState<StatusTimelineSeriesItem[]>([]);
  const [totalsByWeek, setTotalsByWeek] = useState<number[]>([]);

  useAuthenticatedEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await getAssignedHoursStatusTimeline({
          weeks,
          department: departmentId != null ? Number(departmentId) : undefined,
          include_children: departmentId != null ? (includeChildren ? 1 : 0) : undefined,
          vertical: vertical ?? undefined,
          visibility_scope: visibilityScope,
        });
        if (!mounted) return;
        const nextWeekKeys = res.weekKeys || [];
        const nextSeries = Array.isArray(res.series) ? res.series : [];
        setWeekKeys(nextWeekKeys);
        setSeries(nextSeries);
        if (Array.isArray(res.totalByWeek) && res.totalByWeek.length) {
          setTotalsByWeek(res.totalByWeek);
        } else {
          const totals = new Array(nextWeekKeys.length).fill(0);
          for (const item of nextSeries) {
            for (let i = 0; i < totals.length; i++) {
              totals[i] += Number(item.values?.[i] || 0);
            }
          }
          setTotalsByWeek(totals);
        }
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Failed to load timeline');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [weeks, departmentId, includeChildren, vertical, visibilityScope]);

  const maxY = useMemo(() => {
    return totalsByWeek.reduce((m, v) => (v > m ? v : m), 0);
  }, [totalsByWeek]);

  return { loading, error, weekKeys, series, totalsByWeek, maxY };
}

export type { Args as AssignedHoursTimelineArgs };
