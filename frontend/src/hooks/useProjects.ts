import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { projectsApi } from '@/services/api';
import { PROJECT_FILTER_METADATA_KEY } from '@/hooks/useProjectFilterMetadata';
import { Project } from '@/types/models';
import { subscribeProjectsRefresh } from '@/lib/projectsRefreshBus';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { createProject, deleteProject, updateProject } from '@/lib/mutations/projects';

export type ProjectsSearchToken = { term: string; op: 'or' | 'and' | 'not' };
export type ProjectsDepartmentFilter = { departmentId: number; op: 'or' | 'and' | 'not' };
export type ProjectsQueryOptions = {
  ordering?: string | null;
  pageSize?: number;
  statusIn?: string | null;
  searchTokens?: ProjectsSearchToken[];
  departmentFilters?: ProjectsDepartmentFilter[];
  includeChildren?: 0 | 1;
  useSearch?: boolean;
  vertical?: number | null;
};

function stableStringify(value: any): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

function hashString(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i);
    hash &= 0xffffffff;
  }
  return (hash >>> 0).toString(36);
}

function normalizeSearchTokens(tokens?: ProjectsSearchToken[]): ProjectsSearchToken[] {
  if (!tokens || tokens.length === 0) return [];
  const cleaned: ProjectsSearchToken[] = [];
  tokens.forEach((token) => {
    const term = (token?.term || '').trim();
    if (!term) return;
    const op: ProjectsSearchToken['op'] =
      token?.op === 'not' || token?.op === 'and' ? token.op : 'or';
    cleaned.push({ term, op });
  });
  return cleaned;
}

function normalizeDepartmentFilters(filters?: ProjectsDepartmentFilter[]): ProjectsDepartmentFilter[] {
  if (!filters || filters.length === 0) return [];
  const seen = new Set<number>();
  const cleaned: ProjectsDepartmentFilter[] = [];
  filters.forEach((filter) => {
    const id = Number(filter?.departmentId);
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) return;
    const op = filter?.op === 'not' || filter?.op === 'or' ? filter.op : 'and';
    cleaned.push({ departmentId: id, op });
    seen.add(id);
  });
  return cleaned.sort((a, b) => (a.departmentId - b.departmentId) || a.op.localeCompare(b.op));
}

export function buildProjectsSearchPayloadBase(options: ProjectsQueryOptions) {
  const pageSize = options.pageSize ?? 100;
  const ordering = options.ordering ?? null;
  const statusIn = options.statusIn ?? null;
  const includeChildren = options.includeChildren;
  const vertical = options.vertical ?? null;
  const searchTokens = normalizeSearchTokens(options.searchTokens);
  const departmentFilters = normalizeDepartmentFilters(options.departmentFilters);
  const payload: Record<string, any> = {
    page_size: pageSize,
  };
  if (ordering) payload.ordering = ordering;
  if (statusIn) payload.status_in = statusIn;
  if (vertical != null) payload.vertical = vertical;
  if (searchTokens.length) payload.search_tokens = searchTokens;
  if (departmentFilters.length) payload.department_filters = departmentFilters;
  if (departmentFilters.length && includeChildren != null) payload.include_children = includeChildren;
  return payload;
}

export function buildProjectsQueryKey(options: ProjectsQueryOptions) {
  const useSearch = options.useSearch ?? true;
  if (!useSearch) {
    const pageSize = options.pageSize ?? 100;
    return ['projects', options.ordering || 'default', pageSize, options.vertical ?? null] as const;
  }
  const payload = buildProjectsSearchPayloadBase(options);
  const hash = hashString(stableStringify(payload));
  return ['projects', 'search', hash] as const;
}

// Projects query hook with state adapter for existing code compatibility
export function useProjects(options: ProjectsQueryOptions = {}) {
  const pageSize = options.pageSize ?? 100;
  const ordering = options.ordering ?? null;
  const useSearch = options.useSearch ?? true;
  const statusIn = options.statusIn ?? null;
  const searchTokens = options.searchTokens ?? [];
  const departmentFilters = options.departmentFilters ?? [];
  const includeChildren = options.includeChildren;
  const vertical = options.vertical ?? null;
  const searchPayloadBase = useMemo(() => buildProjectsSearchPayloadBase({
    pageSize,
    ordering,
    statusIn,
    searchTokens,
    departmentFilters,
    includeChildren,
    vertical,
  }), [pageSize, ordering, statusIn, searchTokens, departmentFilters, includeChildren, vertical]);
  const queryKey = useMemo(() => buildProjectsQueryKey({
    pageSize,
    ordering,
    statusIn,
    searchTokens,
    departmentFilters,
    includeChildren,
    useSearch,
    vertical,
  }), [pageSize, ordering, statusIn, searchTokens, departmentFilters, includeChildren, useSearch, vertical]);
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam = 1 }) => {
      if (useSearch) {
        return projectsApi.search({ ...searchPayloadBase, page: pageParam });
      }
      return projectsApi.list({
        page: pageParam,
        page_size: pageSize,
        ordering: ordering || undefined,
        vertical: vertical ?? undefined,
      });
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (!lastPage?.next) return undefined;
      try {
        const url = new URL(lastPage.next);
        const next = url.searchParams.get('page');
        return next ? Number(next) : undefined;
      } catch {
        return undefined;
      }
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

  const refetchProjects = query.refetch;
  const refreshQueueRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    inFlight: boolean;
    pending: boolean;
  }>({ timer: null, inFlight: false, pending: false });
  const scheduleRefetch = useCallback(() => {
    const queue = refreshQueueRef.current;
    if (queue.timer) return;
    queue.timer = setTimeout(async () => {
      queue.timer = null;
      if (queue.inFlight) {
        queue.pending = true;
        return;
      }
      queue.inFlight = true;
      queue.pending = false;
      try {
        await refetchProjects();
      } finally {
        queue.inFlight = false;
        if (queue.pending) scheduleRefetch();
      }
    }, 300);
  }, [refetchProjects]);
  useEffect(() => {
    const unsubscribe = subscribeProjectsRefresh(() => {
      scheduleRefetch();
    });
    return () => {
      unsubscribe();
      const queue = refreshQueueRef.current;
      if (queue.timer) clearTimeout(queue.timer);
      queue.timer = null;
      queue.inFlight = false;
      queue.pending = false;
    };
  }, [scheduleRefetch]);

  const projects = (query.data?.pages || []).flatMap(p => p?.results || []);
  const loading = query.isLoading;
  const refreshing = query.isFetching && !query.isLoading;
  const error = query.error ? (query.error as any).message : null;

  const totalCount = query.data?.pages?.[0]?.count ?? 0;

  return {
    projects,
    totalCount,
    loading,
    refreshing,
    error,
    queryKey,
    refetch: refetchProjects,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}

// Single project query hook
export function useProject(id: number) {
  const { data, isLoading, error: queryError } = useQuery({
    queryKey: ['projects', id],
    queryFn: () => projectsApi.get(id),
    enabled: !!id, // Only run query if id is provided
  });

  return {
    project: data,
    loading: isLoading,
    error: queryError ? queryError.message : null
  };
}

// Project creation mutation
export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectData: Omit<Project, 'id'>) => createProject(projectData, projectsApi),
    onSuccess: () => {
      // Invalidate projects list to refetch updated data
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      // Invalidate filter metadata (new project may affect filters)
      queryClient.invalidateQueries({ queryKey: PROJECT_FILTER_METADATA_KEY });
    },
  });
}

// Project update mutation
export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Project> }) =>
      updateProject(id, data, projectsApi),
    onSuccess: (_updatedProject, variables) => {
      queryClient.invalidateQueries({ queryKey: ['projects'], refetchType: 'inactive' });
      queryClient.invalidateQueries({ queryKey: ['projects', variables.id], refetchType: 'inactive' });
      queryClient.invalidateQueries({ queryKey: PROJECT_FILTER_METADATA_KEY });
    },
  });
}

// Project deletion mutation
export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => deleteProject(id, projectsApi),
    onSuccess: () => {
      // Invalidate projects list to remove deleted project
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      // Invalidate filter metadata (remove deleted project entry)
      queryClient.invalidateQueries({ queryKey: PROJECT_FILTER_METADATA_KEY });
    },
  });
}
