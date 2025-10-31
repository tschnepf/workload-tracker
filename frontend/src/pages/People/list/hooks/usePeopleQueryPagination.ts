import { usePeople } from '@/hooks/usePeople';

export function usePeopleQueryPagination(includeInactive = false) {
  const {
    people,
    loading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    dataUpdatedAt,
    peopleVersion,
  } = usePeople(includeInactive);

  return {
    people,
    loading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    dataUpdatedAt,
    peopleVersion,
  };
}

export type UsePeopleQueryPaginationReturn = ReturnType<typeof usePeopleQueryPagination>;
