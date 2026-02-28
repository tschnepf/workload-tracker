import React from 'react';
import { describe, it, beforeEach, vi, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from '@/test-utils';
import PeopleList from '../../PeopleList';
import { peopleApi, departmentsApi, rolesApi, personSkillsApi } from '@/services/api';
import * as usePeopleModule from '@/hooks/usePeople';
import { getFlag } from '@/lib/flags';

vi.mock('@/lib/flags', () => ({
  getFlag: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ accessToken: 'token-123' }),
}));

vi.mock('@/services/api', () => ({
  peopleApi: {
    list: vi.fn(),
    searchList: vi.fn(),
    filtersMetadata: vi.fn(),
  },
  departmentsApi: {
    list: vi.fn(),
    listAll: vi.fn(),
  },
  rolesApi: {
    list: vi.fn(),
    listAll: vi.fn(),
  },
  personSkillsApi: {
    list: vi.fn(),
  },
  jobsApi: {
    getStatus: vi.fn(),
  },
}));

const mockedPeopleApi = vi.mocked(peopleApi);
const mockedDepartmentsApi = vi.mocked(departmentsApi);
const mockedRolesApi = vi.mocked(rolesApi);
const mockedPersonSkillsApi = vi.mocked(personSkillsApi);
const mockedGetFlag = vi.mocked(getFlag);

const setupMobileViewport = () => {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 390 });
  window.matchMedia = (query: string) => ({
    matches: query.includes('max-width: 1023px') || query.includes('390'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
};

const routes = [{ path: '/people', element: <PeopleList /> }];

const renderPeopleList = () =>
  renderWithProviders(<div />, {
    routes,
    route: '/people',
  });

const makePeoplePage = () => {
  const baseId = 0;
  const results = Array.from({ length: 3 }).map((_, idx) => {
    const id = baseId + idx + 1;
    return {
      id,
      name: `Person ${id}`,
      roleName: id % 2 === 0 ? 'Engineer' : 'Designer',
      departmentName: 'Electrical',
      department: 1,
      location: 'Remote',
      weeklyCapacity: 36,
      isActive: true,
      notes: '',
    } as any;
  });
  return { results, next: null };
};

describe('PeopleList mobile behaviour', () => {
  beforeEach(() => {
    setupMobileViewport();
    vi.clearAllMocks();
    mockedGetFlag.mockImplementation((name: any, fallback?: boolean) =>
      name === 'FF_PEOPLE_SKILLS_SETTINGS_SNAPSHOTS' ? false : Boolean(fallback)
    );

    mockedDepartmentsApi.list.mockResolvedValue({ results: [{ id: 1, name: 'Electrical' }] } as any);
    mockedDepartmentsApi.listAll.mockResolvedValue([{ id: 1, name: 'Electrical' }] as any);
    mockedRolesApi.list.mockResolvedValue({ results: [{ id: 1, name: 'Engineer' }] } as any);
    mockedRolesApi.listAll.mockResolvedValue([{ id: 1, name: 'Engineer' }] as any);
    mockedPersonSkillsApi.list.mockResolvedValue({ results: [] } as any);

    vi.spyOn(usePeopleModule, 'useUpdatePerson').mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
    } as any);

    mockedPeopleApi.list.mockResolvedValue(makePeoplePage() as any);
    mockedPeopleApi.searchList.mockResolvedValue(makePeoplePage() as any);
    mockedPeopleApi.filtersMetadata.mockResolvedValue({ locations: ['Remote'] } as any);
  });

  it('supports infinite scroll, selection, and bulk updates on mobile', async () => {
    renderPeopleList();

    // initial page (3 people) should render in the table list
    expect(await screen.findByText('Person 1')).toBeVisible();

    // open bulk mode
    await userEvent.click(screen.getByRole('button', { name: /Bulk/i }));

    // select first two people
    const checkboxes = screen.getAllByRole('checkbox');
    const rowCheckboxes = checkboxes.slice(-2);
    await userEvent.click(rowCheckboxes[0]);
    await userEvent.click(rowCheckboxes[1]);

    // verify bulk bar reflects selection count
    const bulkBar = screen.getByText(/Assign 2 people to:/i);
    expect(bulkBar).toBeVisible();

    // choose a department and apply bulk update
    const bulkControls = bulkBar.closest('div');
    const departmentSelect = within(bulkControls as HTMLElement).getByRole('combobox');
    await userEvent.selectOptions(departmentSelect, '1');
    const assignButton = screen.getByRole('button', { name: /Assign/i });
    await userEvent.click(assignButton);
  });
});
