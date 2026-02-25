import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getFlag } from '@/lib/flags';
import { uiApi, type UiBootstrapInclude, type UiBootstrapResponse } from '@/services/api';

const DEFAULT_INCLUDE: UiBootstrapInclude[] = ['verticals', 'capabilities', 'departments', 'roles'];

export function useUiBootstrap(options?: {
  enabled?: boolean;
  include?: UiBootstrapInclude[];
  vertical?: number;
  includeInactive?: boolean;
}) {
  const queryClient = useQueryClient();
  const featureEnabled = getFlag('FF_UI_BOOTSTRAP', true);
  const includeInactiveKey = options?.includeInactive ? 1 : 0;
  const verticalKey = options?.vertical ?? 'all';

  const include = useMemo(() => {
    const source = options?.include && options.include.length > 0 ? options.include : DEFAULT_INCLUDE;
    return Array.from(new Set(source)).sort() as UiBootstrapInclude[];
  }, [options?.include]);

  const enabled = featureEnabled && (options?.enabled ?? true);
  const query = useQuery<UiBootstrapResponse, Error>({
    queryKey: ['uiBootstrap', include.join(','), verticalKey, includeInactiveKey],
    queryFn: () =>
      uiApi.bootstrap({
        include,
        vertical: options?.vertical,
        include_inactive: options?.includeInactive ? 1 : undefined,
      }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled,
  });

  useEffect(() => {
    const data = query.data;
    if (!data) return;
    if (data.verticals) {
      queryClient.setQueryData(['verticalsAll', includeInactiveKey], data.verticals);
    }
    if (data.capabilities) {
      queryClient.setQueryData(['capabilities'], data.capabilities);
    }
    if (data.departmentsAll) {
      queryClient.setQueryData(['departmentsAll', verticalKey, includeInactiveKey], data.departmentsAll);
    }
    if (data.rolesAll) {
      queryClient.setQueryData(['rolesAll', includeInactiveKey], data.rolesAll);
    }
  }, [query.data, queryClient, verticalKey, includeInactiveKey]);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    enabled,
  };
}
