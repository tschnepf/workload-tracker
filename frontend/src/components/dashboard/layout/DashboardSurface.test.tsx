import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardSurface from './DashboardSurface';
import { createDefaultSurfaceLayout } from './dashboardLayoutState';
import type { DashboardCardDefinition } from './dashboardLayoutTypes';

const mockWidth = vi.fn(() => 1700);

vi.mock('react-grid-layout', async () => {
  const React = await import('react');

  const MockGrid = ({ children, gridConfig, dragConfig, resizeConfig }: any) => {
    const handle = resizeConfig?.enabled && typeof resizeConfig?.handleComponent === 'function'
      ? resizeConfig.handleComponent('se', null)
      : null;

    return (
      <div
        data-testid="rgl"
        data-cols={String(gridConfig?.cols ?? '')}
        data-drag-enabled={String(Boolean(dragConfig?.enabled))}
        data-resize-enabled={String(Boolean(resizeConfig?.enabled))}
      >
        {React.Children.map(children, (child) => (
          <div>
            {child}
            {handle}
          </div>
        ))}
      </div>
    );
  };

  return {
    default: MockGrid,
    noCompactor: {},
    getCompactor: (_compactType: unknown, allowOverlap = false, preventCollision = false) => ({
      type: null,
      allowOverlap,
      preventCollision,
      compact: (layout: any) => layout,
    }),
    useContainerWidth: () => ({
      width: mockWidth(),
      mounted: true,
      containerRef: { current: null },
      measureWidth: () => {},
    }),
  };
});

vi.mock('react-grid-layout/extras', () => ({
  GridBackground: ({ cols }: { cols: number }) => (
    <div data-testid="grid-bg" data-cols={String(cols)} />
  ),
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
  },
  {
    id: 'b',
    title: 'Card B',
    render: () => <div>Card B content</div>,
  },
];

describe('DashboardSurface (RGL v2)', () => {
  const originalInnerWidth = window.innerWidth;

  beforeEach(() => {
    vi.clearAllMocks();
    setViewportWidth(1280);
    mockWidth.mockReturnValue(1700);
  });

  afterEach(() => {
    setViewportWidth(originalInnerWidth);
  });

  it('uses projected unit columns for the current container width', () => {
    const layout = createDefaultSurfaceLayout({
      widgets: [
        { cardId: 'a', x: 0, y: 0, w: 2, h: 2 },
        { cardId: 'b', x: 2, y: 0, w: 2, h: 2 },
      ],
    });

    render(
      <DashboardSurface
        surfaceId="team-dashboard"
        cards={cards}
        defaultLayout={layout}
      />
    );

    expect(screen.getByTestId('rgl')).toHaveAttribute('data-cols', '8');
  });

  it('enables drag and resize controls only while unlocked', async () => {
    const user = userEvent.setup();
    const layout = createDefaultSurfaceLayout({
      widgets: [{ cardId: 'a', x: 0, y: 0, w: 2, h: 2 }],
    });

    render(
      <DashboardSurface
        surfaceId="team-dashboard"
        cards={[cards[0]]}
        defaultLayout={layout}
      />
    );

    expect(screen.getByTestId('rgl')).toHaveAttribute('data-drag-enabled', 'false');
    expect(screen.getByTestId('rgl')).toHaveAttribute('data-resize-enabled', 'false');
    expect(screen.queryByTestId('grid-bg')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Unlock Dashboard' }));

    expect(screen.getByTestId('rgl')).toHaveAttribute('data-drag-enabled', 'true');
    expect(screen.getByTestId('rgl')).toHaveAttribute('data-resize-enabled', 'true');
    expect(screen.getByTestId('grid-bg')).toBeInTheDocument();
    expect(document.querySelector('.dashboard-resize-handle')).toBeTruthy();
  });

  it('keeps mobile in locked two-column mode', () => {
    setViewportWidth(390);
    mockWidth.mockReturnValue(2200);

    const layout = createDefaultSurfaceLayout({
      widgets: [{ cardId: 'a', x: 0, y: 0, w: 2, h: 2 }],
    });

    render(
      <DashboardSurface
        surfaceId="my-work-dashboard"
        cards={[cards[0]]}
        defaultLayout={layout}
      />
    );

    expect(screen.getByTestId('rgl')).toHaveAttribute('data-cols', '2');
    expect(screen.getByRole('button', { name: 'Unlock Dashboard' })).toBeDisabled();
  });
});
