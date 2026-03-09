import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HierarchyView from '../HierarchyView';

const mockSnapshot = vi.hoisted(() => vi.fn());
const mockDeptList = vi.hoisted(() => vi.fn());
const mockPeopleList = vi.hoisted(() => vi.fn());
const mockUseCapabilities = vi.hoisted(() => vi.fn());

vi.mock('@/components/layout/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/hooks/useAuthenticatedEffect', () => ({
  useAuthenticatedEffect: (fn: () => void) => React.useEffect(() => { fn(); }, []),
}));

vi.mock('@/hooks/useVerticalFilter', () => ({
  useVerticalFilter: () => ({ state: { selectedVerticalId: null } }),
}));

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => false,
}));

vi.mock('@/hooks/useCapabilities', () => ({
  useCapabilities: mockUseCapabilities,
}));

vi.mock('@/components/departments/DepartmentHierarchy', () => ({
  default: ({
    departments,
    onDepartmentClick,
  }: {
    departments: Array<{ id?: number; name: string }>;
    onDepartmentClick?: (department: { id?: number; name: string }) => void;
  }) => (
    <div>
      {departments.map((department) => (
        <button
          key={department.id}
          type="button"
          onClick={() => onDepartmentClick?.(department)}
        >
          {department.name}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('@/services/api', () => ({
  departmentsApi: {
    snapshot: mockSnapshot,
    list: mockDeptList,
  },
  peopleApi: {
    list: mockPeopleList,
  },
}));

vi.mock('@/lib/flags', () => ({
  getFlag: () => true,
}));

vi.mock('@/components/departments/ReportingGroupsWorkspace', () => ({
  default: ({ department }: { department: { name: string } }) => (
    <div data-testid="reporting-groups-workspace">Workspace for {department.name}</div>
  ),
}));

describe('HierarchyView reporting groups integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCapabilities.mockReturnValue({ data: { features: { reportingGroupsEnabled: true } } });
    mockSnapshot.mockResolvedValue({
      departments: {
        results: [
          { id: 1, name: 'Electrical', isActive: true, parentDepartment: null },
          { id: 2, name: 'Mechanical', isActive: true, parentDepartment: null },
        ],
      },
      people: {
        results: [
          { id: 10, name: 'Taylor', department: 1, weeklyCapacity: 40 },
        ],
      },
    });
    mockDeptList.mockResolvedValue({ results: [] });
    mockPeopleList.mockResolvedValue({ results: [] });
  });

  it('shows workspace after selecting a department when feature is enabled', async () => {
    render(<HierarchyView />);
    await waitFor(() => expect(mockSnapshot).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByText('Electrical'));
    expect(await screen.findByTestId('reporting-groups-workspace')).toHaveTextContent('Workspace for Electrical');
  });

  it('does not show workspace when feature is disabled', async () => {
    mockUseCapabilities.mockReturnValue({ data: { features: { reportingGroupsEnabled: false } } });
    render(<HierarchyView />);
    await waitFor(() => expect(mockSnapshot).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByText('Electrical'));
    expect(screen.queryByTestId('reporting-groups-workspace')).toBeNull();
  });
});
