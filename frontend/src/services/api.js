/**
 * API service layer - handles all backend communication
 * Uses naming prevention: frontend camelCase <-> backend snake_case
 */
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
class ApiError extends Error {
    constructor(message, status, response) {
        super(message);
        Object.defineProperty(this, "status", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: status
        });
        Object.defineProperty(this, "response", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: response
        });
        this.name = 'ApiError';
    }
}
async function fetchApi(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    // Debug logging for all API requests
    console.log('🔍 [DEBUG] fetchApi called:', {
        url,
        method: options.method || 'GET',
        headers: options.headers,
        body: options.body,
        bodyParsed: options.body ? JSON.parse(options.body) : null
    });
    try {
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
            ...options,
        });
        console.log('🔍 [DEBUG] fetchApi response:', {
            url,
            status: response.status,
            statusText: response.statusText,
            ok: response.ok,
            headers: Object.fromEntries(response.headers.entries())
        });
        if (!response.ok) {
            let errorMessage = `HTTP ${response.status}`;
            let errorData = null;
            try {
                errorData = await response.json();
                errorMessage = errorData.message || errorData.detail || errorMessage;
                console.error('🔍 [DEBUG] API Error Response:', errorData);
            }
            catch (e) {
                // If JSON parsing fails, use status text
                errorMessage = response.statusText || errorMessage;
                console.error('🔍 [DEBUG] API Error (no JSON):', errorMessage);
            }
            throw new ApiError(errorMessage, response.status, errorData);
        }
        // Handle empty responses (like DELETE operations)
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            return undefined;
        }
        // Check if response body is empty
        const text = await response.text();
        if (!text) {
            console.log('🔍 [DEBUG] Empty response body, returning undefined');
            return undefined;
        }
        const result = JSON.parse(text);
        console.log('🔍 [DEBUG] fetchApi success result:', result);
        return result;
    }
    catch (error) {
        console.error('🔍 [DEBUG] Fetch error:', error);
        if (error instanceof TypeError && error.message.includes('fetch')) {
            throw new ApiError('Network error - unable to reach server', 0);
        }
        throw error;
    }
}
// People API
export const peopleApi = {
    // Get all people with pagination support
    list: (params) => {
        const queryParams = new URLSearchParams();
        if (params?.page)
            queryParams.set('page', params.page.toString());
        if (params?.page_size)
            queryParams.set('page_size', params.page_size.toString());
        if (params?.search)
            queryParams.set('search', params.search);
        const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
        return fetchApi(`/people/${queryString}`);
    },
    // Get all people (bulk API - Phase 2 optimization)
    listAll: async () => {
        return fetchApi(`/people/?all=true`);
    },
    // Get single person
    get: (id) => fetchApi(`/people/${id}/`),
    // Create person
    create: (data) => fetchApi('/people/', {
        method: 'POST',
        body: JSON.stringify(data),
    }),
    // Update person
    update: (id, data) => {
        console.log('🔍 [DEBUG] peopleApi.update called with:', {
            id,
            data,
            dataJSON: JSON.stringify(data, null, 2),
            endpoint: `/people/${id}/`
        });
        return fetchApi(`/people/${id}/`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });
    },
    // Delete person
    delete: (id) => fetchApi(`/people/${id}/`, {
        method: 'DELETE',
    }),
    // Get people for autocomplete (name and basic info)
    getForAutocomplete: async () => {
        const allPeople = await peopleApi.listAll();
        return allPeople.map(person => ({
            id: person.id,
            name: person.name,
            department: person.department,
            weeklyCapacity: person.weeklyCapacity
        }));
    },
    // Get person utilization for specific week (optimized to prevent N+1 queries)
    getPersonUtilization: async (personId, week) => {
        const queryParams = new URLSearchParams();
        if (week)
            queryParams.set('week', week);
        const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
        return fetchApi(`/people/${personId}/utilization/${queryString}`);
    },
};
// Projects API
export const projectsApi = {
    // Get all projects with pagination support
    list: (params) => {
        const queryParams = new URLSearchParams();
        if (params?.page)
            queryParams.set('page', params.page.toString());
        if (params?.page_size)
            queryParams.set('page_size', params.page_size.toString());
        const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
        return fetchApi(`/projects/${queryString}`);
    },
    // Get all projects (bulk API - Phase 2 optimization)
    listAll: async () => {
        return fetchApi(`/projects/?all=true`);
    },
    // Get single project
    get: (id) => fetchApi(`/projects/${id}/`),
    // Create project
    create: (data) => fetchApi('/projects/', {
        method: 'POST',
        body: JSON.stringify(data),
    }),
    // Update project
    update: (id, data) => fetchApi(`/projects/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
    }),
    // Delete project
    delete: (id) => fetchApi(`/projects/${id}/`, {
        method: 'DELETE',
    }),
    // Get unique clients for autocomplete
    getClients: async () => {
        const allProjects = await projectsApi.listAll();
        const clients = [...new Set(allProjects.map(p => p.client).filter(Boolean))];
        return clients.sort();
    },
    /**
     * Fetch optimized filter metadata for Projects page.
     * Returns per-project assignment counts and future deliverables flags.
     * Includes a 30s timeout and leverages server-side ETag/Last-Modified.
     */
    getFilterMetadata: async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        try {
            return await fetchApi(`/projects/filter-metadata/`, {
                signal: controller.signal,
            });
        }
        finally {
            clearTimeout(timeout);
        }
    },
};
// Departments API
export const departmentsApi = {
    // Get all departments with pagination support
    list: (params) => {
        const queryParams = new URLSearchParams();
        if (params?.page)
            queryParams.set('page', params.page.toString());
        if (params?.page_size)
            queryParams.set('page_size', params.page_size.toString());
        const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
        return fetchApi(`/departments/${queryString}`);
    },
    // Get all departments (bulk API - Phase 2 optimization)
    listAll: async () => {
        return fetchApi(`/departments/?all=true`);
    },
    // Get single department
    get: (id) => fetchApi(`/departments/${id}/`),
    // Create department
    create: (data) => fetchApi('/departments/', {
        method: 'POST',
        body: JSON.stringify(data),
    }),
    // Update department
    update: (id, data) => fetchApi(`/departments/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
    }),
    // Delete department
    delete: (id) => fetchApi(`/departments/${id}/`, {
        method: 'DELETE',
    }),
};
// Assignment API
export const assignmentsApi = {
    // Get all assignments with pagination support and optional project filtering
    list: (params) => {
        const queryParams = new URLSearchParams();
        if (params?.page)
            queryParams.set('page', params.page.toString());
        if (params?.page_size)
            queryParams.set('page_size', params.page_size.toString());
        if (params?.project)
            queryParams.set('project', params.project.toString());
        const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
        return fetchApi(`/assignments/${queryString}`);
    },
    // Get all assignments (bulk API - Phase 2 optimization)
    listAll: async () => {
        return fetchApi(`/assignments/?all=true`);
    },
    // Get assignments for specific person
    byPerson: (personId) => fetchApi(`/assignments/by_person/?person_id=${personId}`),
    // Create assignment
    create: (data) => fetchApi('/assignments/', {
        method: 'POST',
        body: JSON.stringify(data),
    }),
    // Update assignment
    update: (id, data) => fetchApi(`/assignments/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
    }),
    // Delete assignment
    delete: (id) => fetchApi(`/assignments/${id}/`, {
        method: 'DELETE',
    }),
    // Check assignment conflicts (optimized to prevent N+1 queries)
    checkConflicts: async (personId, projectId, weekKey, proposedHours) => {
        return fetchApi('/assignments/check_conflicts/', {
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
    getPersonUtilization: (personId) => fetchApi(`/people/${personId}/utilization/`),
};
// Deliverables API - STANDARDS COMPLIANT
export const deliverablesApi = {
    // Get all deliverables or filter by project with pagination support
    list: (projectId, params) => {
        const queryParams = new URLSearchParams();
        if (projectId)
            queryParams.set('project', projectId.toString());
        if (params?.page)
            queryParams.set('page', params.page.toString());
        if (params?.page_size)
            queryParams.set('page_size', params.page_size.toString());
        const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
        return fetchApi(`/deliverables/${queryString}`);
    },
    // Get all deliverables (bulk API - Phase 2 optimization)
    listAll: async (projectId) => {
        const queryParams = new URLSearchParams();
        if (projectId)
            queryParams.set('project', projectId.toString());
        queryParams.set('all', 'true');
        const queryString = queryParams.toString();
        return fetchApi(`/deliverables/?${queryString}`);
    },
    // Get single deliverable  
    get: (id) => fetchApi(`/deliverables/${id}/`),
    // Create deliverable
    create: (data) => fetchApi('/deliverables/', {
        method: 'POST',
        body: JSON.stringify(data),
    }),
    // Update deliverable
    update: (id, data) => fetchApi(`/deliverables/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
    }),
    // Delete deliverable
    delete: (id) => fetchApi(`/deliverables/${id}/`, {
        method: 'DELETE',
    }),
    // Bulk fetch deliverables for multiple projects (Phase 2 optimization)
    bulkList: async (projectIds) => {
        if (projectIds.length === 0)
            return {};
        const projectIdsString = projectIds.join(',');
        return fetchApi(`/deliverables/bulk/?project_ids=${projectIdsString}`);
    },
    // Reorder deliverables for a project
    reorder: (projectId, deliverableIds) => fetchApi('/deliverables/reorder/', {
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
    getDashboard: (weeks, department) => {
        const params = new URLSearchParams();
        if (weeks && weeks !== 1)
            params.set('weeks', weeks.toString());
        if (department)
            params.set('department', department);
        const queryString = params.toString() ? `?${params.toString()}` : '';
        return fetchApi(`/dashboard/${queryString}`);
    },
};
// Skills API
export const skillTagsApi = {
    // List skill tags
    list: (params) => {
        const queryParams = params ? new URLSearchParams(Object.entries(params).filter(([_, value]) => value !== undefined && value !== '')
            .map(([key, value]) => [key, String(value)])).toString() : '';
        const url = queryParams ? `/skills/skill-tags/?${queryParams}` : '/skills/skill-tags/';
        return fetchApi(url);
    },
    // Get skill tag
    get: (id) => fetchApi(`/skills/skill-tags/${id}/`),
    // Create skill tag
    create: (data) => fetchApi('/skills/skill-tags/', {
        method: 'POST',
        body: JSON.stringify(data),
    }),
    // Update skill tag
    update: (id, data) => fetchApi(`/skills/skill-tags/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
    }),
    // Delete skill tag
    delete: (id) => fetchApi(`/skills/skill-tags/${id}/`, {
        method: 'DELETE',
    }),
};
export const personSkillsApi = {
    // List person skills
    list: (params) => {
        const queryParams = params ? new URLSearchParams(Object.entries(params).filter(([_, value]) => value !== undefined && value !== '')
            .map(([key, value]) => [key, String(value)])).toString() : '';
        const url = queryParams ? `/skills/person-skills/?${queryParams}` : '/skills/person-skills/';
        return fetchApi(url);
    },
    // Get person skill
    get: (id) => fetchApi(`/skills/person-skills/${id}/`),
    // Create person skill
    create: (data) => fetchApi('/skills/person-skills/', {
        method: 'POST',
        body: JSON.stringify(data),
    }),
    // Update person skill
    update: (id, data) => fetchApi(`/skills/person-skills/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
    }),
    // Delete person skill
    delete: (id) => fetchApi(`/skills/person-skills/${id}/`, {
        method: 'DELETE',
    }),
    // Get skill summary for a person
    summary: (personId) => fetchApi(`/skills/person-skills/summary/?person=${personId}`),
};
// Roles API - for role management and dropdowns
export const rolesApi = {
    // Get all roles (paginated)
    list: () => fetchApi('/roles/'),
    // Get all roles (bulk) - for autocomplete/dropdowns
    listAll: () => fetchApi('/roles/bulk/'),
    // Get single role
    get: (id) => fetchApi(`/roles/${id}/`),
    // Create new role
    create: (data) => fetchApi('/roles/', {
        method: 'POST',
        body: JSON.stringify(data),
    }),
    // Update role
    update: (id, data) => fetchApi(`/roles/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
    }),
    // Delete role
    delete: (id) => fetchApi(`/roles/${id}/`, {
        method: 'DELETE',
    }),
};
export { ApiError };
