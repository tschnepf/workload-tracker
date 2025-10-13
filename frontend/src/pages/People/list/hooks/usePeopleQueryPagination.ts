import { usePeople } from '@/hooks/usePeople';

export function usePeopleQueryPagination() {
  const {
    people,
    loading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    dataUpdatedAt,
    peopleVersion,
  } = usePeople();

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

