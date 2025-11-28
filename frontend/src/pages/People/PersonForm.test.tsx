import React from 'react';
import { describe, it, beforeEach, vi, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from '@/test-utils';
import PersonForm from './PersonForm';
import { peopleApi, departmentsApi, rolesApi } from '@/services/api';
import * as usePeopleModule from '@/hooks/usePeople';

vi.mock('@/components/layout/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="layout-stub">{children}</div>,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ accessToken: 'token-123' }),
}));

vi.mock('@/services/api', () => ({
  peopleApi: {
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  departmentsApi: {
    list: vi.fn(),
  },
  rolesApi: {
    list: vi.fn(),
  },
}));

const mockedPeopleApi = vi.mocked(peopleApi);
const mockedDepartmentsApi = vi.mocked(departmentsApi);
const mockedRolesApi = vi.mocked(rolesApi);

const mockNavigate = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const setupMobileViewport = () => {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });
  window.matchMedia = (query: string) => ({
    matches: query.includes('max-width: 1023px') || query.includes('375'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
};

const routes = [
  { path: '/people/new', element: <PersonForm /> },
  { path: '/people/:id/edit', element: <PersonForm /> },
];

const renderRoute = (route: string) =>
  renderWithProviders(<div />, {
    routes,
    route,
  });

describe('PersonForm mobile flows', () => {
  beforeEach(() => {
    setupMobileViewport();
    vi.clearAllMocks();

    mockedDepartmentsApi.list.mockResolvedValue({ results: [{ id: 1, name: 'Electrical' }] } as any);
    mockedRolesApi.list.mockResolvedValue({ results: [{ id: 10, name: 'Engineer' }] } as any);

    // Wire hooks straight to the mocked peopleApi so we can assert payloads
    vi.spyOn(usePeopleModule, 'useCreatePerson').mockReturnValue({
      mutateAsync: (data: any) => mockedPeopleApi.create(data),
    } as any);

    vi.spyOn(usePeopleModule, 'useUpdatePerson').mockReturnValue({
      mutateAsync: ({ id, data }: { id: number; data: any }) => mockedPeopleApi.update(id, data),
    } as any);
  });

  it('submits correct payload for create flow at mobile width', async () => {
    mockedPeopleApi.create.mockResolvedValueOnce({ id: 7 } as any);

    renderRoute('/people/new');

    await waitFor(() => expect(mockedRolesApi.list).toHaveBeenCalledTimes(1));

    await userEvent.type(screen.getByPlaceholderText(/Enter full name/i), '  Ada Lovelace  ');
    const capacityInput = screen.getByPlaceholderText('36');
    await userEvent.clear(capacityInput);
    await userEvent.type(capacityInput, '40');
    await userEvent.selectOptions(screen.getByText(/Role\/Title/i).nextElementSibling as HTMLSelectElement, '10');

    await userEvent.click(screen.getByRole('button', { name: /Advanced details/i }));

    await userEvent.selectOptions(screen.getByLabelText(/Department/i), '1');
    await userEvent.type(screen.getByPlaceholderText(/New York, NY or Remote/i), 'New York, NY');
    const hireInput = screen.getByLabelText(/Hire Date/i);
    await userEvent.type(hireInput, '2025-02-01');

    await userEvent.click(screen.getByRole('button', { name: /Add Person/i }));

    await waitFor(() => expect(mockedPeopleApi.create).toHaveBeenCalledTimes(1));
    expect(mockedPeopleApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Ada Lovelace',
        weeklyCapacity: 40,
        role: 10,
        department: 1,
        location: 'New York, NY',
        hireDate: '2025-02-01',
        isActive: true,
      }),
    );
  });

  it('loads person data and submits correct payload for edit flow', async () => {
    mockedPeopleApi.get.mockResolvedValueOnce({
      id: 5,
      name: 'Grace Hopper',
      weeklyCapacity: 36,
      role: 10,
      department: 1,
      location: 'Remote',
      hireDate: '2024-01-15',
      isActive: true,
    } as any);
    mockedPeopleApi.update.mockResolvedValueOnce({} as any);

    renderRoute('/people/5/edit');

    await waitFor(() => expect(mockedPeopleApi.get).toHaveBeenCalledWith(5));

    expect(screen.getByDisplayValue('Grace Hopper')).toBeVisible();

    const editCapacityInput = screen.getByDisplayValue('36');
    await userEvent.clear(editCapacityInput);
    await userEvent.type(editCapacityInput, '32');

    const locationInput = screen.getByDisplayValue('Remote');
    await userEvent.clear(locationInput);
    await userEvent.type(locationInput, 'Remote - EST');

    await userEvent.click(screen.getByRole('button', { name: /Update Person/i }));

    await waitFor(() => expect(mockedPeopleApi.update).toHaveBeenCalledTimes(1));
    expect(mockedPeopleApi.update).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        name: 'Grace Hopper',
        weeklyCapacity: 32,
        role: 10,
        department: 1,
        location: 'Remote - EST',
        hireDate: '2024-01-15',
        isActive: true,
      }),
    );
  });
});
