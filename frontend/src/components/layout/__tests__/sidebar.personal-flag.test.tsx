import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import Sidebar from '@/components/layout/Sidebar';
import { getFlag } from '@/lib/flags';
import { useAuth } from '@/hooks/useAuth';

vi.mock('@/lib/flags', () => ({
  getFlag: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

const mockedGetFlag = vi.mocked(getFlag);
const mockedUseAuth = vi.mocked(useAuth);

describe('Sidebar PERSONAL_DASHBOARD flag gating', () => {
  beforeEach(() => {
    mockedGetFlag.mockImplementation((_name: any, fallback?: boolean) => Boolean(fallback));
    mockedUseAuth.mockReturnValue({
      hydrating: false,
      accessToken: 'token',
      refreshToken: 'refresh',
      user: { id: 1, username: 'user', email: 'user@example.com', accountRole: 'user', groups: [] },
      person: null,
      settings: {},
    } as any);
  });

  it('hides My Work when flag is false', () => {
    mockedGetFlag.mockImplementation((name: any, fallback?: boolean) =>
      name === 'PERSONAL_DASHBOARD' ? false : Boolean(fallback)
    );
    const router = createMemoryRouter([
      { path: '/', element: <Sidebar /> },
    ], { initialEntries: ['/'] });
    render(<RouterProvider router={router} />);
    expect(screen.queryByRole('link', { name: 'My Work' })).toBeNull();
  });

  it('shows My Work when flag is true', () => {
    mockedGetFlag.mockImplementation((name: any, fallback?: boolean) =>
      name === 'PERSONAL_DASHBOARD' ? true : Boolean(fallback)
    );
    const router = createMemoryRouter([
      { path: '/', element: <Sidebar /> },
    ], { initialEntries: ['/'] });
    render(<RouterProvider router={router} />);
    expect(screen.getByRole('link', { name: 'My Work' })).toBeTruthy();
  });

  it('hides manager-only department links for non-manager users', () => {
    const router = createMemoryRouter([
      { path: '/', element: <Sidebar /> },
    ], { initialEntries: ['/'] });
    render(<RouterProvider router={router} />);

    expect(screen.queryByRole('link', { name: 'Manager View' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Org Chart' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Reports' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Dashboard' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Departments' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'People' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull();
  });

  it('shows manager-only department links for manager users', () => {
    mockedUseAuth.mockReturnValue({
      hydrating: false,
      accessToken: 'token',
      refreshToken: 'refresh',
      user: { id: 2, username: 'manager', email: 'manager@example.com', accountRole: 'manager', groups: ['Manager'] },
      person: null,
      settings: {},
    } as any);

    const router = createMemoryRouter([
      { path: '/', element: <Sidebar /> },
    ], { initialEntries: ['/'] });
    render(<RouterProvider router={router} />);

    expect(screen.getByRole('link', { name: 'Manager View' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Org Chart' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Reports' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Departments' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'People' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeTruthy();
  });
});
