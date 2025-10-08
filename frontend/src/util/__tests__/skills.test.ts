import { describe, it, expect } from 'vitest';
import { normalizeProficiencyLevel } from '@/util/skills';

describe('skills utils', () => {
  it('normalizes proficiency levels to allowed union', () => {
    expect(normalizeProficiencyLevel('Beginner')).toBe('beginner');
    expect(normalizeProficiencyLevel('basic')).toBe('beginner');
    expect(normalizeProficiencyLevel('novice')).toBe('beginner');

    expect(normalizeProficiencyLevel('Intermediate')).toBe('intermediate');
    expect(normalizeProficiencyLevel('mid')).toBe('intermediate');
    expect(normalizeProficiencyLevel('medium')).toBe('intermediate');

    expect(normalizeProficiencyLevel('Advanced')).toBe('advanced');
    expect(normalizeProficiencyLevel('senior')).toBe('advanced');
    expect(normalizeProficiencyLevel('high')).toBe('advanced');

    expect(normalizeProficiencyLevel('Expert')).toBe('expert');
    expect(normalizeProficiencyLevel('master')).toBe('expert');
    expect(normalizeProficiencyLevel('professional')).toBe('expert');
  });

  it('defaults unknown to beginner', () => {
    expect(normalizeProficiencyLevel('')).toBe('beginner');
    expect(normalizeProficiencyLevel('unrecognized')).toBe('beginner');
  });
});

