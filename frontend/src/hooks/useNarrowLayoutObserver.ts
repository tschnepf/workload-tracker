import { useEffect, useRef, useState } from 'react';

/**
 * Tracks whether a container is narrower than a threshold using ResizeObserver.
 */
export function useNarrowLayoutObserver(thresholdPx = 640) {
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const [isNarrowLayout, setIsNarrowLayout] = useState(false);

  useEffect(() => {
    const el = layoutRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    let frame = 0;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width ?? 0;
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = width > 0 && width < thresholdPx;
        setIsNarrowLayout((prev) => (prev === next ? prev : next));
      });
    });

    observer.observe(el);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [thresholdPx]);

  return { layoutRef, isNarrowLayout } as const;
}
