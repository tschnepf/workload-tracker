import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '@/services/api';
import { PROJECT_FILTER_METADATA_KEY } from '@/hooks/useProjectFilterMetadata';
import { Project } from '@/types/models';

// Projects query hook with state adapter for existing code compatibility
export function useProjects() {
  const { data, isLoading, isFetching, error: queryError } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.listAll(),
    staleTime: 30 * 1000, // 30 seconds
  });

  // Adapt to existing state shape that components expect
  const loading = isLoading || isFetching;
  const error = queryError ? queryError.message : null;

  return { 
    projects: data || [], 
    loading, 
    error 
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
    onSuccess: (updatedProject, variables) => {
      // Update specific project in cache
      queryClient.setQueryData(['projects', variables.id], updatedProject);
      // Invalidate projects list to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      // Invalidate filter metadata (status/name/client can influence filters)
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
