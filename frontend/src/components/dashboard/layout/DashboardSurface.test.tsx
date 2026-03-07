import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardSurface from './DashboardSurface';
import { createDefaultSurfaceLayout } from './dashboardLayoutState';
import type { DashboardCardDefinition } from './dashboardLayoutTypes';

const mockUseContainerWidth = vi.fn(() => ({ width: 1200, height: 800 }));

vi.mock('@/hooks/useContainerWidth', () => ({
  useContainerWidth: (ref: React.RefObject<HTMLDivElement | null>) => mockUseContainerWidth(ref),
}));

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
}

const cards: DashboardCardDefinition[] = [
  {
    id: 'a',
    title: 'Card A',
    render: () => <div>Card A content</div>,
    renderPreview: () => <span>A</span>,
  },
  {
    id: 'b',
    title: 'Card B',
    render: () => <div>Card B content</div>,
    renderPreview: () => <span>B</span>,
  },
];

describe('DashboardSurface sizing', () => {
  const originalInnerWidth = window.innerWidth;

  beforeEach(() => {
    vi.clearAllMocks();
    setViewportWidth(1280);
    mockUseContainerWidth.mockReturnValue({ width: 1700, height: 900 });
  });

  afterEach(() => {
    setViewportWidth(originalInnerWidth);
  });

  it('applies row/column spans from card size map', () => {
    const layout = createDefaultSurfaceLayout({
      items: [
        { type: 'card', cardId: 'a' },
        { type: 'card', cardId: 'b' },
      ],
      cardSizes: {
        a: { w: 1, h: 1 },
        b: { w: 3, h: 3 },
      },
    });

    render(
      <DashboardSurface
        surfaceId="team-dashboard"
        cards={cards}
        defaultLayout={layout}
        ariaLabel="Test dashboard"
      />
    );

    const cardA = document.querySelector('[data-dashboard-item-id="card:a"]') as HTMLElement;
    const cardB = document.querySelector('[data-dashboard-item-id="card:b"]') as HTMLElement;
    expect(cardA).toBeTruthy();
    expect(cardB).toBeTruthy();

    expect(cardA.parentElement?.style.gridColumn).toBe('span 1 / span 1');
    expect(cardA.parentElement?.style.gridRow).toBe('span 1 / span 1');
    expect(cardB.parentElement?.style.gridColumn).toBe('span 3 / span 3');
    expect(cardB.parentElement?.style.gridRow).toBe('span 3 / span 3');
  });

  it('forces full-width spans on mobile locked mode', () => {
    setViewportWidth(390);
    mockUseContainerWidth.mockReturnValue({ width: 2200, height: 900 });

    const layout = createDefaultSurfaceLayout({
      items: [{ type: 'card', cardId: 'a' }],
      cardSizes: {
        a: { w: 1, h: 1 },
      },
    });

    render(
      <DashboardSurface
        surfaceId="my-work-dashboard"
        cards={[cards[0]]}
        defaultLayout={layout}
        ariaLabel="Mobile dashboard"
      />
    );

    const grid = screen.getByLabelText('Mobile dashboard');
    expect((grid as HTMLElement).style.gridTemplateColumns).toContain('repeat(2');

    const cardA = document.querySelector('[data-dashboard-item-id="card:a"]') as HTMLElement;
    expect(cardA.parentElement?.style.gridColumn).toBe('span 2 / span 2');
    expect(cardA.parentElement?.style.gridRow).toBe('span 1 / span 1');
  });

  it('shows corner resize handle only while unlocked', async () => {
    const user = userEvent.setup();

    const layout = createDefaultSurfaceLayout({
      items: [{ type: 'card', cardId: 'a' }],
      cardSizes: {
        a: { w: 2, h: 2 },
      },
    });

    render(
      <DashboardSurface
        surfaceId="team-dashboard"
        cards={[cards[0]]}
        defaultLayout={layout}
      />
    );

    expect(screen.queryByRole('button', { name: 'Resize card' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Unlock Dashboard' }));

    const resizeHandle = screen.getByRole('button', { name: 'Resize card' });
    expect(resizeHandle).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Card width size' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Card height size' })).not.toBeInTheDocument();
  });
});
