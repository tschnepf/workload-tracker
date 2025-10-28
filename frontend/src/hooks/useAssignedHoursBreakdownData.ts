import { useAssignedHoursBreakdown, type HorizonWeeks, type Slice } from '@/hooks/useAssignedHoursBreakdown';

type Args = {
  weeks: HorizonWeeks;
  departmentId?: number | null;
  includeChildren?: boolean;
};

// Thin wrapper to conform to the shared analytics hook API naming.
// Exposes the same data as useAssignedHoursBreakdown but with the
// canonical "use<WidgetName>Data" function name.
export function useAssignedHoursBreakdownData({ weeks, departmentId, includeChildren }: Args) {
  const { loading, error, slices, total } = useAssignedHoursBreakdown({ weeks, departmentId, includeChildren });
  return { loading, error, slices, total } as { loading: boolean; error: string | null; slices: Slice[]; total: number };
}

export type { HorizonWeeks, Slice };

