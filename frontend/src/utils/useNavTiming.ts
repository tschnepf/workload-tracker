import { useEffect, useRef } from 'react';
import { useNavigation } from 'react-router';
import { trackPerformanceEvent } from '@/utils/monitoring';

export function useNavTiming() {
  const nav = useNavigation();
  const startRef = useRef<number | null>(null);
  const pathRef = useRef<string | null>(null);

  useEffect(() => {
    if (nav.state && nav.state !== 'idle') {
      // navigation started
      if (startRef.current == null) {
        startRef.current = performance.now();
        try {
          pathRef.current = (nav as any).location?.pathname || null;
        } catch { /* ignore */ }
      }
    } else {
      // navigation settled
      if (startRef.current != null) {
        // after paint for consistency
        requestAnimationFrame(() => {
          const dur = performance.now() - (startRef.current as number);
          trackPerformanceEvent('nav.duration', dur, 'ms', { path: pathRef.current || window.location.pathname });
          if (dur > 1500) {
            trackPerformanceEvent('nav.slow.count', 1, 'count', { path: pathRef.current || window.location.pathname });
          }
          startRef.current = null;
          pathRef.current = null;
        });
      }
    }
  }, [nav.state]);
}
