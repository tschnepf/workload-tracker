import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { act } from 'react-dom/test-utils';
import { useContainerWidth } from '../useContainerWidth';

class MockResizeObserver {
  private static _cb: any;
  constructor(cb: any) { MockResizeObserver._cb = cb; }
  observe() {}
  disconnect() {}
  static trigger(width = 320, height = 200) {
    const entry: any = { contentRect: { width, height } };
    MockResizeObserver._cb?.([entry]);
  }
}

(globalThis as any).ResizeObserver = MockResizeObserver as any;

function Harness() {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const { width, height } = useContainerWidth(ref);
  return (
    <div>
      <div ref={ref} data-testid="target" />
      <div data-testid="w">{width ?? ''}</div>
      <div data-testid="h">{height ?? ''}</div>
    </div>
  );
}

describe('useContainerWidth', () => {
  it('updates size when ResizeObserver triggers', async () => {
    render(<Harness />);
    // initial: undefined until observer fires
    expect(screen.getByTestId('w').textContent).toBe('');
    await act(async () => {
      MockResizeObserver.trigger(400, 220);
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.getByTestId('w').textContent).toBe('400');
    expect(screen.getByTestId('h').textContent).toBe('220');
  });
});
