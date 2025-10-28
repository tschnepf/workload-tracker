import { useState } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import { getProjectGridSnapshot } from '@/services/projectAssignmentsApi';

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

export type ProjectSnapshot = {
  weekKeys: string[];
  projects: Array<{ id: number; name: string; client?: string | null; status?: string | null }>;
  hoursByProject: Record<string, Record<string, number>>;
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
  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(null);

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
        setSnapshot({ weekKeys, projects: snap.projects || [], hoursByProject });

        const clientTotals = new Map<string, number>();

        for (const p of snap.projects || []) {
          const clientRaw = (p.client ?? 'Unknown').toString().trim();
          const client = clientRaw.length > 0 ? clientRaw : 'Unknown';
          const wkmap = hoursByProject[String(p.id)] || {};
          let sum = 0;
          for (const wk of weekKeys) {
            const v = wkmap[wk];
            if (typeof v === 'number' && isFinite(v)) sum += v;
          }
          if (sum <= 0) continue;
          clientTotals.set(client, (clientTotals.get(client) || 0) + sum);
        }

        const entries = Array.from(clientTotals.entries()).sort((a, b) => b[1] - a[1]);
        const built: ClientSlice[] = entries.map(([label, value], idx) => ({
          key: label,
          label,
          value,
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
  return { loading, error, slices, total, snapshot } as { loading: boolean; error: string | null; slices: ClientSlice[]; total: number; snapshot: ProjectSnapshot | null };
}

export type { Args as AssignedHoursByClientArgs };
