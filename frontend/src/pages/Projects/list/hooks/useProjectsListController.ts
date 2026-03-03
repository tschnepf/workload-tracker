import { useCallback } from 'react';
import { useWorkPlanningSearchTokens } from '@/features/work-planning/search/useWorkPlanningSearchTokens';

export type UseProjectsListControllerReturn = ReturnType<typeof useWorkPlanningSearchTokens> & {
  focusProjectsSearch: () => void;
};

export function useProjectsListController(): UseProjectsListControllerReturn {
  const search = useWorkPlanningSearchTokens({
    idPrefix: 'p',
    includePendingInputToken: true,
  });

  const focusProjectsSearch = useCallback(() => {
    if (typeof document === 'undefined') return;
    const input = document.getElementById('projects-search') as HTMLInputElement | null;
    input?.focus();
    input?.select();
  }, []);

  return {
    ...search,
    focusProjectsSearch,
  };
}
