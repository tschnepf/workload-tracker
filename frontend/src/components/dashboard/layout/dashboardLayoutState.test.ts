import { describe, it, expect } from 'vitest';
import {
  createDefaultSurfaceLayout,
  groupSelectedItems,
  normalizeSurfaceLayout,
  resolveColumnCount,
  setLayoutItemSize,
  splitSelectedGroups,
} from './dashboardLayoutState';
import { DASHBOARD_MEDIUM_ITEM_SIZE, dashboardItemId } from './dashboardLayoutTypes';

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

  it('normalizes layout and migrates legacy payloads with 2x2 defaults', () => {
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
    expect(normalized.cardSizes.a).toEqual(DASHBOARD_MEDIUM_ITEM_SIZE);
    expect(normalized.cardSizes.b).toEqual(DASHBOARD_MEDIUM_ITEM_SIZE);
    expect(normalized.groupSizes.g1).toEqual(DASHBOARD_MEDIUM_ITEM_SIZE);
  });

  it('sanitizes provided card/group sizes and drops unknown ids', () => {
    const allowed = ['a', 'b'];
    const raw = {
      items: [
        { type: 'card', cardId: 'a' },
        { type: 'group', groupId: 'g1' },
      ],
      groups: {
        g1: {
          id: 'g1',
          title: 'Group 1',
          cardIds: ['b'],
        },
      },
      cardSizes: {
        a: { w: 4, h: 1 },
        b: { w: 'bad', h: 'lg' },
        ghost: { w: 1, h: 1 },
      },
      groupSizes: {
        g1: { w: 1, h: 4 },
        ghost: { w: 4, h: 4 },
      },
      hiddenCardIds: [],
    };

    const normalized = normalizeSurfaceLayout(raw, allowed);
    expect(normalized.cardSizes.a).toEqual({ w: 4, h: 1 });
    expect(normalized.cardSizes.b).toEqual({ w: 2, h: 3 });
    expect((normalized.cardSizes as Record<string, unknown>).ghost).toBeUndefined();
    expect(normalized.groupSizes.g1).toEqual({ w: 1, h: 4 });
    expect((normalized.groupSizes as Record<string, unknown>).ghost).toBeUndefined();
  });

  it('updates item sizes for cards and groups', () => {
    const base = createDefaultSurfaceLayout({
      items: [
        { type: 'card', cardId: 'a' },
        { type: 'group', groupId: 'g1' },
      ],
      groups: {
        g1: { title: 'Ops', cardIds: ['b'] },
      },
    });

    const cardResized = setLayoutItemSize(base, 'card:a', { w: 4, h: 1 });
    expect(cardResized.cardSizes.a).toEqual({ w: 4, h: 1 });

    const groupResized = setLayoutItemSize(cardResized, 'group:g1', { w: 1, h: 4 });
    expect(groupResized.groupSizes.g1).toEqual({ w: 1, h: 4 });
  });

  it('groups selected cards and merges into selected group while preserving base group size', () => {
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
      groupSizes: {
        g1: { w: 4, h: 1 },
      },
    });

    const grouped = groupSelectedItems(base, ['group:g1', 'card:d']);
    expect(grouped.items.map(dashboardItemId)).toEqual(['card:a', 'group:g1']);
    expect(grouped.groups.g1.cardIds).toEqual(['b', 'c', 'd']);
    expect(grouped.groupSizes.g1).toEqual({ w: 4, h: 1 });
  });

  it('splits selected groups back into cards and removes split group size', () => {
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
      groupSizes: {
        g1: { w: 1, h: 4 },
      },
    });

    const split = splitSelectedGroups(base, ['group:g1']);
    expect(split.items.map(dashboardItemId)).toEqual(['card:a', 'card:b', 'card:c']);
    expect(split.groups.g1).toBeUndefined();
    expect(split.groupSizes.g1).toBeUndefined();
  });
});
