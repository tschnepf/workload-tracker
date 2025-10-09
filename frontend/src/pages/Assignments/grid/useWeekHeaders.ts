import { useCallback, useState } from 'react';
import { toWeekHeader, type WeekHeader } from '@/pages/Assignments/grid/utils';

export function useWeekHeaders() {
  const [weeks, setWeeks] = useState<WeekHeader[]>([]);

  const setFromSnapshot = useCallback((weekKeys: string[]) => {
    try {
      const wk = toWeekHeader(weekKeys || []);
      setWeeks(wk);
    } catch {
      setWeeks([]);
    }
  }, []);

  return { weeks, setFromSnapshot } as const;
}

export type UseWeekHeadersReturn = ReturnType<typeof useWeekHeaders>;

