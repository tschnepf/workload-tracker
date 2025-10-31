import { rawClient } from '@/api/client';
import { authHeaders } from '@/api/client';
import createClient from 'openapi-fetch';
import type { paths } from '@/api/schema';

export type ExperienceByClientPerson = {
  personId: number;
  personName: string;
  departmentId?: number | null;
  totals: { weeks: number; hours: number; projectsCount: number };
  roles: Record<string, { roleId: number; weeks: number; hours: number }>;
};

export async function fetchExperienceByClient(params: {
  client?: string;
  departmentId?: number | null;
  includeChildren?: boolean;
  start?: string;
  end?: string;
  minWeeks?: number;
}) {
  const search = new URLSearchParams();
  if (params.client) search.set('client', params.client);
  if (params.departmentId != null) search.set('department', String(params.departmentId));
  if (params.includeChildren) search.set('include_children', '1');
  if (params.start) search.set('start', params.start);
  if (params.end) search.set('end', params.end);
  if (params.minWeeks != null) search.set('min_weeks', String(params.minWeeks));
  const typed = createClient<paths>({ baseUrl: '' });
  const res = await typed.GET('/api/assignments/experience_by_client/', {
    params: { query: Object.fromEntries(search.entries()) as any },
    headers: authHeaders(),
  });
  return res.data as unknown as { results: ExperienceByClientPerson[]; count: number };
}

export type PersonExperienceProfile = {
  byClient: Array<{
    client: string;
    weeks: number;
    hours: number;
    roles: Record<string, { roleId: number; weeks: number; hours: number }>;
    phases: Record<string, { phase: string; weeks: number; hours: number }>;
  }>;
  byProject: Array<{
    projectId: number;
    projectName: string;
    client: string;
    weeks: number;
    hours: number;
    roles: Record<string, { roleId: number; weeks: number; hours: number }>;
    phases: Record<string, { phase: string; weeks: number; hours: number }>;
  }>;
  eventsCount: number;
};

export async function fetchPersonExperienceProfile(params: { personId: number; start?: string; end?: string; }) {
  const search = new URLSearchParams();
  search.set('person', String(params.personId));
  if (params.start) search.set('start', params.start);
  if (params.end) search.set('end', params.end);
  const typed = createClient<paths>({ baseUrl: '' });
  const res = await typed.GET('/api/assignments/person_experience_profile/', {
    params: { query: Object.fromEntries(search.entries()) as any },
    headers: authHeaders(),
  });
  return res.data as unknown as PersonExperienceProfile;
}

export type PersonProjectTimeline = {
  weeksSummary: { weeks: number; hours: number };
  coverageBlocks: Array<{ roleId: number; start: string; end: string; weeks: number; hours: number }>;
  events: Array<{ week_start: string; event_type: 'joined' | 'left'; deliverable_phase: string; hours_before: number; hours_after: number }>;
  roleChanges: Array<{ week_start: string; roleFromId: number; roleToId: number }>;
};

export async function fetchPersonProjectTimeline(params: { personId: number; projectId: number; start?: string; end?: string; }) {
  const search = new URLSearchParams();
  search.set('person', String(params.personId));
  search.set('project', String(params.projectId));
  if (params.start) search.set('start', params.start);
  if (params.end) search.set('end', params.end);
  const typed = createClient<paths>({ baseUrl: '' });
  const res = await typed.GET('/api/assignments/person_project_timeline/', {
    params: { query: Object.fromEntries(search.entries()) as any },
    headers: authHeaders(),
  });
  return res.data as unknown as PersonProjectTimeline;
}

export type ProjectStaffingTimeline = {
  people: Array<{ personId: number; personName: string; roles: Array<{ roleId: number | null; weeks: number; hours: number }>; events: Array<{ week_start: string; event_type: 'joined' | 'left' }> }>;
  roleAggregates: Array<{ roleId: number | null; peopleCount: number; weeks: number; hours: number }>;
};

export async function fetchProjectStaffingTimeline(params: { projectId: number; start?: string; end?: string; }) {
  const search = new URLSearchParams();
  search.set('project', String(params.projectId));
  if (params.start) search.set('start', params.start);
  if (params.end) search.set('end', params.end);
  const typed = createClient<paths>({ baseUrl: '' });
  const res = await typed.GET('/api/assignments/project_staffing_timeline/', {
    params: { query: Object.fromEntries(search.entries()) as any },
    headers: authHeaders(),
  });
  return res.data as unknown as ProjectStaffingTimeline;
}
