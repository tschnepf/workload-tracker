import { useMemo, useState } from 'react';
import type { Deliverable, Project } from '@/types/models';

export type StatusFilter = 'active' | 'active_ca' | 'on_hold' | 'completed' | 'cancelled' | 'active_no_deliverables' | 'Show All';

export function useProjectStatusFilters(deliverables: Deliverable[]) {
  const statusFilterOptions = ['active', 'active_ca', 'on_hold', 'completed', 'cancelled', 'active_no_deliverables', 'Show All'] as const;
  const [selectedStatusFilters, setSelectedStatusFilters] = useState<Set<StatusFilter>>(new Set<StatusFilter>(['active','active_ca']));

  const formatFilterStatus = (status: StatusFilter): string => {
    switch (status) {
      case 'active_ca': return 'Active (CA)';
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

  const projectHasFutureDeliverables = useMemo(() => {
    const map = new Map<number, boolean>();
    const now = new Date();
    for (const d of deliverables || []) {
      if (!(d as any)?.project || !(d as any)?.date) continue;
      const dt = new Date((d as any).date);
      if (dt >= now) map.set((d as any).project, true);
    }
    return map;
  }, [deliverables]);

  const matchesStatusFilters = (project: Project | undefined | null): boolean => {
    if (!project) return false;
    // Empty set => show everything
    if (selectedStatusFilters.size === 0) return true;
    const status = (project.status || '').toLowerCase();
    const baseMatch = Array.from(selectedStatusFilters).some(f => f !== 'active_no_deliverables' && f === status);
    const noDeliverablesSelected = selectedStatusFilters.has('active_no_deliverables');
    const noDeliverablesMatch = noDeliverablesSelected && status === 'active' && !projectHasFutureDeliverables.get(project.id!);
    return baseMatch || noDeliverablesMatch;
  };

  return { statusFilterOptions, selectedStatusFilters, formatFilterStatus, toggleStatusFilter, matchesStatusFilters } as const;
}

export type UseProjectStatusFiltersReturn = ReturnType<typeof useProjectStatusFilters>;
