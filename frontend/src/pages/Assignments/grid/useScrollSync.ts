import { useCallback, useRef } from 'react';

export function useScrollSync() {
  const headerRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const syncing = useRef(false);

  const onHeaderScroll = useCallback<React.UIEventHandler<HTMLDivElement>>((e) => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      const src = e.currentTarget;
      if (bodyRef.current && Math.abs(bodyRef.current.scrollLeft - src.scrollLeft) > 1) {
        bodyRef.current.scrollLeft = src.scrollLeft;
      }
    } finally {
      syncing.current = false;
    }
  }, []);

  const onBodyScroll = useCallback<React.UIEventHandler<HTMLDivElement>>((e) => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      const src = e.currentTarget;
      if (headerRef.current && Math.abs(headerRef.current.scrollLeft - src.scrollLeft) > 1) {
        headerRef.current.scrollLeft = src.scrollLeft;
      }
    } finally {
      syncing.current = false;
    }
  }, []);

  return { headerRef, bodyRef, onHeaderScroll, onBodyScroll } as const;
}

export type UseScrollSyncReturn = ReturnType<typeof useScrollSync>;

