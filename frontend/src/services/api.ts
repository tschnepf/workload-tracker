/**
 * API service layer - handles all backend communication
 * Uses naming prevention: frontend camelCase <-> backend snake_case
 */

import { Person, Project, Assignment, Department, Deliverable, PersonUtilization, ApiResponse, PaginatedResponse, DashboardData, SkillTag, PersonSkill, AssignmentConflictResponse } from '@/types/models';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public response?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });
    
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      let errorData = null;
      try {
        errorData = await response.json();
        errorMessage = errorData.message || errorData.detail || errorMessage;
      } catch (e) {
        // If JSON parsing fails, use status text
        errorMessage = response.statusText || errorMessage;
      }
      throw new ApiError(errorMessage, response.status, errorData);
    }

    // Handle empty responses (like DELETE operations)
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return undefined as T;
    }

    // Check if response body is empty
    const text = await response.text();
    if (!text) {
      return undefined as T;
    }

    return JSON.parse(text);
  } catch (error) {
    console.error('Fetch error:', error);
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new ApiError('Network error - unable to reach server', 0);
    }
    throw error;
  }
}

// People API
export const peopleApi = {
  // Get all people with pagination support
  list: (params?: { page?: number; page_size?: number; search?: string }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.page_size) queryParams.set('page_size', params.page_size.toString());
    if (params?.search) queryParams.set('search', params.search);
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return fetchApi<PaginatedResponse<Person>>(`/people/${queryString}`);
  },

  // Get all people (bulk API - Phase 2 optimization)
  listAll: async (): Promise<Person[]> => {
    return fetchApi<Person[]>(`/people/?all=true`);
  },

  // Get single person
  get: (id: number) => 
    fetchApi<Person>(`/people/${id}/`),

  // Create person
  create: (data: Omit<Person, 'id' | 'createdAt' | 'updatedAt'>) => 
    fetchApi<Person>('/people/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Update person
  update: (id: number, data: Partial<Person>) => 
    fetchApi<Person>(`/people/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Delete person
  delete: (id: number) => 
    fetchApi<void>(`/people/${id}/`, {
      method: 'DELETE',
    }),

  // Get people for autocomplete (name and basic info)
  getForAutocomplete: async (): Promise<Array<{ id: number; name: string; department?: number; weeklyCapacity?: number }>> => {
    const allPeople = await peopleApi.listAll();
    return allPeople.map(person => ({
      id: person.id!,
      name: person.name,
      department: person.department,
      weeklyCapacity: person.weeklyCapacity
    }));
  },

  // Get person utilization for specific week (optimized to prevent N+1 queries)
  getPersonUtilization: async (personId: number, week?: string): Promise<PersonUtilization> => {
    const queryParams = new URLSearchParams();
    if (week) queryParams.set('week', week);
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return fetchApi<PersonUtilization>(`/people/${personId}/utilization/${queryString}`);
  },
};

// Projects API
export const projectsApi = {
  // Get all projects with pagination support
  list: (params?: { page?: number; page_size?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.page_size) queryParams.set('page_size', params.page_size.toString());
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return fetchApi<PaginatedResponse<Project>>(`/projects/${queryString}`);
  },

  // Get all projects (bulk API - Phase 2 optimization)
  listAll: async (): Promise<Project[]> => {
    return fetchApi<Project[]>(`/projects/?all=true`);
  },

  // Get single project
  get: (id: number) => 
    fetchApi<Project>(`/projects/${id}/`),

  // Create project
  create: (data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => 
    fetchApi<Project>('/projects/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Update project
  update: (id: number, data: Partial<Project>) => 
    fetchApi<Project>(`/projects/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Delete project
  delete: (id: number) => 
    fetchApi<void>(`/projects/${id}/`, {
      method: 'DELETE',
    }),

  // Get unique clients for autocomplete
  getClients: async (): Promise<string[]> => {
    const allProjects = await projectsApi.listAll();
    const clients = [...new Set(allProjects.map(p => p.client).filter(Boolean))];
    return clients.sort();
  },
};

// Departments API
export const departmentsApi = {
  // Get all departments with pagination support
  list: (params?: { page?: number; page_size?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.page_size) queryParams.set('page_size', params.page_size.toString());
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return fetchApi<PaginatedResponse<Department>>(`/departments/${queryString}`);
  },

  // Get all departments (bulk API - Phase 2 optimization)
  listAll: async (): Promise<Department[]> => {
    return fetchApi<Department[]>(`/departments/?all=true`);
  },

  // Get single department
  get: (id: number) => 
    fetchApi<Department>(`/departments/${id}/`),

  // Create department
  create: (data: Omit<Department, 'id' | 'managerName' | 'createdAt' | 'updatedAt'>) => 
    fetchApi<Department>('/departments/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Update department
  update: (id: number, data: Partial<Department>) => 
    fetchApi<Department>(`/departments/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Delete department
  delete: (id: number) => 
    fetchApi<void>(`/departments/${id}/`, {
      method: 'DELETE',
    }),
};

// Assignment API
export const assignmentsApi = {
  // Get all assignments with pagination support
  list: (params?: { page?: number; page_size?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.page_size) queryParams.set('page_size', params.page_size.toString());
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return fetchApi<PaginatedResponse<Assignment>>(`/assignments/${queryString}`);
  },

  // Get all assignments (bulk API - Phase 2 optimization)
  listAll: async (): Promise<Assignment[]> => {
    return fetchApi<Assignment[]>(`/assignments/?all=true`);
  },

  // Get assignments for specific person
  byPerson: (personId: number) => 
    fetchApi<Assignment[]>(`/assignments/by_person/?person_id=${personId}`),

  // Create assignment
  create: (data: Omit<Assignment, 'id' | 'createdAt' | 'updatedAt' | 'personName'>) => 
    fetchApi<Assignment>('/assignments/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Update assignment
  update: (id: number, data: Partial<Assignment>) => 
    fetchApi<Assignment>(`/assignments/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Delete assignment
  delete: (id: number) => 
    fetchApi<void>(`/assignments/${id}/`, {
      method: 'DELETE',
    }),

  // Check assignment conflicts (optimized to prevent N+1 queries)
  checkConflicts: async (
    personId: number, 
    projectId: number, 
    weekKey: string, 
    proposedHours: number
  ): Promise<AssignmentConflictResponse> => {
    return fetchApi<AssignmentConflictResponse>('/assignments/check_conflicts/', {
      method: 'POST',
      body: JSON.stringify({
        personId,
        projectId,
        weekKey,
        proposedHours
      }),
    });
  },
};

// Person utilization API
export const utilizationApi = {
  // Get person utilization
  getPersonUtilization: (personId: number) =>
    fetchApi<PersonUtilization>(`/people/${personId}/utilization/`),
};

// Deliverables API - STANDARDS COMPLIANT
export const deliverablesApi = {
  // Get all deliverables or filter by project with pagination support
  list: (projectId?: number, params?: { page?: number; page_size?: number }) => {
    const queryParams = new URLSearchParams();
    if (projectId) queryParams.set('project', projectId.toString());
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.page_size) queryParams.set('page_size', params.page_size.toString());
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return fetchApi<PaginatedResponse<Deliverable>>(`/deliverables/${queryString}`);
  },

  // Get all deliverables (bulk API - Phase 2 optimization)
  listAll: async (projectId?: number): Promise<Deliverable[]> => {
    const queryParams = new URLSearchParams();
    if (projectId) queryParams.set('project', projectId.toString());
    queryParams.set('all', 'true');
    const queryString = queryParams.toString();
    return fetchApi<Deliverable[]>(`/deliverables/?${queryString}`);
  },

  // Get single deliverable  
  get: (id: number) =>
    fetchApi<Deliverable>(`/deliverables/${id}/`),

  // Create deliverable
  create: (data: Omit<Deliverable, 'id' | 'createdAt' | 'updatedAt'>) =>
    fetchApi<Deliverable>('/deliverables/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Update deliverable
  update: (id: number, data: Partial<Deliverable>) =>
    fetchApi<Deliverable>(`/deliverables/${id}/`, {
      method: 'PATCH', 
      body: JSON.stringify(data),
    }),

  // Delete deliverable
  delete: (id: number) =>
    fetchApi<void>(`/deliverables/${id}/`, {
      method: 'DELETE',
    }),

  // Bulk fetch deliverables for multiple projects (Phase 2 optimization)
  bulkList: async (projectIds: number[]): Promise<{ [projectId: string]: Deliverable[] }> => {
    if (projectIds.length === 0) return {};
    
    const projectIdsString = projectIds.join(',');
    return fetchApi<{ [projectId: string]: Deliverable[] }>(`/deliverables/bulk/?project_ids=${projectIdsString}`);
  },

  // Reorder deliverables for a project
  reorder: (projectId: number, deliverableIds: number[]) =>
    fetchApi<void>('/deliverables/reorder/', {
      method: 'POST',
      body: JSON.stringify({ 
        project: projectId, 
        deliverable_ids: deliverableIds 
      }),
    }),
};

// Dashboard API
export const dashboardApi = {
  // Get dashboard data with optional weeks and department parameters
  getDashboard: (weeks?: number, department?: string) => {
    const params = new URLSearchParams();
    if (weeks && weeks !== 1) params.set('weeks', weeks.toString());
    if (department) params.set('department', department);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return fetchApi<DashboardData>(`/dashboard/${queryString}`);
  },
};

// Skills API
export const skillTagsApi = {
  // List skill tags
  list: (params?: { search?: string }) => {
    const queryParams = params ? new URLSearchParams(
      Object.entries(params).filter(([_, value]) => value !== undefined && value !== '')
        .map(([key, value]) => [key, String(value)])
    ).toString() : '';
    const url = queryParams ? `/skills/skill-tags/?${queryParams}` : '/skills/skill-tags/';
    return fetchApi<PaginatedResponse<SkillTag>>(url);
  },

  // Get skill tag
  get: (id: number) =>
    fetchApi<SkillTag>(`/skills/skill-tags/${id}/`),

  // Create skill tag
  create: (data: Omit<SkillTag, 'id' | 'isActive' | 'createdAt' | 'updatedAt'>) =>
    fetchApi<SkillTag>('/skills/skill-tags/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Update skill tag
  update: (id: number, data: Partial<SkillTag>) =>
    fetchApi<SkillTag>(`/skills/skill-tags/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Delete skill tag
  delete: (id: number) =>
    fetchApi<void>(`/skills/skill-tags/${id}/`, {
      method: 'DELETE',
    }),
};

export const personSkillsApi = {
  // List person skills
  list: (params?: { person?: number; skill_type?: string }) => {
    const queryParams = params ? new URLSearchParams(
      Object.entries(params).filter(([_, value]) => value !== undefined && value !== '')
        .map(([key, value]) => [key, String(value)])
    ).toString() : '';
    const url = queryParams ? `/skills/person-skills/?${queryParams}` : '/skills/person-skills/';
    return fetchApi<PaginatedResponse<PersonSkill>>(url);
  },

  // Get person skill
  get: (id: number) =>
    fetchApi<PersonSkill>(`/skills/person-skills/${id}/`),

  // Create person skill
  create: (data: Omit<PersonSkill, 'id' | 'skillTagName' | 'createdAt' | 'updatedAt'>) =>
    fetchApi<PersonSkill>('/skills/person-skills/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Update person skill
  update: (id: number, data: Partial<PersonSkill>) =>
    fetchApi<PersonSkill>(`/skills/person-skills/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Delete person skill
  delete: (id: number) =>
    fetchApi<void>(`/skills/person-skills/${id}/`, {
      method: 'DELETE',
    }),

  // Get skill summary for a person
  summary: (personId: number) =>
    fetchApi<{
      strengths: Array<{ skillTagName: string; skillType: string; proficiencyLevel: string }>;
      development: Array<{ skillTagName: string; skillType: string; proficiencyLevel: string }>;
      learning: Array<{ skillTagName: string; skillType: string; proficiencyLevel: string }>;
    }>(`/skills/person-skills/summary/?person=${personId}`),
};

export { ApiError };