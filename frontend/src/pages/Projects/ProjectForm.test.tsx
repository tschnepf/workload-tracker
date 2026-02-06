import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, beforeEach, vi, expect } from 'vitest';

import { renderWithProviders } from '@/test-utils';
import ProjectForm from './ProjectForm';
import { projectsApi } from '@/services/api';
import { useCreateProject } from '@/hooks/useProjects';

const mockNavigate = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/components/layout/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="layout-stub">{children}</div>,
}));

vi.mock('@/components/projects/ProjectPreDeliverableSettings', () => ({
  default: ({ projectId }: { projectId: number }) => (
    <div data-testid="pre-settings-stub">Settings for {projectId}</div>
  ),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ accessToken: 'token-123' }),
}));

vi.mock('@/hooks/useProjects', () => ({
  useCreateProject: vi.fn(),
}));

vi.mock('@/hooks/useVerticalFilter', () => ({
  useVerticalFilter: () => ({ state: { selectedVerticalId: 1 }, setVertical: vi.fn(), clearVertical: vi.fn() }),
}));

vi.mock('@/hooks/useVerticals', () => ({
  useVerticals: () => ({ verticals: [{ id: 1, name: 'Architecture', shortName: 'ARCH', isActive: true }], isLoading: false }),
}));

vi.mock('@/services/api', () => ({
  projectsApi: {
    getClients: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
  },
}));

const mockedProjectsApi = vi.mocked(projectsApi);
const mockedUseCreateProject = vi.mocked(useCreateProject);

const setupMobileViewport = () => {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });
  window.matchMedia = (query: string) => ({
    matches: query.includes('max-width: 768px') || query.includes('375px'),
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
  { path: '/projects/new', element: <ProjectForm /> },
  { path: '/projects/:id/edit', element: <ProjectForm /> },
];

const renderRoute = (route: string) =>
  renderWithProviders(<div />, {
    routes,
    route,
  });

describe('ProjectForm responsive flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
    setupMobileViewport();
    mockedProjectsApi.getClients.mockResolvedValue(['Acme Corp', 'Beta Manufacturing', 'Stack Realty']);
  });

  it('validates required fields and submits create flow with client suggestions', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    mockedUseCreateProject.mockReturnValue({ mutateAsync });

    renderRoute('/projects/new');

    await waitFor(() => expect(mockedProjectsApi.getClients).toHaveBeenCalledTimes(1));

    const nameInput = screen.getByPlaceholderText(/Website Redesign/i);
    await userEvent.type(nameInput, '   ');
    const submitButton = await screen.findByRole('button', { name: /Create Project/i });
    await userEvent.click(submitButton);

    expect(await screen.findByText(/Project name is required/i)).toBeVisible();
    expect(screen.getByText(/Client is required/i)).toBeVisible();

    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, ' Mobile Web Revamp ');
    const clientInput = screen.getByLabelText(/Client/);
    await userEvent.type(clientInput, 'acme');

    const suggestion = await screen.findByRole('option', { name: 'Acme Corp' });
    await userEvent.click(suggestion);

    await userEvent.click(submitButton);

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Mobile Web Revamp',
        client: 'Acme Corp',
        description: '',
        startDate: null,
        vertical: 1,
      }),
    );
    expect(mockedProjectsApi.update).not.toHaveBeenCalled();
  });

  it('loads project data and submits edit flow at 375px width', async () => {
    mockedUseCreateProject.mockReturnValue({ mutateAsync: vi.fn() });
    mockedProjectsApi.get.mockResolvedValue({
      id: 42,
      name: 'Abernathy B2',
      status: 'active',
      client: 'Beta Manufacturing',
      description: 'Initial scope',
      estimatedHours: 120,
      projectNumber: 'P-443',
      startDate: '2026-03-27',
      vertical: 1,
    });
    mockedProjectsApi.update.mockResolvedValue(undefined);

    renderRoute('/projects/42/edit');

    await waitFor(() => expect(mockedProjectsApi.get).toHaveBeenCalledWith(42));

    expect(screen.getByDisplayValue('Abernathy B2')).toBeVisible();
    expect(screen.getByDisplayValue('Beta Manufacturing')).toBeVisible();

    const statusSelect = screen.getByDisplayValue('Active') as HTMLSelectElement;
    await userEvent.selectOptions(statusSelect, 'completed');
    const descriptionField = screen.getByPlaceholderText(/Brief description/i) as HTMLTextAreaElement;
    await userEvent.clear(descriptionField);
    await userEvent.type(descriptionField, 'Updated for QA signoff');

    const updateButton = screen.getByRole('button', { name: /Update Project/i });
    await userEvent.click(updateButton);

    await waitFor(() => expect(mockedProjectsApi.update).toHaveBeenCalledTimes(1));
    expect(mockedProjectsApi.update).toHaveBeenCalledWith(42, expect.objectContaining({
      status: 'completed',
      description: 'Updated for QA signoff',
      client: 'Beta Manufacturing',
    }));
  });
});
