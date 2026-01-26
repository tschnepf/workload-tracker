import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { projectsApi } from '@/services/api';
import { PROJECT_FILTER_METADATA_KEY } from '@/hooks/useProjectFilterMetadata';
import { Project } from '@/types/models';
import { subscribeProjectsRefresh } from '@/lib/projectsRefreshBus';
import { useCallback, useEffect, useRef } from 'react';
import { createProject, deleteProject, updateProject } from '@/lib/mutations/projects';

// Projects query hook with state adapter for existing code compatibility
export function useProjects(options?: { ordering?: string | null; pageSize?: number }) {
  const pageSize = options?.pageSize ?? 100;
  const ordering = options?.ordering ?? null;
  const query = useInfiniteQuery({
    queryKey: ['projects', ordering || 'default', pageSize],
    queryFn: ({ pageParam = 1 }) => projectsApi.list({
      page: pageParam,
      page_size: pageSize,
      ordering: ordering || undefined,
    }),
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

  return {
    projects,
    loading,
    refreshing,
    error,
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
