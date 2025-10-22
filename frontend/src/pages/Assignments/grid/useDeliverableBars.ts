import { useMemo } from 'react';
import type { Deliverable } from '@/types/models';
import { deliverableTypeColors, classifyDeliverableType } from '@/util/deliverables';

export interface DeliverableEntry { type: string; percentage?: number }

export function useDeliverableBars(deliverablesForWeek: Deliverable[] | undefined) {
  const entries = useMemo<DeliverableEntry[]>(() => {
    const out: DeliverableEntry[] = [];
    const add = (type: string, pct?: number) => {
      const numPct = pct == null ? undefined : Number(pct);
      const existing = out.find(e => e.type === type);
      if (existing) {
        if ((existing.percentage == null) && (numPct != null)) existing.percentage = numPct;
        else if (existing.percentage != null && numPct != null && existing.percentage !== numPct) {
          if (!out.some(e => e.type === type && e.percentage === numPct)) out.push({ type, percentage: numPct });
        }
      } else {
        out.push({ type, percentage: numPct });
      }
    };
    (deliverablesForWeek || []).forEach(d => {
      const title = (d as any).description ?? (d as any).title ?? '';
      const type = classifyDeliverableType(title);
      let pct: number | undefined = undefined;
      const pctVal = (d as any).percentage;
      if (pctVal != null && !Number.isNaN(Number(pctVal))) pct = Number(pctVal);
      else {
        const m = String(title).match(/(\d{1,3})\s*%/);
        if (m) { const n = parseInt(m[1], 10); if (!Number.isNaN(n) && n >= 0 && n <= 100) pct = n; }
      }
      add(type, pct);
    });
    return out;
  }, [deliverablesForWeek]);

  const hasDeliverable = entries.length > 0;

  const tooltip = useMemo(() => {
    if (!deliverablesForWeek || deliverablesForWeek.length === 0) return undefined as string | undefined;
    return deliverablesForWeek
      .map(d => {
        const title = (d as any).description ?? (d as any).title ?? '';
        const pctVal = (d as any).percentage;
        let pct: number | undefined = undefined;
        if (pctVal != null && !Number.isNaN(Number(pctVal))) pct = Number(pctVal);
        else {
          const m = String(title).match(/(\d{1,3})\s*%/);
          if (m) { const n = parseInt(m[1], 10); if (!Number.isNaN(n) && n >= 0 && n <= 100) pct = n; }
        }
        const pctStr = pct != null ? `${pct}% ` : '';
        const notes = (d as any).notes ? ` - ${(d as any).notes}` : '';
        return `${pctStr}${title}${notes}`.trim();
      })
      .filter(Boolean)
      .join('\n');
  }, [deliverablesForWeek]);

  const colorFor = (type: string) => deliverableTypeColors[type] || 'var(--primary)';

  return { entries, hasDeliverable, tooltip, colorFor } as const;
}

export type UseDeliverableBarsReturn = ReturnType<typeof useDeliverableBars>;
