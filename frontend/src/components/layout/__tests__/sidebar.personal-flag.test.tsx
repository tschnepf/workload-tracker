import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import Sidebar from '@/components/layout/Sidebar';
import { getFlag } from '@/lib/flags';

vi.mock('@/lib/flags', () => ({
  getFlag: vi.fn(),
}));

const mockedGetFlag = vi.mocked(getFlag);

describe('Sidebar PERSONAL_DASHBOARD flag gating', () => {
  beforeEach(() => {
    mockedGetFlag.mockImplementation((_name: any, fallback?: boolean) => Boolean(fallback));
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
});
