import { useCallback, useEffect, useMemo, useState } from 'react';
import type { WeekHeader } from '@/pages/Assignments/grid/utils';

export type WeekVirtualizationState = {
  visibleWeeks: WeekHeader[];
  paddingLeft: number;
  paddingRight: number;
  updateRange: (scrollLeft: number, viewportWidth: number) => void;
};

export function useWeekVirtualization(weeks: WeekHeader[], columnWidth = 70, overscan = 4): WeekVirtualizationState {
  const [range, setRange] = useState<{ start: number; end: number }>({
    start: 0,
    end: Math.min(weeks.length, overscan * 2 + 6),
  });

  const updateRange = useCallback(
    (scrollLeft: number, viewportWidth: number) => {
      if (weeks.length === 0) return;
      const visibleCount = Math.max(1, Math.ceil(viewportWidth / columnWidth));
      const start = Math.max(0, Math.floor(scrollLeft / columnWidth) - overscan);
      const end = Math.min(weeks.length, start + visibleCount + overscan * 2);
      setRange((prev) => {
        if (prev.start === start && prev.end === end) return prev;
        return { start, end };
      });
    },
    [weeks, columnWidth, overscan]
  );

  useEffect(() => {
    setRange({
      start: 0,
      end: Math.min(weeks.length, overscan * 2 + 6),
    });
  }, [weeks, overscan]);

  const visibleWeeks = useMemo(() => weeks.slice(range.start, range.end), [weeks, range]);
  const paddingLeft = range.start * columnWidth;
  const paddingRight = Math.max(0, (weeks.length - range.end) * columnWidth);

  return { visibleWeeks, paddingLeft, paddingRight, updateRange };
}
