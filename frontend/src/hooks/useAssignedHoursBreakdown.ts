import { useState } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import { getProjectGridSnapshot } from '@/services/projectAssignmentsApi';

export type HorizonWeeks = 4 | 8 | 12 | 16;

export type Slice = {
  key: 'active' | 'active_ca' | 'other';
  label: string;
  value: number; // hours
  color: string;
};

type Args = {
  weeks: HorizonWeeks;
  departmentId?: number | null;
  includeChildren?: boolean;
};

export function useAssignedHoursBreakdown({ weeks, departmentId, includeChildren }: Args) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [slices, setSlices] = useState<Slice[]>([
    { key: 'active', label: 'Active', value: 0, color: '#34d399' },
    { key: 'active_ca', label: 'Active CA', value: 0, color: '#60a5fa' },
    { key: 'other', label: 'Other', value: 0, color: '#64748b' },
  ]);

  useAuthenticatedEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const snap = await getProjectGridSnapshot({
          weeks,
          department: departmentId != null ? Number(departmentId) : undefined,
          include_children: departmentId != null ? (includeChildren ? 1 : 0) : undefined,
        } as any);
        if (!mounted) return;

        const weekKeys = snap.weekKeys || [];
        const hoursByProject = snap.hoursByProject || {};

        let activeHours = 0;
        let activeCaHours = 0;
        let otherHours = 0;

        for (const p of snap.projects || []) {
          const status = (p.status || '').toLowerCase();
          const wkmap = hoursByProject[String(p.id)] || {};
          let sum = 0;
          for (const wk of weekKeys) {
            const v = wkmap[wk];
            if (typeof v === 'number' && isFinite(v)) sum += v;
          }
          if (sum <= 0) continue;
          if (status === 'active') activeHours += sum;
          else if (status === 'active_ca') activeCaHours += sum;
          else otherHours += sum;
        }

        setSlices([
          { key: 'active', label: 'Active', value: activeHours, color: '#34d399' },
          { key: 'active_ca', label: 'Active CA', value: activeCaHours, color: '#60a5fa' },
          { key: 'other', label: 'Other', value: otherHours, color: '#64748b' },
        ]);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Failed to load assigned hours');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [weeks, departmentId, includeChildren]);

  const total = Math.max(0, slices.reduce((s, x) => s + x.value, 0));
  return { loading, error, slices, total };
}

