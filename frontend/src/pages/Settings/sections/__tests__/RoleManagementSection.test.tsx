import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RoleManagementSection from '../RoleManagementSection';

const { mockRolesList, mockRolesReorder } = vi.hoisted(() => ({
  mockRolesList: vi.fn().mockResolvedValue({ results: [] }),
  mockRolesReorder: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/api', async () => {
  const actual = await vi.importActual<any>('@/services/api');
  return {
    ...actual,
    rolesApi: {
      list: mockRolesList,
      reorder: mockRolesReorder,
    },
  };
});

vi.mock('@/pages/Settings/components/RoleList', () => ({
  default: ({ onReorder }: { onReorder?: (ids: number[]) => void }) => (
    <div>
      <div data-testid="role-list">Role list</div>
      {onReorder ? (
        <button type="button" onClick={() => onReorder([1])}>
          trigger reorder
        </button>
      ) : null}
    </div>
  ),
}));

vi.mock('@/pages/Settings/components/RoleForm', () => ({
  default: () => <div data-testid="role-form">role form</div>,
}));

vi.mock('@/pages/Settings/components/RoleDeleteConfirm', () => ({
  default: () => <div data-testid="role-delete-confirm">delete confirm</div>,
}));

vi.mock('@/pages/Settings/SettingsDataContext', () => ({
  useSettingsData: () => ({
    auth: { user: { is_staff: true }, accessToken: 'token' },
    capsQuery: { data: undefined, isLoading: false },
    caps: undefined,
  }),
}));

vi.mock('@/hooks/useAuthenticatedEffect', () => {
  const React = require('react');
  return {
    useAuthenticatedEffect: (effect: () => void) => {
      React.useEffect(() => {
        effect();
      }, []);
    },
  };
});

describe('RoleManagementSection', () => {
  beforeEach(() => {
    mockRolesList.mockClear();
    mockRolesReorder.mockClear();
  });

  it('loads roles and toggles reorder mode', async () => {
    render(<RoleManagementSection />);

    await waitFor(() => expect(mockRolesList).toHaveBeenCalledTimes(1));
    const toggle = screen.getByRole('button', { name: /reorder/i });
    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent('Done Reordering');

    const trigger = screen.getByRole('button', { name: 'trigger reorder' });
    fireEvent.click(trigger);
    await waitFor(() => expect(mockRolesReorder).toHaveBeenCalledWith([1]));
    await waitFor(() => expect(mockRolesList).toHaveBeenCalledTimes(2));
  });
});
