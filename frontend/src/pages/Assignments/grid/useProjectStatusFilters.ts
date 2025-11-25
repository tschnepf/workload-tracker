import { useMemo, useState } from 'react';
import type { Deliverable, Project } from '@/types/models';
import {
  buildFutureDeliverableLookupFromDeliverables,
  projectMatchesActiveWithDates,
  projectMatchesActiveWithoutDates,
} from '@/components/projects/statusFilterUtils';

export type StatusFilter =
  | 'active'
  | 'active_ca'
  | 'active_with_dates'
  | 'active_no_deliverables'
  | 'on_hold'
  | 'completed'
  | 'cancelled'
  | 'Show All';

export function useProjectStatusFilters(deliverables: Deliverable[]) {
  const statusFilterOptions = [
    'active',
    'active_ca',
    'active_with_dates',
    'active_no_deliverables',
    'on_hold',
    'completed',
    'cancelled',
    'Show All',
  ] as const;
  const [selectedStatusFilters, setSelectedStatusFilters] = useState<Set<StatusFilter>>(new Set<StatusFilter>(['active', 'active_ca']));

  const formatFilterStatus = (status: StatusFilter): string => {
    switch (status) {
      case 'active_ca': return 'Active (CA)';
      case 'active_with_dates': return 'Active - With Dates';
      case 'active_no_deliverables': return 'Active - No Deliverables';
      case 'on_hold': return 'On Hold';
      case 'completed': return 'Completed';
      case 'cancelled': return 'Cancelled';
      case 'active': return 'Active';
      case 'Show All': return 'Show All';
      default: return String(status);
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
