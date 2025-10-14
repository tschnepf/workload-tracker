import { useEffect, useMemo, useState } from 'react';
import type { Project } from '@/types/models';
import type { ProjectFilterMetadataResponse } from '@/types/models';
import { formatStatus } from '@/components/projects/StatusBadge';
import { trackPerformanceEvent } from '@/utils/monitoring';

export function useProjectFilters(
  projects: Project[],
  filterMetadata: ProjectFilterMetadataResponse | null,
  options?: { customSortGetters?: Record<string, (p: Project) => string | number | Date | null | undefined> }
) {
  const [selectedStatusFilters, setSelectedStatusFilters] = useState<Set<string>>(new Set(['active', 'active_ca']));
  const [sortBy, setSortBy] = useState('client');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [searchTerm, setSearchTerm] = useState('');

  const formatFilterStatus = (status: string): string => {
    if (status === 'Show All') return 'Show All';
    if (status === 'active_no_deliverables') return 'Active - No Dates';
    if (status === 'active_ca') return 'Active CA';
    if (status === 'no_assignments') return 'No Assignments';
    return formatStatus(status);
  };

  const toggleStatusFilter = (status: string) => {
    setSelectedStatusFilters((prev) => {
      const next = new Set(prev);
      if (status === 'Show All') {
        return new Set(['Show All']);
      }
      next.delete('Show All');
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      if (next.size === 0) return new Set(['Show All']);
      return next;
    });
  };

  const hasNoAssignments = (projectId: number | undefined, metadata: ProjectFilterMetadataResponse | null): boolean => {
    if (!projectId) return false;
    const meta = metadata?.projectFilters?.[String(projectId)];
    return meta ? meta.assignmentCount === 0 : false;
  };

  const hasNoFutureDeliverables = (projectId: number | undefined, metadata: ProjectFilterMetadataResponse | null): boolean => {
    if (!projectId) return false;
    const meta = metadata?.projectFilters?.[String(projectId)];
    return meta ? !meta.hasFutureDeliverables : false;
  };

  const matchesStatusFilter = (project: Project, statusFilter: string, metadata: ProjectFilterMetadataResponse | null): boolean => {
    if (!project) return false;
    if (statusFilter === 'Show All') return true;
    if (statusFilter === 'active_no_deliverables') {
      return project.status === 'active' && hasNoFutureDeliverables(project.id, metadata);
    }
    if (statusFilter === 'no_assignments') {
      return hasNoAssignments(project.id, metadata);
    }
    return project.status === statusFilter;
  };

  const filteredProjects = useMemo(() => {
    const tStart = performance.now();
    const activeFilters = Array.from(selectedStatusFilters);
    const useShowAll = activeFilters.length === 0 || activeFilters.includes('Show All');
    const next = projects.filter((project) => {
      const matchesStatus = useShowAll
        ? true
        : activeFilters.some((sf) => matchesStatusFilter(project, sf, filterMetadata));
      const matchesSearch = !searchTerm ||
        project.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.client?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.projectNumber?.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesStatus && matchesSearch;
    });
    const tEnd = performance.now();
    trackPerformanceEvent('projects.filter.compute', tEnd - tStart, 'ms', {
      projects: projects.length,
      result: next.length,
      statusFilter: activeFilters.join(','),
    });
    return next;
  }, [projects, selectedStatusFilters, searchTerm, filterMetadata]);

  const sortedProjects = useMemo(() => {
    const getter = options?.customSortGetters?.[sortBy];
    const normalize = (v: any): string => {
      if (v == null || v === '') return sortDirection === 'asc' ? '\uffff' : '';
      if (v instanceof Date) return v.toISOString();
      return v.toString().toLowerCase();
    };
    return [...filteredProjects].sort((a, b) => {
      let aValue: any, bValue: any;
      if (getter) {
        aValue = getter(a);
        bValue = getter(b);
      } else {
        switch (sortBy) {
          case 'client':
            aValue = a.client || '';
            bValue = b.client || '';
            break;
          case 'name':
            aValue = a.name || '';
            bValue = b.name || '';
            break;
          case 'type':
            aValue = a.status || '';
            bValue = b.status || '';
            break;
          case 'status':
            aValue = a.status || '';
            bValue = b.status || '';
            break;
          default:
            aValue = a.name || '';
            bValue = b.name || '';
        }
      }
      const result = normalize(aValue).localeCompare(normalize(bValue));
      return sortDirection === 'asc' ? result : -result;
    });
  }, [filteredProjects, sortBy, sortDirection, options?.customSortGetters]);

  const onSort = (column: string) => {
    if (sortBy === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortDirection('asc');
    }
  };

  return {
    // state
    selectedStatusFilters,
    sortBy,
    sortDirection,
    searchTerm,
    // setters
    setSearchTerm,
    toggleStatusFilter,
    onSort,
    formatFilterStatus,
    // derived
    filteredProjects,
    sortedProjects,
  } as const;
}
