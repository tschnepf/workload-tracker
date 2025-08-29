/**
 * API service layer - handles all backend communication
 * Uses naming prevention: frontend camelCase <-> backend snake_case
 */

import { Person, Project, Assignment, Department, Deliverable, PersonUtilization, ApiResponse, PaginatedResponse, DashboardData, SkillTag, PersonSkill } from '@/types/models';

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
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.detail || errorMessage;
      } catch (e) {
        // If JSON parsing fails, use status text
        errorMessage = response.statusText || errorMessage;
      }
      throw new ApiError(errorMessage, response.status);
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
  // Get all people
  list: () => 
    fetchApi<PaginatedResponse<Person>>('/people/'),

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
};

// Projects API
export const projectsApi = {
  // Get all projects
  list: () => 
    fetchApi<PaginatedResponse<Project>>('/projects/'),

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
};

// Departments API
export const departmentsApi = {
  // Get all departments
  list: () => 
    fetchApi<PaginatedResponse<Department>>('/departments/'),

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
  // Get all assignments
  list: () => 
    fetchApi<PaginatedResponse<Assignment>>('/assignments/'),

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
};

// Person utilization API
export const utilizationApi = {
  // Get person utilization
  getPersonUtilization: (personId: number) =>
    fetchApi<PersonUtilization>(`/people/${personId}/utilization/`),
};

// Deliverables API - STANDARDS COMPLIANT
export const deliverablesApi = {
  // Get all deliverables or filter by project
  list: (projectId?: number) =>
    fetchApi<PaginatedResponse<Deliverable>>(`/deliverables/${projectId ? `?project=${projectId}` : ''}`),

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