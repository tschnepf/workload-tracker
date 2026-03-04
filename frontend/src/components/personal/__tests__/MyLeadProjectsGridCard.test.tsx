import React from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, it, beforeEach, expect, vi } from 'vitest';
import { renderWithProviders } from '@/test-utils';
import MyLeadProjectsGridCard from '@/components/personal/MyLeadProjectsGridCard';

vi.mock('@/services/api', () => ({
  assignmentsApi: {
    get: vi.fn(),
  },
  deliverablesApi: {
    bulkList: vi.fn(),
  },
}));

vi.mock('@/lib/mutations/assignments', () => ({
  updateAssignment: vi.fn(),
}));

vi.mock('@/lib/toastBus', () => ({
  showToast: vi.fn(),
}));

vi.mock('@/pages/Assignments/projectAssignments/components/ProjectNameQuickViewButton', () => ({
  __esModule: true,
  default: ({
    children,
    title,
    ariaLabel,
  }: {
    children: React.ReactNode;
    title?: string;
    ariaLabel?: string;
  }) => (
    <button type="button" title={title} aria-label={ariaLabel}>{children}</button>
  ),
}));

import { assignmentsApi, deliverablesApi } from '@/services/api';
import { updateAssignment } from '@/lib/mutations/assignments';
import { showToast } from '@/lib/toastBus';

const basePayload = {
  weekKeys: ['2025-01-05'],
  projects: [
    {
      id: 1,
      name: 'Apollo',
      client: 'ACME',
      status: 'active',
      leadRoleNames: ['Electrical Lead'],
      scopedDepartmentIds: [2],
    },
  ],
  assignmentsByProject: {
    '1': [
      {
        id: 22,
        project: 1,
        person: 5,
        personName: 'Alice',
        personDepartmentId: 2,
        roleOnProjectId: 10,
        roleName: 'Electrical Lead',
        weeklyHours: { '2025-01-05': 8 },
      },
    ],
  },
};

describe('MyLeadProjectsGridCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(deliverablesApi.bulkList).mockResolvedValue({});
  });

  const renderCard = (props?: Partial<React.ComponentProps<typeof MyLeadProjectsGridCard>>) => {
    const onWeeksChange = vi.fn();
    const onRetry = vi.fn();
    renderWithProviders(<div />, {
      route: '/',
      routes: [{
        path: '/',
        element: (
          <MyLeadProjectsGridCard
            payload={basePayload as any}
            loading={false}
            error={null}
            weeks={12}
            onWeeksChange={onWeeksChange}
            onRetry={onRetry}
            {...props}
          />
        ),
      }],
    });
    return { onWeeksChange, onRetry };
  };

  it('renders empty state', () => {
    renderCard({ payload: { weekKeys: ['2025-01-05'], projects: [], assignmentsByProject: {} } as any });
    expect(screen.getByText(/No lead projects found/i)).toBeTruthy();
  });

  it('hides add/remove assignment controls in embedded mode', () => {
    renderCard();
    expect(screen.queryByTitle(/Add assignment/i)).toBeNull();
    expect(screen.queryByTitle(/Remove assignment/i)).toBeNull();
  });

  it('shows project details and dashboard action buttons', () => {
    renderCard();
    expect(screen.getByTitle(/Open project details/i)).toBeTruthy();
    expect(screen.getByTitle(/Open project dashboard/i)).toBeTruthy();
  });

  it('renders deliverable markers from project deliverables', async () => {
    vi.mocked(deliverablesApi.bulkList).mockResolvedValue({
      '1': [
        {
          id: 5,
          project: 1,
          description: 'IFC Milestone',
          date: '2025-01-06',
          percentage: 100,
        },
      ],
    } as any);

    renderCard();

    await waitFor(() => expect(deliverablesApi.bulkList).toHaveBeenCalledWith([1]));
    await waitFor(() => {
      const marker = document.querySelector('[style*="background: rgb(6, 182, 212)"]');
      expect(marker).toBeTruthy();
    });
  });

  it('commits hours edits with optimistic flow', async () => {
    vi.mocked(updateAssignment).mockResolvedValue({ weeklyHours: { '2025-01-05': 10 } } as any);
    renderCard();

    const row = screen.getByText('Alice').closest('.grid');
    expect(row).toBeTruthy();
    const hourCell = within(row as HTMLElement).getByText('8');
    fireEvent.doubleClick(hourCell);
    const input = within(row as HTMLElement).getByDisplayValue('8');
    fireEvent.change(input, { target: { value: '10' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(updateAssignment).toHaveBeenCalledWith(
      22,
      { weeklyHours: { '2025-01-05': 10 } },
      assignmentsApi,
      { skipIfMatch: false }
    ));
    await waitFor(() => expect(screen.getAllByText('10').length).toBeGreaterThan(0));
  });

  it('reverts optimistic edit on failure', async () => {
    vi.mocked(updateAssignment).mockRejectedValue(new Error('Save failed'));
    renderCard();

    const row = screen.getByText('Alice').closest('.grid');
    expect(row).toBeTruthy();
    const hourCell = within(row as HTMLElement).getByText('8');
    fireEvent.doubleClick(hourCell);
    const input = within(row as HTMLElement).getByDisplayValue('8');
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Save failed', 'error'));
    await waitFor(() => expect(screen.getAllByText('8').length).toBeGreaterThan(0));
  });
});
