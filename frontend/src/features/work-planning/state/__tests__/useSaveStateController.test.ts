import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSaveStateController } from '@/features/work-planning/state/useSaveStateController';

describe('useSaveStateController', () => {
  it('auto-resets state after timeout', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSaveStateController());

    act(() => {
      result.current.markSaveState('saved', 'Done', 1000);
    });
    expect(result.current.saveState).toBe('saved');

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.saveState).toBe('idle');
    expect(result.current.saveStateMessage).toBeUndefined();
    vi.useRealTimers();
  });

  it('stores and clears retry handler', async () => {
    const { result } = renderHook(() => useSaveStateController());
    const handler = vi.fn(async () => undefined);

    act(() => {
      result.current.setRetryHandler(handler);
    });

    await act(async () => {
      await result.current.retryRef.current?.();
    });
    expect(handler).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.setRetryHandler(null);
    });
    expect(result.current.retryRef.current).toBeNull();
  });
});
