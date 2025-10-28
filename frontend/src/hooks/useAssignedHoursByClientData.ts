import { useState } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import { getAssignedHoursByClient } from '@/services/analyticsApi';

export type ClientHorizonWeeks = 4 | 8 | 12 | 16;

export type ClientSlice = {
  key: string; // client identifier
  label: string; // client display name
  value: number; // hours
  color: string; // hex color
};

type Args = {
  weeks: ClientHorizonWeeks;
  departmentId?: number | null;
  includeChildren?: boolean;
};


const PALETTE = [
  '#34d399', // emerald
  '#60a5fa', // blue
  '#f59e0b', // amber
  '#ef4444', // red
  '#a78bfa', // violet
  '#22d3ee', // cyan
  '#f472b6', // pink
  '#10b981', // green
  '#93c5fd', // light blue
  '#fbbf24', // yellow
  '#f87171', // light red
  '#38bdf8', // sky
  '#c084fc', // purple
  '#2dd4bf', // teal
  '#fb7185', // rose
];

export function useAssignedHoursByClientData({ weeks, departmentId, includeChildren }: Args) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [slices, setSlices] = useState<ClientSlice[]>([]);

  useAuthenticatedEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await getAssignedHoursByClient({
          weeks,
          department: departmentId != null ? Number(departmentId) : undefined,
          include_children: departmentId != null ? (includeChildren ? 1 : 0) : undefined,
        });
        if (!mounted) return;
        const built: ClientSlice[] = (res.clients || []).map((row, idx) => ({
          key: row.label,
          label: row.label,
          value: row.hours,
          color: PALETTE[idx % PALETTE.length],
        }));

        setSlices(built);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Failed to load client breakdown');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [weeks, departmentId, includeChildren]);

  const total = Math.max(0, slices.reduce((s, x) => s + x.value, 0));
  return { loading, error, slices, total } as { loading: boolean; error: string | null; slices: ClientSlice[]; total: number };
}

export type { Args as AssignedHoursByClientArgs };
