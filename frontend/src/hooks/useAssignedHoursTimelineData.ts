import { useState, useMemo } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import { getAssignedHoursStatusTimeline } from '@/services/analyticsApi';

export type TimelineWeeks = 4 | 8 | 12 | 16;

export type TimelineSeriesKey = 'active' | 'active_ca' | 'other';

export type TimelineData = {
  loading: boolean;
  error: string | null;
  weekKeys: string[];
  series: Record<TimelineSeriesKey, number[]>; // per-week values
  totalsByWeek: number[];
  maxY: number;
};

type Args = {
  weeks: TimelineWeeks;
  departmentId?: number | null;
  includeChildren?: boolean;
  vertical?: number | null;
};

export function useAssignedHoursTimelineData({ weeks, departmentId, includeChildren, vertical }: Args): TimelineData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weekKeys, setWeekKeys] = useState<string[]>([]);
  const [series, setSeries] = useState<Record<TimelineSeriesKey, number[]>>({ active: [], active_ca: [], other: [] });

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
        });
        if (!mounted) return;
        setWeekKeys(res.weekKeys || []);
        const s = res.series || { active: [], active_ca: [], other: [] };
        setSeries({ active: s.active || [], active_ca: s.active_ca || [], other: s.other || [] });
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Failed to load timeline');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [weeks, departmentId, includeChildren, vertical]);

  const totalsByWeek = useMemo(() => {
    const len = Math.max(series.active.length, series.active_ca.length, series.other.length);
    const out: number[] = new Array(len).fill(0);
    for (let i = 0; i < len; i++) {
      out[i] = (series.active[i] || 0) + (series.active_ca[i] || 0) + (series.other[i] || 0);
    }
    return out;
  }, [series]);

  const maxY = useMemo(() => {
    return totalsByWeek.reduce((m, v) => (v > m ? v : m), 0);
  }, [totalsByWeek]);

  return { loading, error, weekKeys, series, totalsByWeek, maxY };
}

export type { Args as AssignedHoursTimelineArgs };
