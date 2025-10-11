import { useRef } from 'react';
import { useVirtualizer, VirtualItem } from '@tanstack/react-virtual';

interface Options {
  count: number;
  estimateSize?: number;
  overscan?: number;
  enableVirtual?: boolean;
}

export function useVirtualRows({ count, estimateSize = 44, overscan = 6, enableVirtual = true }: Options) {
  const parentRef = useRef<HTMLDivElement | null>(null);

  const rowVirtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  const items: VirtualItem[] = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  return { parentRef, items, totalSize, enabled: enableVirtual } as const;
}

