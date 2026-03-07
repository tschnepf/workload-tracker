import { describe, it, expect } from 'vitest';
import {
  createDefaultSurfaceLayout,
  groupSelectedItems,
  normalizeSurfaceLayout,
  resolveColumnCount,
  splitSelectedGroups,
} from './dashboardLayoutState';
import { dashboardItemId } from './dashboardLayoutTypes';

describe('dashboard layout state helpers', () => {
  it('resolves responsive columns with hard cap of five', () => {
    expect(resolveColumnCount(400)).toBe(1);
    expect(resolveColumnCount(759)).toBe(1);
    expect(resolveColumnCount(760)).toBe(2);
    expect(resolveColumnCount(1199)).toBe(2);
    expect(resolveColumnCount(1200)).toBe(3);
    expect(resolveColumnCount(1699)).toBe(3);
    expect(resolveColumnCount(1700)).toBe(4);
    expect(resolveColumnCount(2199)).toBe(4);
    expect(resolveColumnCount(2200)).toBe(5);
    expect(resolveColumnCount(3000)).toBe(5);
  });

  it('normalizes layout by dropping unknown cards and appending missing cards', () => {
    const allowed = ['a', 'b', 'c', 'd'];
    const raw = {
      items: [
        { type: 'card', cardId: 'a' },
        { type: 'card', cardId: 'a' },
        { type: 'card', cardId: 'unknown' },
        { type: 'group', groupId: 'g1' },
      ],
      groups: {
        g1: {
          id: 'g1',
          title: 'Group 1',
          cardIds: ['b', 'c', 'ghost'],
        },
      },
      hiddenCardIds: ['ghost', 'd'],
    };

    const normalized = normalizeSurfaceLayout(raw, allowed);
    expect(normalized.items.map(dashboardItemId)).toEqual(['card:a', 'group:g1', 'card:d']);
    expect(normalized.groups.g1.cardIds).toEqual(['b', 'c']);
    expect(normalized.hiddenCardIds).toEqual(['d']);
  });

  it('groups selected cards and merges into selected group', () => {
    const base = createDefaultSurfaceLayout({
      items: [
        { type: 'card', cardId: 'a' },
        { type: 'group', groupId: 'g1' },
        { type: 'card', cardId: 'd' },
      ],
      groups: {
        g1: {
          title: 'Ops',
          cardIds: ['b', 'c'],
        },
      },
    });

    const grouped = groupSelectedItems(base, ['group:g1', 'card:d']);
    expect(grouped.items.map(dashboardItemId)).toEqual(['card:a', 'group:g1']);
    expect(grouped.groups.g1.cardIds).toEqual(['b', 'c', 'd']);
  });

  it('combines multiple groups into a single selected group', () => {
    const base = createDefaultSurfaceLayout({
      items: [
        { type: 'group', groupId: 'g1' },
        { type: 'group', groupId: 'g2' },
      ],
      groups: {
        g1: { title: 'One', cardIds: ['a', 'b'] },
        g2: { title: 'Two', cardIds: ['c', 'd'] },
      },
    });

    const grouped = groupSelectedItems(base, ['group:g1', 'group:g2']);
    expect(grouped.items.map(dashboardItemId)).toEqual(['group:g1']);
    expect(grouped.groups.g1.cardIds).toEqual(['a', 'b', 'c', 'd']);
    expect(grouped.groups.g2).toBeUndefined();
  });

  it('splits selected groups back into cards', () => {
    const base = createDefaultSurfaceLayout({
      items: [
        { type: 'card', cardId: 'a' },
        { type: 'group', groupId: 'g1' },
      ],
      groups: {
        g1: {
          title: 'Ops',
          cardIds: ['b', 'c'],
        },
      },
    });

    const split = splitSelectedGroups(base, ['group:g1']);
    expect(split.items.map(dashboardItemId)).toEqual(['card:a', 'card:b', 'card:c']);
    expect(split.groups.g1).toBeUndefined();
  });
});
