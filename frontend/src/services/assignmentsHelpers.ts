import type { Assignment } from '@/types/models';
import { apiClient, authHeaders } from '@/api/client';

// Convenience wrapper to fetch assignments by project with optional department scoping.
// Keeps responses typed and hides pagination.
export async function byProject(projectId: number, filters?: { department?: number; include_children?: 0 | 1 }): Promise<Assignment[]> {
  const queryParams = new URLSearchParams();
  queryParams.set('project', String(projectId));
  if (filters?.department != null) queryParams.set('department', String(filters.department));
  if (filters?.include_children != null) queryParams.set('include_children', String(filters.include_children));
  const qs = queryParams.toString() ? `?${queryParams.toString()}` : '';
  const res = await apiClient.GET(`/assignments/${qs}` as any, { headers: authHeaders() });
  if (!res.data) return [];
  return (res.data as any).results || [];
}
