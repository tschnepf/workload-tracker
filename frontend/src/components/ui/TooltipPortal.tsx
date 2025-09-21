import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type TooltipPortalProps = {
  title: string;
  description?: string;
  children: React.ReactNode; // trigger element
};

export const TooltipPortal: React.FC<TooltipPortalProps> = ({ title, description, children }) => {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; placeLeft: boolean }>({ top: 0, left: 0, placeLeft: false });

  const updatePosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spacing = 8;
    const estimatedWidth = 240; // conservative estimate
    let top = rect.top + rect.height / 2;
    let left = rect.right + spacing;
    let placeLeft = false;
    if (left + estimatedWidth > window.innerWidth) {
      left = rect.left - spacing; // we'll translateX(-100%) when rendering
      placeLeft = true;
    }
    setPos({ top, left, placeLeft });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onScroll = () => updatePosition();
    const onResize = () => updatePosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, updatePosition]);

  const triggerProps = useMemo(() => ({
    onMouseEnter: () => setOpen(true),
    onMouseLeave: () => setOpen(false),
    onFocus: () => setOpen(true),
    onBlur: () => setOpen(false),
  }), []);

  return (
    <span ref={anchorRef} className="relative inline-flex" {...(triggerProps as any)}>
      {children}
      {open && createPortal(
        <div
          style={{
            position: 'fixed',
            top: Math.round(pos.top),
            left: Math.round(pos.left),
            transform: `translate(${pos.placeLeft ? '-100%' : '0'}, -50%)`,
            zIndex: 50,
            pointerEvents: 'none',
          }}
        >
          <div className="px-3 py-2 bg-[#2d2d30] border border-[#3e3e42] rounded-md shadow-lg min-w-[180px] max-w-[280px]">
            <div className="text-[#cccccc] text-sm font-medium mb-1">{title}</div>
            {description && <div className="text-[#bdbdbd] text-xs">{description}</div>}
          </div>
          {/* Arrow */}
          {!pos.placeLeft ? (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full">
              <div className="border-4 border-transparent border-r-[#3e3e42]" />
              <div className="-ml-px border-4 border-transparent border-r-[#2d2d30]" />
            </div>
          ) : (
            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full">
              <div className="border-4 border-transparent border-l-[#3e3e42]" />
              <div className="-mr-px border-4 border-transparent border-l-[#2d2d30]" />
            </div>
          )}
        </div>,
        document.body
      )}
    </span>
  );
};

export default TooltipPortal;

