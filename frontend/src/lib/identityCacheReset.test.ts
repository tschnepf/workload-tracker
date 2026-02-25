import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/api/client';
import { resetIdentityTransitionCaches } from '@/lib/identityCacheReset';
import { queryClient } from '@/lib/queryClient';
import { primeProjectRolesCache, listProjectRoles } from '@/roles/api';
import { peopleApi } from '@/services/api';

describe('resetIdentityTransitionCaches', () => {
  beforeEach(() => {
    resetIdentityTransitionCaches('test-setup');
    queryClient.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetIdentityTransitionCaches('test-teardown');
  });

  it('clears React Query and fetchApiCached stores on identity transition', async () => {
    queryClient.setQueryData(['identity-reset-smoke'], { ok: true });
    expect(queryClient.getQueryData(['identity-reset-smoke'])).toEqual({ ok: true });

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock as any);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify([{ id: 1, name: 'User A' }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify([{ id: 2, name: 'User B' }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const first = await peopleApi.listAll();
    const second = await peopleApi.listAll();
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resetIdentityTransitionCaches('identity-switched');
    expect(queryClient.getQueryData(['identity-reset-smoke'])).toBeUndefined();

    const third = await peopleApi.listAll();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(third).not.toEqual(first);
  });

  it('clears project-role memory cache on identity transition', async () => {
    primeProjectRolesCache({
      '7': [
        { id: 701, name: 'Cached Role', is_active: true, sort_order: 10, department_id: 7 },
      ],
    });

    const cached = await listProjectRoles(7, false);
    expect(cached[0]?.id).toBe(701);

    const getSpy = vi.spyOn(apiClient, 'GET');
    getSpy.mockResolvedValueOnce({
      data: [{ id: 702, name: 'Fetched Role', is_active: true, sort_order: 20, department_id: 7 }],
      response: { ok: true, status: 200 },
      error: undefined,
    } as any);

    resetIdentityTransitionCaches('identity-switched');
    const fetched = await listProjectRoles(7, false);

    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(fetched[0]?.id).toBe(702);
  });
});
