import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const {
  useMediaQueryMock,
  showToastMock,
  listMock,
  updateMock,
  listTemplatesMock,
  listTemplateSettingsMock,
  phaseMappingGetMock,
  rolesListAllMock,
} = vi.hoisted(() => ({
  useMediaQueryMock: vi.fn(),
  showToastMock: vi.fn(),
  listMock: vi.fn(),
  updateMock: vi.fn(),
  listTemplatesMock: vi.fn(),
  listTemplateSettingsMock: vi.fn(),
  phaseMappingGetMock: vi.fn(),
  rolesListAllMock: vi.fn(),
}));

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: (query: string) => useMediaQueryMock(query),
}));

vi.mock('@/hooks/useUtilizationScheme', () => ({
  useUtilizationScheme: () => ({ data: { full_capacity_hours: 36 } }),
}));

vi.mock('@/lib/confirmAction', () => ({
  confirmAction: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/toastBus', () => ({
  showToast: (...args: any[]) => showToastMock(...args),
}));

vi.mock('@/services/api', () => ({
  autoHoursSettingsApi: {
    list: (...args: any[]) => listMock(...args),
    update: (...args: any[]) => updateMock(...args),
  },
  autoHoursTemplatesApi: {
    list: (...args: any[]) => listTemplatesMock(...args),
    listSettings: (...args: any[]) => listTemplateSettingsMock(...args),
    create: vi.fn(),
    update: vi.fn(),
    duplicate: vi.fn(),
    duplicateDefault: vi.fn(),
    delete: vi.fn(),
    updateSettings: vi.fn(),
  },
  deliverablePhaseMappingApi: {
    get: (...args: any[]) => phaseMappingGetMock(...args),
  },
  rolesApi: {
    listAll: (...args: any[]) => rolesListAllMock(...args),
  },
}));

import AutoHoursTemplatesEditor from '@/components/settings/AutoHoursTemplatesEditor';

function makeRows(phase: string, weeksCount: number) {
  return [
    {
      roleId: 101,
      roleName: 'Electrical Lead',
      departmentId: 1,
      departmentName: 'Electrical',
      percentByWeek: { '0': phase === 'sd' ? 20 : 10, '1': 5 },
      roleCount: 1,
      peopleRoleIds: [],
      weeksCount,
      isActive: true,
      sortOrder: 1,
    },
    {
      roleId: 201,
      roleName: 'Mechanical Lead',
      departmentId: 2,
      departmentName: 'Mechanical',
      percentByWeek: { '0': phase === 'sd' ? 15 : 5, '1': 0 },
      roleCount: 1,
      peopleRoleIds: [],
      weeksCount,
      isActive: true,
      sortOrder: 1,
    },
  ];
}

describe('AutoHoursTemplatesEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMediaQueryMock.mockReturnValue(false);
    listTemplatesMock.mockResolvedValue([]);
    listTemplateSettingsMock.mockResolvedValue([]);
    phaseMappingGetMock.mockResolvedValue({
      useDescriptionMatch: true,
      phases: [
        { key: 'sd', label: 'SD' },
        { key: 'dd', label: 'DD' },
      ],
    });
    rolesListAllMock.mockResolvedValue([]);
    listMock.mockImplementation(async (_departmentId?: number, phase?: string | null) => {
      const phaseKey = String(phase || 'sd');
      const weeksCount = phaseKey === 'sd' ? 6 : 4;
      return {
        settings: makeRows(phaseKey, weeksCount),
        weekLimits: {
          maxWeeksCount: 18,
          defaultWeeksCount: 6,
        },
      };
    });
    updateMock.mockImplementation(async (_departmentId: number | undefined, _settings: any, phase?: string | null, weeksCount?: number) => ({
      settings: makeRows(String(phase || 'sd'), Number(weeksCount ?? 6)),
      weekLimits: {
        maxWeeksCount: 18,
        defaultWeeksCount: 6,
      },
    }));
  });

  it('renders combined desktop matrix with multiple phase blocks and separators', async () => {
    render(<AutoHoursTemplatesEditor />);

    await screen.findAllByText('Default');
    await waitFor(() => expect(listMock).toHaveBeenCalled());

    expect(screen.getAllByText('SD').length).toBeGreaterThan(0);
    expect(screen.getAllByText('DD').length).toBeGreaterThan(0);

    const headerWeekInputs = document.querySelectorAll('thead input[type=\"number\"]');
    expect(headerWeekInputs.length).toBeGreaterThanOrEqual(2);

    const separatorHeader = document.querySelector('thead th.border-l');
    expect(separatorHeader).toBeTruthy();
  });

  it('orders mapped-role dropdown options by company role sort order', async () => {
    rolesListAllMock.mockResolvedValue([
      { id: 3, name: 'Designer', isActive: true, sortOrder: 20 },
      { id: 2, name: 'Intern', isActive: false, sortOrder: 30 },
      { id: 1, name: 'Principal', isActive: true, sortOrder: 10 },
    ]);

    render(<AutoHoursTemplatesEditor />);

    await waitFor(() => expect(listMock).toHaveBeenCalled());

    const addMappedRoleButtons = await screen.findAllByRole('button', { name: 'Add Mapped Role' });
    await userEvent.click(addMappedRoleButtons[0]);

    await screen.findByText('Principal');
    const optionButtons = Array.from(
      document.querySelectorAll('[data-people-role-menu] .absolute button')
    ) as HTMLButtonElement[];
    const optionLabels = optionButtons.map((button) => button.textContent?.trim() || '');
    expect(optionLabels).toEqual(['Principal', 'Designer', 'Intern (inactive)']);
  });

  it('saves dirty phases and reports partial failures', async () => {
    let updateInvocation = 0;
    updateMock.mockImplementation(async (_departmentId: number | undefined, _settings: any, phase?: string | null, weeksCount?: number) => {
      updateInvocation += 1;
      if (updateInvocation === 2) throw new Error('phase failed');
      return {
        settings: makeRows(String(phase || 'sd'), Number(weeksCount ?? 6)),
        weekLimits: {
          maxWeeksCount: 18,
          defaultWeeksCount: 6,
        },
      };
    });

    render(<AutoHoursTemplatesEditor />);

    await waitFor(() => expect(listMock).toHaveBeenCalled());

    await waitFor(() => {
      expect(document.querySelectorAll('thead input[type=\"number\"]').length).toBeGreaterThanOrEqual(2);
    });
    const headerWeekInputs = document.querySelectorAll('thead input[type=\"number\"]');
    fireEvent.change(headerWeekInputs[0], { target: { value: '5' } });
    fireEvent.change(headerWeekInputs[1], { target: { value: '3' } });

    const saveButton = await screen.findByRole('button', { name: /Save All/i });
    await waitFor(() => expect(saveButton).not.toBeDisabled());
    await userEvent.click(saveButton);

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(2));
    const phases = updateMock.mock.calls.map((call) => call[2]).sort();
    expect(phases).toEqual(['dd', 'sd']);

    expect(showToastMock).toHaveBeenCalledWith(expect.stringContaining('Partial save'), 'warning');
    expect(await screen.findByText(/Failed:/i)).toBeTruthy();
  });

  it('uses mobile phase tabs when in mobile layout', async () => {
    useMediaQueryMock.mockReturnValue(true);
    render(<AutoHoursTemplatesEditor />);

    await waitFor(() => expect(listMock).toHaveBeenCalled());

    const tablist = await screen.findByRole('tablist', { name: 'Template phases' });
    expect(tablist).toBeTruthy();

    const ddTab = screen.getByRole('tab', { name: 'DD' });
    await userEvent.click(ddTab);
    expect(ddTab).toHaveAttribute('aria-selected', 'true');
  });
});
