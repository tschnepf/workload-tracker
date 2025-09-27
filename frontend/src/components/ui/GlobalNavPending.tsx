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
        background: 'rgba(30,30,30,0.92)',
        zIndex: 950,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="inline-block w-6 h-6 border-2 border-[#4aa3ff] border-t-transparent rounded-full animate-spin motion-reduce:hidden" />
        <span style={{ color: '#cccccc' }}>Loading…</span>
      </div>
      <span className="sr-only">Loading page…</span>
    </div>,
    document.body
  );
};

export default GlobalNavPending;
