import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, beforeEach, vi, expect } from 'vitest';
import PersonalDashboard from './PersonalDashboard';

const mockSummary = {
  personId: 7,
  currentWeekKey: '2025-W48',
  utilizationPercent: 82,
  allocatedHours: 32,
  availableHours: 8,
};

const mockAlerts = {
  overallocatedNextWeek: true,
  underutilizedNext4Weeks: false,
  overduePreItems: 1,
};

const mockSchedule = {
  weekKeys: ['2025-11-17', '2025-11-24'],
  weeklyCapacity: 40,
  weekTotals: { '2025-11-17': 32, '2025-11-24': 18 },
};

const defaultPayload = {
  summary: mockSummary,
  alerts: mockAlerts,
  projects: [
    { id: 1, name: 'Apollo', client_name: 'ACME', active_assignments: 2, status: 'active' },
  ],
  deliverables: [
    { id: 11, project_name: 'Apollo', description: 'Design handoff', due_date: '2025-11-30' },
  ],
  schedule: mockSchedule,
};

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({ person: { id: 42 } })),
}));

const refreshSpy = vi.fn();

vi.mock('@/hooks/usePersonalWork', () => ({
  usePersonalWork: vi.fn(() => ({
    data: defaultPayload,
    loading: false,
    error: null,
    refresh: refreshSpy,
  })),
}));

import { usePersonalWork } from '@/hooks/usePersonalWork';

const mockedPersonalWork = vi.mocked(usePersonalWork);

const setupMobileViewport = () => {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 390 });
  window.matchMedia = (query: string) => ({
    matches: query.includes('max-width: 768px') || query.includes('390'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
};

describe('PersonalDashboard responsive layout', () => {
  beforeEach(() => {
    setupMobileViewport();
    refreshSpy.mockClear();
    mockedPersonalWork.mockReturnValue({
      data: defaultPayload,
      loading: false,
      error: null,
      refresh: refreshSpy,
    });
  });

  it('renders summary and swipe stack at 390px', () => {
    render(<PersonalDashboard />);
    expect(screen.getByRole('heading', { name: /My Summary/i })).toBeVisible();
    const swipeRegion = screen.getByLabelText(/My work widgets/i);
    expect(swipeRegion).toBeVisible();
    expect(screen.getByLabelText(/Upcoming weeks utilization/i)).toBeVisible();
    expect(screen.getByText(/My Calendar/i)).toBeVisible();
  });

  it('shows mobile skeletons and retry on error', () => {
    mockedPersonalWork.mockReturnValueOnce({
      data: null,
      loading: false,
      error: 'Server unavailable',
      refresh: refreshSpy,
    });
    render(<PersonalDashboard />);
    expect(screen.getByText(/Server unavailable/i)).toBeVisible();
    expect(screen.getByLabelText(/Mobile fallback skeletons/i)).toBeVisible();
  });
});
