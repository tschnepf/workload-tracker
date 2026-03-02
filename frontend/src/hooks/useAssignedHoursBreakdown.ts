import { useState } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import { getProjectGridSnapshot } from '@/services/projectAssignmentsApi';
import { useProjectStatusDefinitions } from '@/hooks/useProjectStatusDefinitions';

export type HorizonWeeks = 4 | 8 | 12 | 16;

export type Slice = {
  key: string;
  label: string;
  value: number; // hours
  color: string;
};

type Args = {
  weeks: HorizonWeeks;
  departmentId?: number | null;
  includeChildren?: boolean;
  vertical?: number | null;
};

export function useAssignedHoursBreakdown({ weeks, departmentId, includeChildren, vertical }: Args) {
  const { definitions } = useProjectStatusDefinitions();
  const includedDefinitions = definitions.filter((item) => item.includeInAnalytics);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [slices, setSlices] = useState<Slice[]>(
    includedDefinitions.map((item) => ({ key: item.key, label: item.label, value: 0, color: item.colorHex || '#64748b' }))
  );

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
          vertical: vertical ?? undefined,
        } as any);
        if (!mounted) return;

        const weekKeys = snap.weekKeys || [];
        const hoursByProject = snap.hoursByProject || {};

        const totalsByStatus = new Map<string, number>();
        for (const item of includedDefinitions) {
          totalsByStatus.set(item.key.toLowerCase(), 0);
        }

        for (const p of snap.projects || []) {
          const status = (p.status || '').toLowerCase();
          if (!totalsByStatus.has(status)) continue;
          const wkmap = hoursByProject[String(p.id)] || {};
          let sum = 0;
          for (const wk of weekKeys) {
            const v = wkmap[wk];
            if (typeof v === 'number' && isFinite(v)) sum += v;
          }
          if (sum <= 0) continue;
          totalsByStatus.set(status, (totalsByStatus.get(status) || 0) + sum);
        }

        const nextSlices: Slice[] = includedDefinitions.map((item) => {
          const key = item.key.toLowerCase();
          return {
            key,
            label: item.label,
            value: totalsByStatus.get(key) || 0,
            color: item.colorHex || '#64748b',
          };
        });
        setSlices(nextSlices);
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
  }, [weeks, departmentId, includeChildren, vertical, includedDefinitions]);

  const total = Math.max(0, slices.reduce((s, x) => s + x.value, 0));
  return { loading, error, slices, total };
}
