import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { peopleApi } from '@/services/api';
import type { Person } from '@/types/models';

export type PeopleSearchToken = { term: string; op: 'or' | 'and' | 'not' };
export type PeopleDepartmentFilter = { departmentId: number; op: 'or' | 'and' | 'not' };

export type PeopleSearchOptions = {
  includeInactive?: boolean;
  searchTerm?: string;
  departmentFilters?: PeopleDepartmentFilter[];
  department?: number;
  includeChildren?: 0 | 1;
  vertical?: number;
  location?: string[];
  ordering?: string;
  pageSize?: number;
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

function normalizeDepartmentFilters(filters?: PeopleDepartmentFilter[]) {
  if (!filters || filters.length === 0) return [];
  const seen = new Set<string>();
  const cleaned: PeopleDepartmentFilter[] = [];
  filters.forEach((filter) => {
    const id = Number(filter?.departmentId);
    if (!Number.isFinite(id) || id < 0) return;
    const op: PeopleDepartmentFilter['op'] = filter?.op === 'not' || filter?.op === 'and' ? filter.op : 'or';
    const key = `${op}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    cleaned.push({ departmentId: id, op });
  });
  return cleaned;
}

export function buildPeopleSearchPayloadBase(options: PeopleSearchOptions) {
  const pageSize = options.pageSize ?? 100;
  const includeInactive = !!options.includeInactive;
  const ordering = options.ordering ?? null;
  const searchTerm = (options.searchTerm || '').trim();
  const departmentFilters = normalizeDepartmentFilters(options.departmentFilters);
  const payload: Record<string, any> = {
    page_size: pageSize,
  };
  if (includeInactive) payload.include_inactive = 1;
  if (ordering) payload.ordering = ordering;
  if (searchTerm) payload.search_tokens = [{ term: searchTerm, op: 'and' } satisfies PeopleSearchToken];
  if (options.department != null) payload.department = options.department;
  if (options.includeChildren != null) payload.include_children = options.includeChildren;
  if (departmentFilters.length) payload.department_filters = departmentFilters;
  if (options.vertical != null) payload.vertical = options.vertical;
  if (options.location && options.location.length) payload.location = options.location;
  return payload;
}

export function buildPeopleSearchQueryKey(options: PeopleSearchOptions) {
  const payload = buildPeopleSearchPayloadBase(options);
  const hash = hashString(stableStringify(payload));
  return ['people', 'search', hash] as const;
}

export function usePeopleSearch(options: PeopleSearchOptions) {
  const payloadBase = useMemo(() => buildPeopleSearchPayloadBase(options), [options]);
  const queryKey = useMemo(() => buildPeopleSearchQueryKey(options), [options]);

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam = 1 }) => peopleApi.searchList({ ...payloadBase, page: pageParam }),
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

  const people = (query.data?.pages || []).flatMap(p => p?.results || []) as Person[];
  const totalCount = query.data?.pages?.[0]?.count ?? 0;

  return {
    people,
    totalCount,
    loading: query.isLoading,
    error: query.error ? (query.error as any).message : null,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}
