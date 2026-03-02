import { useMemo, useState } from 'react';
import type { Deliverable, Project } from '@/types/models';
import {
  buildFutureDeliverableLookupFromDeliverables,
  projectMatchesActiveWithDates,
  projectMatchesActiveWithoutDates,
} from '@/components/projects/statusFilterUtils';
import { useProjectStatusDefinitions } from '@/hooks/useProjectStatusDefinitions';
import { DEFAULT_PROJECT_STATUS_FILTER_KEYS } from '@/components/projects/status.catalog';
import { formatStatus } from '@/components/projects/status.utils';

export type StatusFilter =
  | string
  | 'active_with_dates'
  | 'active_no_deliverables'
  | 'Show All';

export function useProjectStatusFilters(deliverables: Deliverable[]) {
  const { statusOptionKeys, definitionMap } = useProjectStatusDefinitions();
  const statusFilterOptions = useMemo(
    () => [...statusOptionKeys, 'active_with_dates', 'active_no_deliverables', 'Show All'] as readonly StatusFilter[],
    [statusOptionKeys]
  );
  const [selectedStatusFilters, setSelectedStatusFilters] = useState<Set<StatusFilter>>(
    new Set<StatusFilter>(DEFAULT_PROJECT_STATUS_FILTER_KEYS as unknown as StatusFilter[])
  );

  const formatFilterStatus = (status: StatusFilter): string => {
    switch (status) {
      case 'active_with_dates': return 'Active - With Dates';
      case 'active_no_deliverables': return 'Active - No Deliverables';
      case 'Show All': return 'Show All';
      default: return formatStatus(status, definitionMap);
    }
  };

  const toggleStatusFilter = (status: StatusFilter) => {
    setSelectedStatusFilters(prev => {
      // Show All means: clear the filter set (no filtering)
      if (status === 'Show All') {
        return new Set<StatusFilter>();
      }
      const next = new Set<StatusFilter>(prev);
      if (next.has(status)) next.delete(status); else next.add(status);
      return next;
    });
  };

  const futureDeliverableLookup = useMemo(
    () => buildFutureDeliverableLookupFromDeliverables(deliverables),
    [deliverables]
  );

  const matchesStatusFilters = (project: Project | undefined | null): boolean => {
    if (!project) return false;
    if (selectedStatusFilters.size === 0 || selectedStatusFilters.has('Show All')) return true;
    const status = (project.status || '').toLowerCase();
    const baseFilters = Array.from(selectedStatusFilters)
      .filter((f) => f !== 'Show All' && f !== 'active_no_deliverables' && f !== 'active_with_dates')
      .map((f) => f.toLowerCase());
    const baseMatch = baseFilters.includes(status);
    const wantsNoDeliverables = selectedStatusFilters.has('active_no_deliverables');
    const wantsWithDates = selectedStatusFilters.has('active_with_dates');
    const withDatesMatch = wantsWithDates && projectMatchesActiveWithDates(project, futureDeliverableLookup);
    const noDeliverablesMatch = wantsNoDeliverables && projectMatchesActiveWithoutDates(project, futureDeliverableLookup);
    return baseMatch || withDatesMatch || noDeliverablesMatch;
  };

  return { statusFilterOptions, selectedStatusFilters, formatFilterStatus, toggleStatusFilter, matchesStatusFilters } as const;
}

export type UseProjectStatusFiltersReturn = ReturnType<typeof useProjectStatusFilters>;
