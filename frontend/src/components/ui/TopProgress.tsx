import React from 'react';
import { createPortal } from 'react-dom';
import { useNavigation } from 'react-router';
import { getFlag } from '@/lib/flags';

function useShowWithDelays(active: boolean, delayMs = 130, minVisibleMs = 240) {
  const [visible, setVisible] = React.useState(false);
  const showTimer = React.useRef<number | null>(null);
  const hideTimer = React.useRef<number | null>(null);
  const lastShowTs = React.useRef<number>(0);

  React.useEffect(() => {
    // Clear timers on unmount
    return () => {
      if (showTimer.current) window.clearTimeout(showTimer.current);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);

  React.useEffect(() => {
    if (active) {
      if (hideTimer.current) {
        window.clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      if (visible) return; // already visible
      if (showTimer.current) return; // already scheduled
      showTimer.current = window.setTimeout(() => {
        lastShowTs.current = performance.now();
        setVisible(true);
        showTimer.current = null;
      }, Math.max(0, delayMs));
    } else {
      if (showTimer.current) {
        window.clearTimeout(showTimer.current);
        showTimer.current = null;
      }
      if (!visible) return; // nothing to hide
      const elapsed = performance.now() - lastShowTs.current;
      const remaining = Math.max(0, minVisibleMs - elapsed);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => {
        setVisible(false);
        hideTimer.current = null;
      }, remaining);
    }
  }, [active, delayMs, minVisibleMs, visible]);

  return visible;
}

export const TopProgress: React.FC = () => {
  const nav = useNavigation();
  const enabled = getFlag('NAV_PROGRESS', true);

  // Only show on real navigations
  const pending = enabled && nav.state && nav.state !== 'idle';

  const visible = useShowWithDelays(pending, 130, 260);

  const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const bar = visible ? (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 1000,
        background: 'linear-gradient(90deg, #007acc, #4aa3ff)',
        opacity: 0.9,
        transformOrigin: 'left',
        animation: prefersReducedMotion ? undefined : 'tp-indeterminate 1.2s infinite',
      }}
    />
  ) : null;

  const sr = visible ? (
    <div role="status" aria-live="polite" aria-atomic="true" style={{ position: 'fixed', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
      Navigating, please wait
    </div>
  ) : null;

  return createPortal(
    <>
      <style>{`
        @keyframes tp-indeterminate {
          0% { transform: scaleX(0.08) translateX(0%); }
          50% { transform: scaleX(0.4) translateX(60%); }
          100% { transform: scaleX(0.08) translateX(100%); }
        }
      `}</style>
      {bar}
      {sr}
    </>,
    document.body
  );
};

export default TopProgress;

