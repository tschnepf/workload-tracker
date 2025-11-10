import type { Deliverable } from '@/types/models';

// Parse server YYYY-MM-DD as local midnight to avoid TZ off-by-one
export const parseLocal = (dateStr: string) => {
  try {
    const s = (dateStr || '').slice(0, 10);
    return new Date(`${s}T00:00:00`);
  } catch {
    return new Date(NaN);
  }
};

export function pickNextUpcoming(deliverables: Deliverable[] | undefined): Deliverable | null {
  if (!deliverables || deliverables.length === 0) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const candidates = deliverables
    .filter(d => !d.isCompleted && d.date)
    .map(d => ({ d, when: parseLocal(d.date as string) }))
    .filter(x => !isNaN(x.when.getTime()) && x.when >= today)
    .sort((a, b) => a.when.getTime() - b.when.getTime());
  return candidates.length > 0 ? candidates[0].d : null;
}

export function pickMostRecent(deliverables: Deliverable[] | undefined): Deliverable | null {
  if (!deliverables || deliverables.length === 0) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const candidates = deliverables
    .filter(d => !!d.date)
    .map(d => ({ d, when: parseLocal(d.date as string), completed: !!d.isCompleted }))
    .filter(x => !isNaN(x.when.getTime()))
    .filter(x => x.when < today)
    .sort((a, b) => b.when.getTime() - a.when.getTime());
  return candidates.length > 0 ? candidates[0].d : null;
}

