import { apiClient, authHeaders } from '@/api/client';

export type PersonReportBootstrap = {
  defaults: {
    monthsDefault: number;
    monthsMin: number;
    monthsMax: number;
    includeInactiveDefault: boolean;
    checkinPeriodMonthsDefault: number;
  };
  departments: Array<{ id: number; name: string; peopleCount: number }>;
  skillTags: Array<{ id: number; name: string; departmentId: number | null }>;
};

export type PersonReportPersonListItem = {
  id: number;
  name: string;
  departmentId: number | null;
  isActive: boolean;
  roleName: string | null;
};

export type PersonReportPeopleResponse = {
  people: PersonReportPersonListItem[];
  count: number;
};

export type PersonReportProfile = {
  window: { start: string; end: string; months: number };
  person: {
    id: number;
    name: string;
    departmentId: number | null;
    departmentName: string | null;
    roleName: string | null;
    isActive: boolean;
  };
  summary: {
    projectsWorked: number;
    totalHours: number;
    activeWeeks: number;
    avgWeeklyHours: number;
    eventsCount: number;
  };
  topClients: Array<{ client: string; totalHours: number; projectCount: number; activeWeeks: number }>;
  roleMix: Array<{ roleId: number | null; roleName: string | null; totalHours: number; activeWeeks: number }>;
  projects: Array<{
    projectId: number | null;
    projectName: string;
    client: string;
    totalHours: number;
    activeWeeks: number;
    avgWeeklyHours: number;
    startDate: string | null;
    endDate: string | null;
    firstWeek: string | null;
    lastWeek: string | null;
  }>;
  skills: {
    strengths: Array<{ personSkillId: number; skillTagId: number; skillTagName: string; skillType: string; proficiencyLevel: string; updatedAt: string | null }>;
    inProgress: Array<{ personSkillId: number; skillTagId: number; skillTagName: string; skillType: string; proficiencyLevel: string; updatedAt: string | null }>;
    goals: Array<{ personSkillId: number; skillTagId: number; skillTagName: string; skillType: string; proficiencyLevel: string; updatedAt: string | null }>;
    developedInWindow: Array<{ personSkillId: number; skillTagId: number; skillTagName: string; skillType: string; proficiencyLevel: string; updatedAt: string | null }>;
  };
};

export type PersonReportGoal = {
  id: number;
  personId: number;
  title: string;
  description: string;
  goalType: 'skill' | 'freeform';
  skillTagId: number | null;
  skillTagName: string | null;
  linkedPersonSkillId: number | null;
  status: 'active' | 'achieved' | 'not_achieved' | 'cancelled';
  targetDate: string | null;
  closedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type PersonReportCheckinGoalSnapshot = {
  id: number;
  goalId: number | null;
  titleSnapshot: string;
  goalTypeSnapshot: 'skill' | 'freeform';
  skillTagSnapshot: string;
  outcome: 'achieved' | 'not_achieved' | 'carry_forward';
  notes: string;
  createdAt: string | null;
};

export type PersonReportCheckin = {
  id: number;
  personId: number;
  periodStart: string;
  periodEnd: string;
  checkinDate: string;
  summary: string;
  createdById: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  goalSnapshots: PersonReportCheckinGoalSnapshot[];
};

function ensureData<T>(res: any): T {
  if (!res?.data) {
    const status = res?.response?.status ?? 500;
    throw new Error(`HTTP ${status}`);
  }
  return res.data as T;
}

export const personReportApi = {
  bootstrap: async (opts?: { vertical?: number; include_inactive?: 0 | 1 }): Promise<PersonReportBootstrap> => {
    const query: Record<string, any> = {};
    if (opts?.vertical != null) query.vertical = opts.vertical;
    if (opts?.include_inactive != null) query.include_inactive = opts.include_inactive;
    const res = await apiClient.GET('/reports/person-report/bootstrap/' as any, {
      params: { query },
      headers: authHeaders(),
    });
    return ensureData<PersonReportBootstrap>(res);
  },

  people: async (opts: {
    department: number;
    search?: string;
    include_inactive?: 0 | 1;
    limit?: number;
  }): Promise<PersonReportPeopleResponse> => {
    const query: Record<string, any> = { department: opts.department };
    if (opts.search) query.search = opts.search;
    if (opts.include_inactive != null) query.include_inactive = opts.include_inactive;
    if (opts.limit != null) query.limit = opts.limit;
    const res = await apiClient.GET('/reports/person-report/people/' as any, {
      params: { query },
      headers: authHeaders(),
    });
    return ensureData<PersonReportPeopleResponse>(res);
  },

  profile: async (opts: { person: number; months: number }): Promise<PersonReportProfile> => {
    const res = await apiClient.GET('/reports/person-report/profile/' as any, {
      params: { query: { person: opts.person, months: opts.months } },
      headers: authHeaders(),
    });
    return ensureData<PersonReportProfile>(res);
  },

  goals: async (opts: { person: number; status?: string }): Promise<{ goals: PersonReportGoal[] }> => {
    const query: Record<string, any> = { person: opts.person };
    if (opts.status) query.status = opts.status;
    const res = await apiClient.GET('/reports/person-report/goals/' as any, {
      params: { query },
      headers: authHeaders(),
    });
    return ensureData<{ goals: PersonReportGoal[] }>(res);
  },

  createGoal: async (payload: {
    personId: number;
    goalType: 'skill' | 'freeform';
    title?: string;
    description?: string;
    skillTagId?: number;
    status?: 'active' | 'achieved' | 'not_achieved' | 'cancelled';
    targetDate?: string | null;
  }): Promise<{ goal: PersonReportGoal }> => {
    const res = await apiClient.POST('/reports/person-report/goals/' as any, {
      body: payload as any,
      headers: authHeaders(),
    });
    return ensureData<{ goal: PersonReportGoal }>(res);
  },

  updateGoal: async (
    goalId: number,
    payload: {
      title?: string;
      description?: string;
      skillTagId?: number;
      status?: 'active' | 'achieved' | 'not_achieved' | 'cancelled';
      targetDate?: string | null;
    }
  ): Promise<{ goal: PersonReportGoal }> => {
    const res = await apiClient.PATCH('/reports/person-report/goals/{goal_id}/' as any, {
      params: { path: { goal_id: goalId } },
      body: payload as any,
      headers: authHeaders(),
    });
    return ensureData<{ goal: PersonReportGoal }>(res);
  },

  checkins: async (opts: { person: number }): Promise<{ checkins: PersonReportCheckin[] }> => {
    const res = await apiClient.GET('/reports/person-report/checkins/' as any, {
      params: { query: { person: opts.person } },
      headers: authHeaders(),
    });
    return ensureData<{ checkins: PersonReportCheckin[] }>(res);
  },

  createCheckin: async (payload: {
    personId: number;
    periodStart: string;
    periodEnd: string;
    checkinDate?: string;
    summary?: string;
    goalOutcomes?: Array<{ goalId: number; outcome: 'achieved' | 'not_achieved' | 'carry_forward'; notes?: string }>;
  }): Promise<{ checkin: PersonReportCheckin }> => {
    const res = await apiClient.POST('/reports/person-report/checkins/' as any, {
      body: payload as any,
      headers: authHeaders(),
    });
    return ensureData<{ checkin: PersonReportCheckin }>(res);
  },
};
