import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  apiClient: { GET: vi.fn() },
  authHeaders: vi.fn(() => ({})),
}));

import PersonalDashboard from '@/pages/Personal/PersonalDashboard';

describe('PersonalDashboard integration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders empty-state when user is not linked to a Person', async () => {
    const { useAuth } = await import('@/hooks/useAuth');
    (useAuth as any).mockReturnValue({ person: null, accessToken: 'tok' });
    render(
      <MemoryRouter>
        <PersonalDashboard />
      </MemoryRouter>
    );
    expect(await screen.findByText(/Your account is not linked/i)).toBeTruthy();
  });

  it('renders summary and sections when linked and API returns data', async () => {
    const { useAuth } = await import('@/hooks/useAuth');
    const { apiClient } = await import('@/api/client');
    (useAuth as any).mockReturnValue({ person: { id: 1, name: 'P1' }, accessToken: 'tok' });
    (apiClient.GET as any).mockResolvedValue({
      data: {
        summary: { personId: 1, currentWeekKey: '2025-01-05', utilizationPercent: 50, allocatedHours: 18, availableHours: 18 },
        alerts: { overallocatedNextWeek: false, underutilizedNext4Weeks: false, overduePreItems: 0 },
        projects: [],
        deliverables: [],
        preItems: [],
        schedule: { weekKeys: ['2025-01-05'], weekTotals: { '2025-01-05': 18 }, weeklyCapacity: 36 },
      },
    });

    render(
      <MemoryRouter>
        <PersonalDashboard />
      </MemoryRouter>
    );
    expect(await screen.findByText('My Summary')).toBeTruthy();
    expect(await screen.findByText('My Projects')).toBeTruthy();
    expect(await screen.findByText('My Deliverables')).toBeTruthy();
    expect(await screen.findByText('My Schedule')).toBeTruthy();
  });
});

