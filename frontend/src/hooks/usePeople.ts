import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { peopleApi } from '@/services/api';
import { Person } from '@/types/models';

// People query hook with state adapter for existing code compatibility
export function usePeople() {
  const pageSize = 100;
  const query = useInfiniteQuery({
    queryKey: ['people'],
    queryFn: ({ pageParam = 1 }) => peopleApi.list({ page: pageParam, page_size: pageSize }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      // If server returned a next URL, infer next page; else stop
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

  // Stabilize array identity so downstream effects don't fire on every render
  const pages = query.data?.pages || [];
  const people = useMemo(() => pages.flatMap(p => p?.results || []), [pages]);
  // Provide a lightweight, stable change indicator
  const peopleVersion = people.length; // changes only when count changes
  const loading = query.isLoading || query.isFetching;
  const error = query.error ? (query.error as any).message : null;

  return {
    people,
    peopleVersion,
    dataUpdatedAt: query.dataUpdatedAt,
    loading,
    error,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}

// Single person query hook
export function usePerson(id: number) {
  const { data, isLoading, error: queryError } = useQuery({
    queryKey: ['people', id],
    queryFn: () => peopleApi.get(id),
    enabled: !!id, // Only run query if id is provided
  });

  return {
    person: data,
    loading: isLoading,
    error: queryError ? queryError.message : null
  };
}

// Person utilization query hook (optimized N+1 fix)
export function usePersonUtilization(personId: number, week?: string) {
  const { data, isLoading, error: queryError } = useQuery({
    queryKey: ['person-utilization', personId, week],
    queryFn: () => peopleApi.getPersonUtilization(personId, week),
    enabled: !!personId, // Only run if personId is provided
    staleTime: 10 * 1000, // 10 seconds - utilization changes more frequently
  });

  return {
    utilization: data,
    loading: isLoading,
    error: queryError ? queryError.message : null
  };
}

// People for autocomplete - optimized with longer cache time
export function usePeopleAutocomplete(search?: string) {
  const enabled = !!(search && search.trim().length >= 2);
  const { data, isLoading, error: queryError } = useQuery({
    queryKey: ['people-autocomplete', search || ''],
    queryFn: () => peopleApi.search(search!.trim(), 20),
    enabled,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return {
    people: enabled ? (data || []) : [],
    loading: enabled ? isLoading : false,
    error: queryError ? (queryError as any).message : null,
  };
}

// Person creation mutation
export function useCreatePerson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (personData: Omit<Person, 'id'>) => peopleApi.create(personData),
    onSuccess: () => {
      // Invalidate all people-related queries
      queryClient.invalidateQueries({ queryKey: ['people'] });
      queryClient.invalidateQueries({ queryKey: ['people-autocomplete'] });
    },
  });
}

// Person update mutation
export function useUpdatePerson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Person> }) => 
      peopleApi.update(id, data),
    // Optimistic update with rollback
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['people'] });
      await queryClient.cancelQueries({ queryKey: ['people', id] });

      const prevDetail = queryClient.getQueryData<Person>(['people', id]);
      const prevPages = queryClient.getQueryData<any>(['people']);

      if (prevDetail) {
        queryClient.setQueryData<Person>(['people', id], { ...prevDetail, ...data });
      }
      if (prevPages && Array.isArray(prevPages.pages)) {
        const nextPages = {
          ...prevPages,
          pages: prevPages.pages.map((page: any) => ({
            ...page,
            results: (page?.results || []).map((p: Person) => (p.id === id ? { ...p, ...data } : p))
          }))
        };
        queryClient.setQueryData(['people'], nextPages);
      }

      return { prevDetail, prevPages };
    },
    onError: (_err, variables, context) => {
      if (context?.prevDetail) {
        queryClient.setQueryData(['people', variables.id], context.prevDetail);
      }
      if (context?.prevPages) {
        queryClient.setQueryData(['people'], context.prevPages);
      }
    },
    onSuccess: (updatedPerson, variables) => {
      // Merge server response with requested changes to preserve derived fields (e.g., roleName)
      const merged = { ...(updatedPerson as Person), ...(variables?.data || {}) } as Person;
      queryClient.setQueryData(['people', variables.id], merged);
      // Also update in paginated list cache if present
      const prevPages = queryClient.getQueryData<any>(['people']);
      if (prevPages && Array.isArray(prevPages.pages)) {
        const nextPages = {
          ...prevPages,
          pages: prevPages.pages.map((page: any) => ({
            ...page,
            results: (page?.results || []).map((p: Person) => (p.id === variables.id ? { ...p, ...merged } : p))
          }))
        };
        queryClient.setQueryData(['people'], nextPages);
      }
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: ['people'] });
      queryClient.invalidateQueries({ queryKey: ['people-autocomplete'] });
      queryClient.invalidateQueries({ queryKey: ['person-utilization', variables.id] });
    },
  });
}

// Person deletion mutation
export function useDeletePerson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => peopleApi.delete(id),
    onSuccess: () => {
      // Invalidate all people-related queries
      queryClient.invalidateQueries({ queryKey: ['people'] });
      queryClient.invalidateQueries({ queryKey: ['people-autocomplete'] });
    },
  });
}
