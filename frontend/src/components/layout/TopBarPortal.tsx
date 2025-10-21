import React, { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';

type Side = 'left' | 'right';

interface Props {
  side: Side;
  children: React.ReactNode;
}

const TopBarPortal: React.FC<Props> = ({ side, children }) => {
  const targetId = side === 'left' ? 'topbar-left-mount' : 'topbar-right-mount';
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Lazily create a wrapper element so we can remove exactly what we mounted
  if (!wrapperRef.current && typeof document !== 'undefined') {
    wrapperRef.current = document.createElement('div');
    wrapperRef.current.className = 'min-w-0';
  }

  useEffect(() => {
    const host = document.getElementById(targetId);
    const node = wrapperRef.current!;
    if (!host) return () => {};
    host.appendChild(node);
    return () => {
      try { host.removeChild(node); } catch {}
    };
  }, [targetId]);

  const portal = useMemo(() => {
    const host = typeof document !== 'undefined' ? document.getElementById(targetId) : null;
    if (!host || !wrapperRef.current) return null;
    return createPortal(children, wrapperRef.current);
  }, [children, targetId]);

  return portal;
};

export default TopBarPortal;

