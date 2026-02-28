import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getFlag } from '@/lib/flags';
import {
  uiApi,
  type UiPeoplePageInclude,
  type UiPeoplePageSnapshotResponse,
  type UiSkillsPageInclude,
  type UiSkillsPageSnapshotResponse,
  type UiSettingsPageSnapshotResponse,
} from '@/services/api';

export function useUiPeoplePageSnapshot(options?: {
  enabled?: boolean;
  include?: UiPeoplePageInclude[];
  page?: number;
  page_size?: number;
  search?: string;
  department?: number;
  include_children?: 0 | 1;
  department_filters?: Array<{ departmentId: number; op: 'or' | 'and' | 'not' }>;
  vertical?: number;
  include_inactive?: 0 | 1;
  location?: string[];
  ordering?: string;
  selected_person_id?: number;
}) {
  const featureEnabled = getFlag('FF_PEOPLE_SKILLS_SETTINGS_SNAPSHOTS', true);
  const include = useMemo(
    () => Array.from(new Set(options?.include && options.include.length ? options.include : ['filters', 'people'])).sort() as UiPeoplePageInclude[],
    [options?.include],
  );
  return useQuery<UiPeoplePageSnapshotResponse, Error>({
    queryKey: [
      'uiPeoplePage',
      include.join(','),
      options?.page ?? 1,
      options?.page_size ?? 100,
      options?.search ?? '',
      options?.department ?? 'all',
      options?.include_children ?? 0,
      JSON.stringify(options?.department_filters ?? []),
      options?.vertical ?? 'all',
      options?.include_inactive ?? 0,
      JSON.stringify(options?.location ?? []),
      options?.ordering ?? '',
      options?.selected_person_id ?? 'none',
    ],
    queryFn: () => uiApi.peoplePage({ ...options, include }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled: featureEnabled && (options?.enabled ?? true),
  });
}

export function useUiSkillsPageSnapshot(options?: {
  enabled?: boolean;
  include?: UiSkillsPageInclude[];
  vertical?: number;
  include_inactive?: 0 | 1;
  people_page?: number;
  people_page_size?: number;
  skill_tags_page?: number;
  skill_tags_page_size?: number;
  person_skills_page?: number;
  person_skills_page_size?: number;
}) {
  const featureEnabled = getFlag('FF_PEOPLE_SKILLS_SETTINGS_SNAPSHOTS', true);
  const include = useMemo(
    () => Array.from(new Set(options?.include && options.include.length ? options.include : ['departments', 'people', 'skill_tags', 'person_skills'])).sort() as UiSkillsPageInclude[],
    [options?.include],
  );
  return useQuery<UiSkillsPageSnapshotResponse, Error>({
    queryKey: [
      'uiSkillsPage',
      include.join(','),
      options?.vertical ?? 'all',
      options?.include_inactive ?? 0,
      options?.people_page ?? 1,
      options?.people_page_size ?? 100,
      options?.skill_tags_page ?? 1,
      options?.skill_tags_page_size ?? 100,
      options?.person_skills_page ?? 1,
      options?.person_skills_page_size ?? 100,
    ],
    queryFn: () => uiApi.skillsPage({ ...options, include }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled: featureEnabled && (options?.enabled ?? true),
  });
}

export function useUiSettingsPageSnapshot(options?: { enabled?: boolean; section?: string }) {
  const featureEnabled = getFlag('FF_PEOPLE_SKILLS_SETTINGS_SNAPSHOTS', true);
  const queryClient = useQueryClient();
  const query = useQuery<UiSettingsPageSnapshotResponse, Error>({
    queryKey: ['uiSettingsPage', options?.section || 'none'],
    queryFn: () => uiApi.settingsPage({ section: options?.section }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled: featureEnabled && (options?.enabled ?? true),
  });

  useEffect(() => {
    if (!query.data?.capabilities) return;
    queryClient.setQueryData(['capabilities'], query.data.capabilities);
  }, [query.data?.capabilities, queryClient]);

  return query;
}
