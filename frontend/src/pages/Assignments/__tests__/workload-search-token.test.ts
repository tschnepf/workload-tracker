import { describe, expect, it } from 'vitest';
import {
  classifyWorkloadTokenTerm,
  hasInvalidWorkloadLikeTokens,
  isNumericWorkloadTokenTerm,
  matchesNumericWorkloadTerm,
  normalizeWorkloadAliasTerm,
} from '@/utils/workloadSearch';

describe('workload search tokens', () => {
  it('normalizes aliases to canonical terms', () => {
    expect(normalizeWorkloadAliasTerm('underloaded')).toBe('available');
    expect(normalizeWorkloadAliasTerm('overloaded')).toBe('overallocated');
  });

  it('classifies canonical utilization keywords as workload filters', () => {
    expect(classifyWorkloadTokenTerm('available').isWorkload).toBe(true);
    expect(classifyWorkloadTokenTerm('optimal').isWorkload).toBe(true);
    expect(classifyWorkloadTokenTerm('full').isWorkload).toBe(true);
    expect(classifyWorkloadTokenTerm('overallocated').isWorkload).toBe(true);
  });

  it('classifies numeric workload expressions', () => {
    expect(classifyWorkloadTokenTerm('<30').isWorkload).toBe(true);
    expect(classifyWorkloadTokenTerm('10-20').isWorkload).toBe(true);
    expect(classifyWorkloadTokenTerm('>14, <30').isWorkload).toBe(true);
    expect(classifyWorkloadTokenTerm('<5hr').isWorkload).toBe(true);
    expect(classifyWorkloadTokenTerm('10hr - 20hrs').canonicalTerm).toBe('10-20');
  });

  it('detects numeric workload terms', () => {
    expect(isNumericWorkloadTokenTerm('<5hr')).toBe(true);
    expect(isNumericWorkloadTokenTerm('10-20h')).toBe(true);
    expect(isNumericWorkloadTokenTerm('available')).toBe(false);
  });

  it('matches numeric workload terms against weekly totals', () => {
    expect(matchesNumericWorkloadTerm(4, '<5')).toBe(true);
    expect(matchesNumericWorkloadTerm(4, '<5hr')).toBe(true);
    expect(matchesNumericWorkloadTerm(8, '<5')).toBe(false);
    expect(matchesNumericWorkloadTerm(18, '10-20')).toBe(true);
    expect(matchesNumericWorkloadTerm(21, '>20hrs')).toBe(true);
  });

  it('flags invalid workload-like input for non-blocking hint', () => {
    const invalid = classifyWorkloadTokenTerm('>x');
    expect(invalid.isWorkload).toBe(false);
    expect(invalid.isInvalidWorkloadLike).toBe(true);
  });

  it('does not flag normal text tokens as invalid workload expressions', () => {
    expect(hasInvalidWorkloadLikeTokens([{ term: 'director' }])).toBe(false);
  });
});
