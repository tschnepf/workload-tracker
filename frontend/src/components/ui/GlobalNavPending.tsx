import React from 'react';
import { createPortal } from 'react-dom';
import { useNavigation } from 'react-router';
import { getFlag } from '@/lib/flags';

const GlobalNavPending: React.FC = () => {
  const nav = useNavigation();
  const enabled = getFlag('NAV_PENDING_OVERLAY', true);
  const pending = enabled && nav.state && nav.state !== 'idle';

  if (!pending) return null;

  // Blank overlay to make the transition obvious, with SR-only text
  return createPortal(
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        background: 'color-mix(in srgb, var(--color-bg) 92%, black)',
        zIndex: 950,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-action-primary-hover)] border-t-transparent motion-reduce:hidden" />
        <span style={{ color: 'var(--color-text-primary)' }}>Loading…</span>
      </div>
      <span className="sr-only">Loading page…</span>
    </div>,
    document.body
  );
};

export default GlobalNavPending;
