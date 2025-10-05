import { describe, it, expect } from 'vitest';
import {
  resolveUtilizationLevel,
  utilizationLevelToClasses,
  formatUtilizationLabel,
  defaultUtilizationScheme,
  type UtilizationScheme,
} from './utilization';

describe('utilization (absolute_hours)', () => {
  const s: UtilizationScheme = { ...defaultUtilizationScheme };

  it('classifies hours by boundaries correctly', () => {
    expect(resolveUtilizationLevel({ hours: 0, scheme: s })).toBe('empty');
    expect(resolveUtilizationLevel({ hours: 1, scheme: s })).toBe('blue');
    expect(resolveUtilizationLevel({ hours: 29, scheme: s })).toBe('blue');
    expect(resolveUtilizationLevel({ hours: 30, scheme: s })).toBe('green');
    expect(resolveUtilizationLevel({ hours: 36, scheme: s })).toBe('green');
    expect(resolveUtilizationLevel({ hours: 37, scheme: s })).toBe('orange');
    expect(resolveUtilizationLevel({ hours: 40, scheme: s })).toBe('orange');
    expect(resolveUtilizationLevel({ hours: 41, scheme: s })).toBe('red');
  });

  it('provides classes for each level', () => {
    const levels: Array<ReturnType<typeof resolveUtilizationLevel>> = ['empty', 'blue', 'green', 'orange', 'red'];
    for (const lv of levels) {
      const cls = utilizationLevelToClasses(lv as any);
      expect(typeof cls).toBe('string');
      expect(cls.length).toBeGreaterThan(0);
    }
  });

  it('formats labels with zeroIsBlank', () => {
    expect(formatUtilizationLabel(0, true)).toBe('');
    expect(formatUtilizationLabel(0, false)).toBe('0h');
    expect(formatUtilizationLabel(15, true)).toBe('15h');
  });
});

describe('utilization (percent)', () => {
  const s: UtilizationScheme = { ...defaultUtilizationScheme, mode: 'percent' };

  it('uses percent thresholds when in percent mode', () => {
    expect(resolveUtilizationLevel({ percent: 10, scheme: s })).toBe('blue');
    expect(resolveUtilizationLevel({ percent: 80, scheme: s })).toBe('green');
    expect(resolveUtilizationLevel({ percent: 95, scheme: s })).toBe('orange');
    expect(resolveUtilizationLevel({ percent: 110, scheme: s })).toBe('red');
  });
});

