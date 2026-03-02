import { apiClient, authHeaders } from '@/api/client';
import type { ProjectStatusDefinition } from '@/types/models';

export type ProjectStatusDefinitionCreatePayload = {
  key: string;
  label: string;
  colorHex: string;
  includeInAnalytics?: boolean;
  treatAsCaWhenNoDeliverable?: boolean;
  isActive?: boolean;
  sortOrder?: number;
};

export type ProjectStatusDefinitionUpdatePayload = Partial<Omit<ProjectStatusDefinitionCreatePayload, 'key'>>;

export const projectStatusDefinitionsApi = {
  async list(): Promise<ProjectStatusDefinition[]> {
    const res = await apiClient.GET('/projects/status-definitions/' as any, { headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new Error(`HTTP ${status}`);
    }
    return res.data as unknown as ProjectStatusDefinition[];
  },

  async create(payload: ProjectStatusDefinitionCreatePayload): Promise<ProjectStatusDefinition> {
    const res = await apiClient.POST('/projects/status-definitions/' as any, { body: payload as any, headers: authHeaders() });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new Error(`HTTP ${status}`);
    }
    return res.data as unknown as ProjectStatusDefinition;
  },

  async update(key: string, payload: ProjectStatusDefinitionUpdatePayload): Promise<ProjectStatusDefinition> {
    const res = await apiClient.PATCH('/projects/status-definitions/{key}/' as any, {
      params: { path: { key } },
      body: payload as any,
      headers: authHeaders(),
    });
    if (!res.data) {
      const status = res.response?.status ?? 500;
      throw new Error(`HTTP ${status}`);
    }
    return res.data as unknown as ProjectStatusDefinition;
  },

  async remove(key: string): Promise<void> {
    const res = await apiClient.DELETE('/projects/status-definitions/{key}/' as any, {
      params: { path: { key } },
      headers: authHeaders(),
    });
    if (res.error || (res.response && !res.response.ok)) {
      const status = res.response?.status ?? 500;
      const reason = (res.error as any)?.code || (res.error as any)?.detail || `HTTP ${status}`;
      const error = new Error(typeof reason === 'string' ? reason : `HTTP ${status}`) as Error & {
        status?: number;
        data?: unknown;
      };
      error.status = status;
      error.data = res.error;
      throw error;
    }
  },
};
