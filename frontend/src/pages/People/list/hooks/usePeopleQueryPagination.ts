import { usePeople } from '@/hooks/usePeople';

export function usePeopleQueryPagination(options: { includeInactive?: boolean; vertical?: number } = {}) {
  const {
    people,
    loading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    dataUpdatedAt,
    peopleVersion,
  } = usePeople(options);

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
