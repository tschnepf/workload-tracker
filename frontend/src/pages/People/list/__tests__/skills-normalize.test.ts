import { describe, it, expect } from 'vitest';
import { normalizeProficiencyLevel } from '@/util/skills';

describe('normalizeProficiencyLevel', () => {
  it('maps beginner synonyms', () => {
    expect(normalizeProficiencyLevel('beginner')).toBe('beginner');
    expect(normalizeProficiencyLevel('Basic')).toBe('beginner');
    expect(normalizeProficiencyLevel('NOVICE')).toBe('beginner');
  });

  it('maps intermediate synonyms', () => {
    expect(normalizeProficiencyLevel('intermediate')).toBe('intermediate');
    expect(normalizeProficiencyLevel('mid')).toBe('intermediate');
    expect(normalizeProficiencyLevel('Medium')).toBe('intermediate');
  });

  it('maps advanced synonyms', () => {
    expect(normalizeProficiencyLevel('advanced')).toBe('advanced');
    expect(normalizeProficiencyLevel('Senior')).toBe('advanced');
    expect(normalizeProficiencyLevel('HIGH')).toBe('advanced');
  });

  it('maps expert synonyms', () => {
    expect(normalizeProficiencyLevel('expert')).toBe('expert');
    expect(normalizeProficiencyLevel('Master')).toBe('expert');
    expect(normalizeProficiencyLevel('Professional')).toBe('expert');
  });

  it('defaults unknown/empty to beginner', () => {
    expect(normalizeProficiencyLevel('')).toBe('beginner');
    expect(normalizeProficiencyLevel('unknown')).toBe('beginner');
  });
});

