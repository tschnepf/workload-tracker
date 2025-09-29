import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import Sidebar from '@/components/layout/Sidebar';

describe('Sidebar PERSONAL_DASHBOARD flag gating', () => {
  beforeEach(() => {
    try { localStorage.removeItem('flags.PERSONAL_DASHBOARD'); } catch {}
  });

  it('hides My Work when flag is false', () => {
    try { localStorage.setItem('flags.PERSONAL_DASHBOARD', 'false'); } catch {}
    const router = createMemoryRouter([
      { path: '/', element: <Sidebar /> },
    ], { initialEntries: ['/'] });
    render(<RouterProvider router={router} />);
    expect(screen.queryByRole('link', { name: 'My Work' })).toBeNull();
  });

  it('shows My Work when flag is true', () => {
    try { localStorage.setItem('flags.PERSONAL_DASHBOARD', 'true'); } catch {}
    const router = createMemoryRouter([
      { path: '/', element: <Sidebar /> },
    ], { initialEntries: ['/'] });
    render(<RouterProvider router={router} />);
    expect(screen.getByRole('link', { name: 'My Work' })).toBeTruthy();
  });
});
