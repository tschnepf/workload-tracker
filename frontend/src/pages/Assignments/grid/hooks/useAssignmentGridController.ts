import * as React from 'react';
import { useWorkPlanningSearchTokens } from '@/features/work-planning/search/useWorkPlanningSearchTokens';
import { useSaveStateController, type UseSaveStateControllerReturn } from '@/features/work-planning/state/useSaveStateController';
import { hasInvalidWorkloadLikeTokens } from '@/utils/workloadSearch';

export type UseAssignmentGridControllerReturn = ReturnType<typeof useWorkPlanningSearchTokens> &
  UseSaveStateControllerReturn & {
    workloadHintVisible: boolean;
  };

export function useAssignmentGridController(): UseAssignmentGridControllerReturn {
  const search = useWorkPlanningSearchTokens({ idPrefix: 'search' });
  const save = useSaveStateController();

  const workloadHintVisible = React.useMemo(
    () => hasInvalidWorkloadLikeTokens(search.searchTokens),
    [search.searchTokens]
  );

  return {
    ...search,
    ...save,
    workloadHintVisible,
  };
}
