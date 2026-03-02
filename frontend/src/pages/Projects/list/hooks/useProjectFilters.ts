import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Project } from '@/types/models';
import type { ProjectFilterMetadataResponse } from '@/types/models';
import { formatStatus } from '@/components/projects/StatusBadge';
import { trackPerformanceEvent } from '@/utils/monitoring';
import { useProjectStatusDefinitions } from '@/hooks/useProjectStatusDefinitions';
import { DEFAULT_PROJECT_STATUS_FILTER_KEYS } from '@/components/projects/status.catalog';
import {
  buildFutureDeliverableLookupFromMetadata,
  projectMatchesActiveWithDates,
  projectMatchesActiveWithoutDates,
} from '@/components/projects/statusFilterUtils';

export function useProjectFilters(
  projects: Project[],
  filterMetadata: ProjectFilterMetadataResponse | null,
  options?: {
    customSortGetters?: Record<string, (p: Project) => string | number | Date | null | undefined>;
    extraStatusMatchers?: Record<string, (project: Project, metadata: ProjectFilterMetadataResponse | null) => boolean>;
    serverSide?: boolean;
  }
) {
  const { filterStatusOptions, definitionMap } = useProjectStatusDefinitions();
  const defaultStatuses = useMemo(
    () => new Set<string>(DEFAULT_PROJECT_STATUS_FILTER_KEYS as unknown as string[]),
    []
  );
  // Persisted status filters (default to Active + Active CA)
  const STORAGE_KEY = 'projects.selectedStatusFilters.v1';
  const loadSelectedStatusFilters = (): Set<string> => {
    try {
      if (typeof window === 'undefined') return new Set(defaultStatuses);
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return new Set(defaultStatuses);
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Set(defaultStatuses);
      const cleaned = parsed
        .map((s) => (typeof s === 'string' ? s : ''))
        .filter((s) => !!s);
      if (cleaned.includes('Show All')) return new Set(['Show All']);
      return cleaned.length > 0 ? new Set(cleaned) : new Set(defaultStatuses);
    } catch {
      return new Set(defaultStatuses);
    }
  };
  const [selectedStatusFilters, setSelectedStatusFilters] = useState<Set<string>>(loadSelectedStatusFilters);
  const [sortBy, setSortBy] = useState('client');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [searchTerm, setSearchTerm] = useState('');

  const formatFilterStatus = (status: string): string => {
    if (status === 'Show All') return 'Show All';
    if (status === 'active_no_deliverables') return 'Active - No Dates';
    if (status === 'active_with_dates') return 'Active - With Dates';
    if (status === 'no_assignments') return 'No Assignments';
    if (status === 'missing_qa') return 'Missing QA';
    return formatStatus(status, definitionMap);
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

  const forceShowAll = () => {
    setSelectedStatusFilters(new Set(['Show All']))
  }

  // Persist status filters to localStorage
  useEffect(() => {
    const allowed = new Set<string>(filterStatusOptions as unknown as string[]);
    setSelectedStatusFilters((prev) => {
      if (prev.size === 0) return prev;
      if (prev.has('Show All')) return new Set(['Show All']);
      const next = new Set(Array.from(prev).filter((value) => allowed.has(value)));
      if (next.size === 0) return new Set(defaultStatuses);
      if (next.size === prev.size && Array.from(next).every((value) => prev.has(value))) return prev;
      return next;
    });
  }, [defaultStatuses, filterStatusOptions]);

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const arr = Array.from(selectedStatusFilters);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    } catch {
      // ignore storage errors
    }
  }, [selectedStatusFilters]);

  const hasNoAssignments = (projectId: number | undefined, metadata: ProjectFilterMetadataResponse | null): boolean => {
    if (!projectId) return false;
    const meta = metadata?.projectFilters?.[String(projectId)];
    return meta ? meta.assignmentCount === 0 : false;
  };

  const futureDeliverableLookup = useMemo(
    () => buildFutureDeliverableLookupFromMetadata(filterMetadata),
    [filterMetadata]
  );

  const matchesStatusFilter = useCallback((project: Project, statusFilter: string, metadata: ProjectFilterMetadataResponse | null): boolean => {
    if (!project) return false;
    if (statusFilter === 'Show All') return true;
    if (statusFilter === 'active_no_deliverables') {
      return projectMatchesActiveWithoutDates(project, futureDeliverableLookup);
    }
    if (statusFilter === 'active_with_dates') {
      return projectMatchesActiveWithDates(project, futureDeliverableLookup);
    }
    if (statusFilter === 'no_assignments') {
      return hasNoAssignments(project.id, metadata);
    }
    if (options?.extraStatusMatchers?.[statusFilter]) {
      return options.extraStatusMatchers[statusFilter](project, metadata);
    }
    return project.status === statusFilter;
  }, [futureDeliverableLookup, options?.extraStatusMatchers]);

  const filteredProjects = useMemo(() => {
    if (options?.serverSide) return projects;
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
  }, [projects, selectedStatusFilters, searchTerm, filterMetadata, matchesStatusFilter, options?.serverSide]);

  const sortedProjects = useMemo(() => {
    if (options?.serverSide) return filteredProjects;
    const getter = options?.customSortGetters?.[sortBy];
    // Normalize with direction-awareness for primary key
    const normalize = (v: any): string => {
      if (v == null || v === '') return sortDirection === 'asc' ? '\uffff' : '';
      if (v instanceof Date) return v.toISOString();
      return v.toString().toLowerCase();
    };
    // Normalize specifically for secondary keys that should always be ascending
    const normalizeAsc = (v: any): string => {
      if (v == null || v === '') return '\uffff';
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
          case 'number':
          case 'projectNumber':
            aValue = a.projectNumber || '';
            bValue = b.projectNumber || '';
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

      // Primary comparison
      let primary = normalize(aValue).localeCompare(normalize(bValue));
      primary = sortDirection === 'asc' ? primary : -primary;

      // When sorting by client, apply a stable secondary alphabetical sort by project name
      if (primary === 0 && sortBy === 'client') {
        const aName = normalizeAsc(a.name || '');
        const bName = normalizeAsc(b.name || '');
        return aName.localeCompare(bName);
      }

      return primary;
    });
  }, [filteredProjects, sortBy, sortDirection, options?.customSortGetters, options?.serverSide]);

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
    forceShowAll,
    onSort,
    formatFilterStatus,
    // derived
    filteredProjects,
    sortedProjects,
    statusOptions: filterStatusOptions,
  } as const;
}
