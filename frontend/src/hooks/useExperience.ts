import { useQuery } from '@tanstack/react-query';
import { fetchExperienceByClient, fetchPersonExperienceProfile, fetchPersonProjectTimeline, fetchProjectStaffingTimeline, type ExperienceByClientPerson, type PersonExperienceProfile, type PersonProjectTimeline, type ProjectStaffingTimeline } from '@/services/experienceApi';

export function useClientExperienceData(params: { client?: string; departmentId?: number | null; includeChildren?: boolean; start?: string; end?: string; minWeeks?: number; }) {
  const query = useQuery({
    queryKey: ['experienceByClient', params],
    queryFn: () => fetchExperienceByClient(params),
  });
  return { loading: query.isLoading, error: query.error as any, data: query.data } as { loading: boolean; error: any; data: { results: ExperienceByClientPerson[]; count: number } | undefined };
}

export function usePersonExperienceProfile(params: { personId: number; start?: string; end?: string; }) {
  const query = useQuery({
    queryKey: ['personExperienceProfile', params],
    queryFn: () => fetchPersonExperienceProfile(params),
  });
  return { loading: query.isLoading, error: query.error as any, data: query.data } as { loading: boolean; error: any; data: PersonExperienceProfile | undefined };
}

export function usePersonProjectTimeline(params: { personId: number; projectId: number; start?: string; end?: string; }) {
  const query = useQuery({
    queryKey: ['personProjectTimeline', params],
    queryFn: () => fetchPersonProjectTimeline(params),
  });
  return { loading: query.isLoading, error: query.error as any, data: query.data } as { loading: boolean; error: any; data: PersonProjectTimeline | undefined };
}

export function useProjectStaffingTimeline(params: { projectId: number; start?: string; end?: string; }) {
  const query = useQuery({
    queryKey: ['projectStaffingTimeline', params],
    queryFn: () => fetchProjectStaffingTimeline(params),
  });
  return { loading: query.isLoading, error: query.error as any, data: query.data } as { loading: boolean; error: any; data: ProjectStaffingTimeline | undefined };
}

