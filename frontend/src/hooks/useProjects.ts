import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { projectsApi } from '@/services/api';
import { PROJECT_FILTER_METADATA_KEY } from '@/hooks/useProjectFilterMetadata';
import { Project } from '@/types/models';

// Projects query hook with state adapter for existing code compatibility
export function useProjects() {
  const pageSize = 100;
  const query = useInfiniteQuery({
    queryKey: ['projects'],
    queryFn: ({ pageParam = 1 }) => projectsApi.list({ page: pageParam, page_size: pageSize }),
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

  const projects = (query.data?.pages || []).flatMap(p => p?.results || []);
  const loading = query.isLoading;
  const refreshing = query.isFetching && !query.isLoading;
  const error = query.error ? (query.error as any).message : null;

  return {
    projects,
    loading,
    refreshing,
    error,
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
    mutationFn: (projectData: Omit<Project, 'id'>) => projectsApi.create(projectData),
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
      projectsApi.update(id, data),
    // Optimistic update with rollback
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['projects'] });
      await queryClient.cancelQueries({ queryKey: ['projects', id] });

      const prevDetail = queryClient.getQueryData<Project>(['projects', id]);
      const prevPages = queryClient.getQueryData<any>(['projects']);

      // Optimistically update detail
      if (prevDetail) {
        queryClient.setQueryData<Project>(['projects', id], { ...prevDetail, ...data });
      }
      // Optimistically update infinite list pages
      if (prevPages && Array.isArray(prevPages.pages)) {
        const nextPages = {
          ...prevPages,
          pages: prevPages.pages.map((page: any) => ({
            ...page,
            results: (page?.results || []).map((p: Project) => (p.id === id ? { ...p, ...data } : p))
          }))
        };
        queryClient.setQueryData(['projects'], nextPages);
      }

      return { prevDetail, prevPages };
    },
    onError: (_err, variables, context) => {
      if (context?.prevDetail) {
        queryClient.setQueryData(['projects', variables.id], context.prevDetail);
      }
      if (context?.prevPages) {
        queryClient.setQueryData(['projects'], context.prevPages);
      }
    },
    onSuccess: (updatedProject, variables) => {
      // Ensure caches reflect server truth
      queryClient.setQueryData(['projects', variables.id], updatedProject);
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects', variables.id] });
      queryClient.invalidateQueries({ queryKey: PROJECT_FILTER_METADATA_KEY });
    },
  });
}

// Project deletion mutation
export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => projectsApi.delete(id),
    onSuccess: () => {
      // Invalidate projects list to remove deleted project
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      // Invalidate filter metadata (remove deleted project entry)
      queryClient.invalidateQueries({ queryKey: PROJECT_FILTER_METADATA_KEY });
    },
  });
}
