import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import Sidebar from '@/components/layout/Sidebar';

describe('Sidebar PERSONAL_DASHBOARD flag gating', () => {
  beforeEach(() => {
    try { localStorage.removeItem('flags.PERSONAL_DASHBOARD'); } catch {}
  });

  it('hides My Work when flag is false', () => {
    try { localStorage.setItem('flags.PERSONAL_DASHBOARD', 'false'); } catch {}
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );
    expect(screen.queryByText('My Work')).toBeNull();
  });

  it('shows My Work when flag is true', () => {
    try { localStorage.setItem('flags.PERSONAL_DASHBOARD', 'true'); } catch {}
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );
    expect(screen.getByText('My Work')).toBeTruthy();
  });
});

