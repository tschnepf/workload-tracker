import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ProjectStatusDefinition } from '@/types/models';
import { projectStatusDefinitionsApi } from '@/services/projectStatusDefinitionsApi';
import {
  FALLBACK_PROJECT_STATUS_DEFINITIONS,
  SPECIAL_PROJECT_STATUS_FILTER_TOKENS,
  buildStatusDefinitionMap,
  normalizeStatusKey,
} from '@/components/projects/status.catalog';

export const PROJECT_STATUS_DEFINITIONS_QUERY_KEY = ['projectStatusDefinitions'] as const;

function sortDefinitions(definitions: ProjectStatusDefinition[]): ProjectStatusDefinition[] {
  return [...definitions].sort((a, b) => {
    const order = (a.sortOrder || 0) - (b.sortOrder || 0);
    if (order !== 0) return order;
    return (a.label || '').localeCompare(b.label || '');
  });
}

export function useProjectStatusDefinitions(options?: { enabled?: boolean }) {
  const query = useQuery<ProjectStatusDefinition[], Error>({
    queryKey: PROJECT_STATUS_DEFINITIONS_QUERY_KEY,
    queryFn: () => projectStatusDefinitionsApi.list(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled: options?.enabled ?? true,
  });

  const definitions = useMemo(
    () => sortDefinitions((query.data && query.data.length > 0) ? query.data : FALLBACK_PROJECT_STATUS_DEFINITIONS),
    [query.data]
  );

  const definitionMap = useMemo(() => buildStatusDefinitionMap(definitions), [definitions]);
  const activeDefinitions = useMemo(
    () => definitions.filter((item) => item.isActive),
    [definitions],
  );
  const statusOptionKeys = useMemo(
    () => activeDefinitions.map((item) => normalizeStatusKey(item.key)).filter(Boolean),
    [activeDefinitions],
  );
  const editableStatusOptions = statusOptionKeys;
  const allStatusOptions = useMemo(
    () => definitions.map((item) => normalizeStatusKey(item.key)).filter(Boolean),
    [definitions],
  );
  const filterStatusOptions = useMemo(
    () => [...statusOptionKeys, ...SPECIAL_PROJECT_STATUS_FILTER_TOKENS],
    [statusOptionKeys],
  );

  return {
    ...query,
    definitions,
    definitionMap,
    activeDefinitions,
    statusOptionKeys,
    editableStatusOptions,
    allStatusOptions,
    filterStatusOptions,
  };
}
