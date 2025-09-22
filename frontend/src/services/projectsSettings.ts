import { resolveApiBase } from '@/utils/apiBase';
import { getAccessToken } from '@/utils/auth';

export type ProjectTypeSetting = { typeId: number; typeName: string; isEnabled: boolean; daysBefore: number | null; source: 'project'|'global'|'default' };

export const projectSettingsApi = {
  async get(projectId: number): Promise<{ projectId: number; settings: ProjectTypeSetting[] }> {
    const base = resolveApiBase((import.meta as any)?.env?.VITE_API_URL as string | undefined);
    const resp = await fetch(`${base}/projects/${projectId}/pre-deliverable-settings/`, {
      headers: { 'Authorization': `Bearer ${getAccessToken()}` },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  },
  async update(projectId: number, settings: Array<{ typeId: number; isEnabled: boolean; daysBefore: number | null }>): Promise<{ projectId: number; settings: ProjectTypeSetting[] }> {
    const base = resolveApiBase((import.meta as any)?.env?.VITE_API_URL as string | undefined);
    const resp = await fetch(`${base}/projects/${projectId}/pre-deliverable-settings/`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${getAccessToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  }
};

