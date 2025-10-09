import { useMemo } from 'react';
import type { Deliverable } from '@/types/models';

function isDateInWeek(dateStr: string, weekStartStr: string) {
  try {
    const deliverableDate = new Date(dateStr);
    const weekStartDate = new Date(weekStartStr);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekStartDate.getDate() + 6);
    return deliverableDate >= weekStartDate && deliverableDate <= weekEndDate;
  } catch {
    return false;
  }
}

export function useDeliverablesIndex(deliverables: Deliverable[]) {
  const byProject = useMemo(() => {
    const m = new Map<number, Deliverable[]>();
    for (const d of deliverables || []) {
      const pid = (d as any).project as number;
      if (pid == null) continue;
      const arr = m.get(pid) || [];
      arr.push(d);
      m.set(pid, arr);
    }
    return m;
  }, [deliverables]);

  return (projectId: number, weekStart: string): Deliverable[] => {
    const arr = byProject.get(projectId) || [];
    return arr.filter(d => (d as any).date && isDateInWeek((d as any).date, weekStart));
  };
}

export type UseDeliverablesIndexReturn = ReturnType<typeof useDeliverablesIndex>;

