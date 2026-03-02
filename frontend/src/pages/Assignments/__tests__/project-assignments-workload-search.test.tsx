import { describe, expect, it } from 'vitest';
import { filterTextCompatibleTokens } from '@/utils/workloadSearch';

describe('project assignments workload token filtering', () => {
  it('omits workload-only tokens from row-level assignment requests', () => {
    const filtered = filterTextCompatibleTokens([
      { term: 'available', op: 'and' as const },
      { term: '>14, <30', op: 'or' as const },
      { term: 'director', op: 'and' as const },
      { term: 'client acme', op: 'or' as const },
    ]);
    expect(filtered).toEqual([
      { term: 'director', op: 'and' },
      { term: 'client acme', op: 'or' },
    ]);
  });

  it('keeps invalid workload-like tokens as text tokens for fallback search', () => {
    const filtered = filterTextCompatibleTokens([
      { term: '>x', op: 'and' as const },
      { term: 'overloaded', op: 'or' as const },
      { term: 'qa', op: 'and' as const },
    ]);
    expect(filtered).toEqual([
      { term: '>x', op: 'and' },
      { term: 'qa', op: 'and' },
    ]);
  });
});
