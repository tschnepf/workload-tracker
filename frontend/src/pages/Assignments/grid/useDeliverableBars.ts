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
      const type = classifyDeliverableType((d as any).description);
      const pct = (d as any).percentage == null ? undefined : Number((d as any).percentage);
      add(type, pct);
    });
    return out;
  }, [deliverablesForWeek]);

  const hasDeliverable = entries.length > 0;

  const tooltip = useMemo(() => {
    if (!deliverablesForWeek || deliverablesForWeek.length === 0) return undefined as string | undefined;
    return deliverablesForWeek
      .map(d => {
        const pct = (d as any).percentage ?? '';
        const pctStr = pct !== '' ? `${pct}% ` : '';
        const desc = (d as any).description || '';
        const notes = (d as any).notes ? ` - ${(d as any).notes}` : '';
        return `${pctStr}${desc}${notes}`.trim();
      })
      .filter(Boolean)
      .join('\n');
  }, [deliverablesForWeek]);

  const colorFor = (type: string) => deliverableTypeColors[type] || 'var(--primary)';

  return { entries, hasDeliverable, tooltip, colorFor } as const;
}

export type UseDeliverableBarsReturn = ReturnType<typeof useDeliverableBars>;

