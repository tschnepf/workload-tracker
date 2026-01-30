import { useCallback, useState } from 'react';
import { toWeekHeader, type WeekHeader } from '@/pages/Assignments/grid/utils';

export function useWeekHeaders() {
  const [weeks, setWeeks] = useState<WeekHeader[]>([]);

  const setFromSnapshot = useCallback((weekKeys: string[]) => {
    try {
      const wk = toWeekHeader(weekKeys || []);
      setWeeks((prev) => {
        if (prev.length === wk.length && prev.every((item, idx) => item.date === wk[idx]?.date)) {
          return prev;
        }
        return wk;
      });
    } catch {
      setWeeks((prev) => (prev.length ? [] : prev));
    }
  }, []);

  return { weeks, setFromSnapshot } as const;
}

export type UseWeekHeadersReturn = ReturnType<typeof useWeekHeaders>;
