import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { peopleApi } from '@/services/api';
// People query hook with state adapter for existing code compatibility
export function usePeople() {
    const { data, isLoading, isFetching, error: queryError } = useQuery({
        queryKey: ['people'],
        queryFn: () => peopleApi.listAll(),
        staleTime: 30 * 1000, // 30 seconds - people data changes less frequently
    });
    // Adapt to existing state shape that components expect
    const loading = isLoading || isFetching;
    const error = queryError ? queryError.message : null;
    return {
        people: data || [],
        loading,
        error
    };
}
// Single person query hook
export function usePerson(id) {
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
export function usePersonUtilization(personId, week) {
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
export function usePeopleAutocomplete() {
    const { data, isLoading, error: queryError } = useQuery({
        queryKey: ['people-autocomplete'],
        queryFn: () => peopleApi.getForAutocomplete(),
        staleTime: 2 * 60 * 1000, // 2 minutes - autocomplete data can be cached longer
    });
    return {
        people: data || [],
        loading: isLoading,
        error: queryError ? queryError.message : null
    };
}
// Person creation mutation
export function useCreatePerson() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (personData) => peopleApi.create(personData),
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
        mutationFn: ({ id, data }) => peopleApi.update(id, data),
        onSuccess: (updatedPerson, variables) => {
            // Update specific person in cache
            queryClient.setQueryData(['people', variables.id], updatedPerson);
            // Invalidate related queries
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
        mutationFn: (id) => peopleApi.delete(id),
        onSuccess: () => {
            // Invalidate all people-related queries
            queryClient.invalidateQueries({ queryKey: ['people'] });
            queryClient.invalidateQueries({ queryKey: ['people-autocomplete'] });
        },
    });
}
