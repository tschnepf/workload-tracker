// Utilities to schedule non-critical work after first paint

export function schedulePostPaint(fn: () => void) {
  if (typeof window === 'undefined') return fn();
  const raf = window.requestAnimationFrame || ((cb: FrameRequestCallback) => window.setTimeout(cb, 16) as unknown as number);
  const ric: any = (window as any).requestIdleCallback || ((cb: Function) => window.setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 0 }), 50));
  raf(() => ric(() => fn()));
}

import React from 'react';

export function usePostPaintReady(): boolean {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    schedulePostPaint(() => setReady(true));
  }, []);
  return ready;
}

