import { fetchApi } from '@/services/api' as any; // reuse existing fetch helper via alias

// local lightweight wrapper since api.ts is large; rely on global fetchApi
export const coreApi = {
  getPreDeliverableGlobalSettings: async (): Promise<Array<{ typeId: number; typeName: string; defaultDaysBefore: number; isEnabledByDefault: boolean; sortOrder?: number; isActive?: boolean }>> => {
    return fetchApi(`/core/pre-deliverable-global-settings/`);
  },
  updatePreDeliverableGlobalSettings: async (settings: Array<{ typeId: number; defaultDaysBefore: number; isEnabledByDefault: boolean }>) => {
    return fetchApi(`/core/pre-deliverable-global-settings/`, {
      method: 'PUT',
      body: JSON.stringify({ settings }),
      headers: { 'Content-Type': 'application/json' },
    });
  },
};

