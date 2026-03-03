import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useWorkPlanningSearchTokens } from '@/features/work-planning/search/useWorkPlanningSearchTokens';

describe('useWorkPlanningSearchTokens', () => {
  it('deduplicates tokens by normalized term and operator', () => {
    const { result } = renderHook(() => useWorkPlanningSearchTokens());

    act(() => {
      result.current.setSearchInput('Client A');
    });
    act(() => {
      result.current.addSearchToken();
    });
    act(() => {
      result.current.setSearchInput(' client a ');
    });
    act(() => {
      result.current.addSearchToken();
    });

    expect(result.current.searchTokens).toHaveLength(1);
    expect(result.current.searchTokens[0].term).toBe('Client A');
  });

  it('updates active token operator instead of global operator', () => {
    const { result } = renderHook(() => useWorkPlanningSearchTokens());

    act(() => {
      result.current.setSearchInput('foo');
    });
    act(() => {
      result.current.addSearchToken();
    });
    act(() => {
      result.current.setActiveTokenId(result.current.searchTokens[0].id);
    });
    act(() => {
      result.current.handleSearchOpChange('not');
    });

    expect(result.current.searchTokens[0].op).toBe('not');
    expect(result.current.searchOp).toBe('or');
  });

  it('supports enter add, backspace pop, and escape reset', () => {
    const { result } = renderHook(() => useWorkPlanningSearchTokens());

    act(() => {
      result.current.setSearchInput('alpha');
    });
    act(() => {
      result.current.handleSearchKeyDown({ key: 'Enter', preventDefault() {} } as React.KeyboardEvent<HTMLInputElement>);
    });
    expect(result.current.searchTokens).toHaveLength(1);

    act(() => {
      result.current.handleSearchKeyDown({ key: 'Backspace', preventDefault() {} } as React.KeyboardEvent<HTMLInputElement>);
    });
    expect(result.current.searchTokens).toHaveLength(0);

    act(() => {
      result.current.setSearchInput('beta');
      result.current.setActiveTokenId('x');
      result.current.handleSearchKeyDown({ key: 'Escape', preventDefault() {} } as React.KeyboardEvent<HTMLInputElement>);
    });
    expect(result.current.searchInput).toBe('');
    expect(result.current.activeTokenId).toBeNull();
  });

  it('includes pending input token in API payload when enabled', () => {
    const { result } = renderHook(() => useWorkPlanningSearchTokens({ includePendingInputToken: true }));

    act(() => {
      result.current.setSearchInput('delta');
    });

    expect(result.current.pendingSearchToken).toEqual({ term: 'delta', op: 'or' });
    expect(result.current.searchTokensForApi).toEqual([{ term: 'delta', op: 'or' }]);
  });
});
