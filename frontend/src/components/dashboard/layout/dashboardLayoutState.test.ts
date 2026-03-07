import { describe, it, expect } from 'vitest';
import type { Layout } from 'react-grid-layout';
import {
  createDefaultSurfaceLayout,
  normalizeSurfaceLayout,
  projectActiveToCanonicalWidgets,
  projectCanonicalToActiveLayout,
  resolveUnitColumnCount,
  resolveUnitColumnCountWithHysteresis,
} from './dashboardLayoutState';
import { CANONICAL_COLS, DASHBOARD_LAYOUT_VERSION, MAX_WIDGET_HEIGHT_UNITS } from './dashboardLayoutTypes';

function overlaps(a: Pick<Layout[number], 'x' | 'y' | 'w' | 'h'>, b: Pick<Layout[number], 'x' | 'y' | 'w' | 'h'>): boolean {
  return a.x < b.x + b.w
    && a.x + a.w > b.x
    && a.y < b.y + b.h
    && a.y + a.h > b.y;
}

describe('dashboard layout state helpers (v4)', () => {
  it('resolves responsive unit columns up to canonical 10', () => {
    expect(resolveUnitColumnCount(400)).toBe(2);
    expect(resolveUnitColumnCount(759)).toBe(2);
    expect(resolveUnitColumnCount(760)).toBe(4);
    expect(resolveUnitColumnCount(1199)).toBe(4);
    expect(resolveUnitColumnCount(1200)).toBe(6);
    expect(resolveUnitColumnCount(1699)).toBe(6);
    expect(resolveUnitColumnCount(1700)).toBe(8);
    expect(resolveUnitColumnCount(2199)).toBe(8);
    expect(resolveUnitColumnCount(2200)).toBe(10);
    expect(resolveUnitColumnCount(3000)).toBe(10);
  });

  it('uses hysteresis to avoid oscillating near breakpoints', () => {
    expect(resolveUnitColumnCountWithHysteresis(1195, 4, 24)).toBe(4);
    expect(resolveUnitColumnCountWithHysteresis(1195, 6, 24)).toBe(6);
    expect(resolveUnitColumnCountWithHysteresis(1230, 4, 24)).toBe(6);
    expect(resolveUnitColumnCountWithHysteresis(1170, 6, 24)).toBe(4);
  });

  it('normalizes widgets and appends missing cards from defaults', () => {
    const defaults = createDefaultSurfaceLayout({
      widgets: [
        { cardId: 'a', x: 0, y: 0, w: 2, h: 2 },
        { cardId: 'b', x: 2, y: 0, w: 2, h: 2 },
        { cardId: 'c', x: 4, y: 0, w: 2, h: 2 },
      ],
    });

    const normalized = normalizeSurfaceLayout(
      {
        widgets: [
          { i: 'a', cardId: 'a', x: 0, y: 0, w: 4, h: 1 },
          { i: 'dup-a', cardId: 'a', x: 1, y: 1, w: 2, h: 2 },
          { i: 'ghost', cardId: 'ghost', x: 0, y: 0, w: 2, h: 2 },
        ],
      },
      ['a', 'b', 'c'],
      defaults
    );

    expect(normalized.widgets.map((widget) => widget.cardId)).toEqual(['a', 'b', 'c']);
    expect(normalized.widgets[0]).toMatchObject({ i: 'a', cardId: 'a', w: 4, h: 1 });
    expect(normalized.widgets[1]).toMatchObject({ i: 'b', cardId: 'b', w: 2, h: 2 });
    expect(normalized.widgets[2]).toMatchObject({ i: 'c', cardId: 'c', w: 2, h: 2 });
  });

  it('projects canonical layout to active cols and back', () => {
    const canonical = createDefaultSurfaceLayout({
      widgets: [
        { cardId: 'a', x: 0, y: 0, w: 4, h: 3 },
        { cardId: 'b', x: 6, y: 2, w: 2, h: 2 },
      ],
    });

    const active = projectCanonicalToActiveLayout(canonical.widgets, 6, false);
    expect(active[0]).toMatchObject({ i: 'a', x: 0, w: 2, h: 3 });
    expect(active[1]).toMatchObject({ i: 'b', w: 1, h: 2 });

    const movedActive: Layout = [
      { ...active[0], x: 1, y: 1, w: 3, h: 4 },
      { ...active[1], x: 4, y: 0, w: 2, h: 1 },
    ];

    const back = projectActiveToCanonicalWidgets(movedActive, canonical.widgets, 6);
    expect(back[0]).toMatchObject({ i: 'b', cardId: 'b' });
    expect(back[1]).toMatchObject({ i: 'a', cardId: 'a' });
    expect(back.every((item) => item.w >= 1 && item.w <= CANONICAL_COLS)).toBe(true);
    expect(back.every((item) => item.h >= 1 && item.h <= MAX_WIDGET_HEIGHT_UNITS)).toBe(true);
    expect(back.every((item) => item.x >= 0 && item.x <= CANONICAL_COLS - item.w)).toBe(true);
  });

  it('allows taller widget heights and clamps to max height units', () => {
    const canonical = createDefaultSurfaceLayout({
      widgets: [{ cardId: 'a', x: 0, y: 0, w: 2, h: 120 }],
    });
    expect(canonical.widgets[0].h).toBe(MAX_WIDGET_HEIGHT_UNITS);

    const active = projectCanonicalToActiveLayout(canonical.widgets, 10, false);
    expect(active[0].maxH).toBe(MAX_WIDGET_HEIGHT_UNITS);
  });

  it('prevents widget overlap when projecting to narrower columns', () => {
    const canonical = createDefaultSurfaceLayout({
      widgets: [
        { cardId: 'a', x: 2, y: 0, w: 3, h: 2 },
        { cardId: 'b', x: 5, y: 0, w: 3, h: 2 },
        { cardId: 'c', x: 8, y: 0, w: 2, h: 2 },
      ],
    });

    const active = projectCanonicalToActiveLayout(canonical.widgets, 4, false);
    const hasAnyOverlap = active.some((item, index) =>
      active.slice(index + 1).some((other) => overlaps(item, other))
    );

    expect(hasAnyOverlap).toBe(false);
  });

  it('uses version 4 as canonical dashboard layout version', () => {
    expect(DASHBOARD_LAYOUT_VERSION).toBe(4);
  });
});
