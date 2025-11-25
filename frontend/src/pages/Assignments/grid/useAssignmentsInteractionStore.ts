import { useMemo } from 'react';
import { useCellSelection } from '@/pages/Assignments/grid/useCellSelection';
import { useScrollSync } from '@/pages/Assignments/grid/useScrollSync';
import { useLayoutDensity } from '@/components/layout/useLayoutDensity';

export type AssignmentInteractionStoreArgs = {
  weeks: string[];
  rowOrder: string[];
};

export type AssignmentInteractionStore = {
  selection: ReturnType<typeof useCellSelection>;
  scroll: ReturnType<typeof useScrollSync>;
  density: ReturnType<typeof useLayoutDensity>;
};

export function useAssignmentsInteractionStore({ weeks, rowOrder }: AssignmentInteractionStoreArgs): AssignmentInteractionStore {
  const selection = useCellSelection(weeks, rowOrder);
  const scroll = useScrollSync();
  const density = useLayoutDensity();

  return useMemo(() => ({ selection, scroll, density }), [selection, scroll, density]);
}
