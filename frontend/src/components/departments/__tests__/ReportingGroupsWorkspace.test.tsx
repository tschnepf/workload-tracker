import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReportingGroupsWorkspace from '../ReportingGroupsWorkspace';

const mockWorkspaceGet = vi.hoisted(() => vi.fn());
const mockCreate = vi.hoisted(() => vi.fn());
const mockSaveLayout = vi.hoisted(() => vi.fn());

vi.mock('@/services/api', () => ({
  orgChartWorkspaceApi: { get: mockWorkspaceGet },
  reportingGroupsApi: {
    create: mockCreate,
    saveLayout: mockSaveLayout,
    remove: vi.fn(),
  },
}));

vi.mock('@/lib/toastBus', () => ({
  showToast: vi.fn(),
}));

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => false,
}));

describe('ReportingGroupsWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkspaceGet
      .mockResolvedValueOnce({
        featureEnabled: true,
        canEdit: true,
        workspaceVersion: 2,
        departmentCard: { x: 16, y: 24 },
        groups: [],
        people: [{ id: 1, name: 'Alex Manager', roleName: 'Engineer', departmentId: 9 }],
        unassignedPersonIds: [1],
      })
      .mockResolvedValueOnce({
        featureEnabled: true,
        canEdit: true,
        workspaceVersion: 3,
        departmentCard: { x: 16, y: 24 },
        groups: [{ id: 10, name: 'New Reporting Group', managerId: null, card: { x: 64, y: 240 }, memberIds: [], sortOrder: 10 }],
        people: [{ id: 1, name: 'Alex Manager', roleName: 'Engineer', departmentId: 9 }],
        unassignedPersonIds: [1],
      });
    mockCreate.mockResolvedValue({
      group: { id: 10, name: 'New Reporting Group', managerId: null, card: { x: 64, y: 240 }, memberIds: [], sortOrder: 10 },
      workspaceVersion: 3,
    });
    mockSaveLayout.mockResolvedValue({
      featureEnabled: true,
      canEdit: true,
      workspaceVersion: 3,
      departmentCard: { x: 16, y: 24 },
      groups: [{ id: 10, name: 'New Reporting Group', managerId: null, card: { x: 64, y: 240 }, memberIds: [], sortOrder: 10 }],
      people: [{ id: 1, name: 'Alex Manager', roleName: 'Engineer', departmentId: 9 }],
      unassignedPersonIds: [1],
    });
  });

  it('loads workspace and creates a reporting group', async () => {
    render(<ReportingGroupsWorkspace department={{ id: 9, name: 'Electrical' }} />);

    await waitFor(() => expect(mockWorkspaceGet).toHaveBeenCalledWith(9));
    expect(await screen.findByText('Reporting Groups Workspace')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add Group' }));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockWorkspaceGet).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId('rg-group-10')).toBeInTheDocument();
  });
});
