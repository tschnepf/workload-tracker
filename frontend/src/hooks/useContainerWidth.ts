import * as React from 'react';

export interface ContainerSize {
  width: number | undefined;
  height: number | undefined;
}

export function useContainerWidth<T extends HTMLElement = HTMLDivElement>(
  ref: React.RefObject<T | null>
): ContainerSize {
  const frame = React.useRef<number | null>(null);
  const last = React.useRef<{ w: number | undefined; h: number | undefined }>({ w: undefined, h: undefined });
  const [size, setSize] = React.useState<ContainerSize>({ width: undefined, height: undefined });

  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === 'undefined') return;

    let disposed = false;
    const ro = new (window as any).ResizeObserver((entries: any[]) => {
      const entry = entries && entries[0];
      const box = entry?.borderBoxSize?.[0] || entry?.contentRect || entry?.contentBoxSize?.[0];
      const nextW: number | undefined = typeof box?.inlineSize === 'number' ? box.inlineSize : (typeof entry?.contentRect?.width === 'number' ? entry.contentRect.width : undefined);
      const nextH: number | undefined = typeof box?.blockSize === 'number' ? box.blockSize : (typeof entry?.contentRect?.height === 'number' ? entry.contentRect.height : undefined);
      if (disposed) return;
      // rAF + simple throttle to avoid layout thrash
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        if (disposed) return;
        if (last.current.w !== nextW || last.current.h !== nextH) {
          last.current = { w: nextW, h: nextH };
          setSize({ width: nextW, height: nextH });
        }
      });
    });
    ro.observe(el);
    return () => {
      disposed = true;
      if (frame.current) cancelAnimationFrame(frame.current);
      try { ro.disconnect(); } catch {}
    };
  }, [ref]);

  return size;
}

export default useContainerWidth;

