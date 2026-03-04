import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, beforeEach, expect, vi } from 'vitest';
import { usePersonalLeadProjectGrid } from '@/hooks/usePersonalLeadProjectGrid';
import { emitAssignmentsRefresh } from '@/lib/assignmentsRefreshBus';
import { emitProjectsRefresh } from '@/lib/projectsRefreshBus';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  apiClient: { GET: vi.fn() },
  authHeaders: vi.fn(() => ({})),
}));

import { useAuth } from '@/hooks/useAuth';
import { apiClient } from '@/api/client';

describe('usePersonalLeadProjectGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not fetch when auth has no linked person', async () => {
    vi.mocked(useAuth).mockReturnValue({ person: null } as any);
    const { result } = renderHook(() => usePersonalLeadProjectGrid(12));
    expect(result.current.hasPerson).toBe(false);
    expect(vi.mocked(apiClient.GET)).not.toHaveBeenCalled();
  });

  it('fetches, normalizes, and sorts projects/rows', async () => {
    vi.mocked(useAuth).mockReturnValue({ person: { id: 7 } } as any);
    vi.mocked(apiClient.GET).mockResolvedValue({
      data: {
        weekKeys: ['2025-01-05'],
        projects: [
          { id: 2, name: 'Zulu', client: null, status: 'active', leadRoleNames: ['Lead'], scopedDepartmentIds: [2] },
          { id: 1, name: 'Alpha', client: 'Acme', status: 'active', leadRoleNames: ['Electrical Lead'], scopedDepartmentIds: [1] },
        ],
        assignmentsByProject: {
          '1': [
            { id: 12, project: 1, person: null, personName: null, personDepartmentId: 1, roleOnProjectId: 3, roleName: 'Electrical Engineer', weeklyHours: { '2025-01-05': 5 } },
            { id: 11, project: 1, person: 20, personName: 'Bob', personDepartmentId: 1, roleOnProjectId: 2, roleName: 'Electrical Lead', weeklyHours: { '2025-01-05': 8 } },
          ],
        },
      },
    } as any);

    const { result } = renderHook(() => usePersonalLeadProjectGrid(12));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(vi.mocked(apiClient.GET)).toHaveBeenCalledWith('/personal/lead_project_grid/?weeks=12', expect.anything());
    expect(result.current.data?.projects.map((p) => p.id)).toEqual([1, 2]);
    expect(result.current.data?.assignmentsByProject['1'].map((row) => row.id)).toEqual([11, 12]);
  });

  it('refetches on assignments/projects refresh events', async () => {
    vi.mocked(useAuth).mockReturnValue({ person: { id: 7 } } as any);
    vi.mocked(apiClient.GET).mockResolvedValue({
      data: { weekKeys: ['2025-01-05'], projects: [], assignmentsByProject: {} },
    } as any);

    renderHook(() => usePersonalLeadProjectGrid(12));
    await waitFor(() => expect(vi.mocked(apiClient.GET)).toHaveBeenCalledTimes(1));

    act(() => {
      emitAssignmentsRefresh({ type: 'updated', assignmentId: 1 });
      emitProjectsRefresh();
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 260));
    });
    await waitFor(() => expect(vi.mocked(apiClient.GET)).toHaveBeenCalledTimes(2));
  });
});
