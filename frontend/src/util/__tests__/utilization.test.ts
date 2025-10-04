import { describe, it, expect } from 'vitest';
import { defaultUtilizationScheme, resolveUtilizationLevel, formatUtilizationLabel } from '@/util/utilization';

describe('utilization classification (hours mode)', () => {
  const s = defaultUtilizationScheme;
  it('classifies boundaries correctly', () => {
    expect(resolveUtilizationLevel({ hours: 0, capacity: 36, scheme: s })).toBe('empty');
    expect(resolveUtilizationLevel({ hours: 1, capacity: 36, scheme: s })).toBe('blue');
    expect(resolveUtilizationLevel({ hours: 29, capacity: 36, scheme: s })).toBe('blue');
    expect(resolveUtilizationLevel({ hours: 30, capacity: 36, scheme: s })).toBe('green');
    expect(resolveUtilizationLevel({ hours: 36, capacity: 36, scheme: s })).toBe('green');
    expect(resolveUtilizationLevel({ hours: 37, capacity: 36, scheme: s })).toBe('orange');
    expect(resolveUtilizationLevel({ hours: 40, capacity: 36, scheme: s })).toBe('orange');
    expect(resolveUtilizationLevel({ hours: 41, capacity: 36, scheme: s })).toBe('red');
  });

  it('formats labels with zeroIsBlank', () => {
    expect(formatUtilizationLabel(0, true)).toBe('');
    expect(formatUtilizationLabel(0, false)).toBe('0h');
    expect(formatUtilizationLabel(15, true)).toBe('15h');
  });
});

