import { describe, expect, it } from 'vitest';
import {
  classifyWorkloadTokenTerm,
  hasInvalidWorkloadLikeTokens,
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
