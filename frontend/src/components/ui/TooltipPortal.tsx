import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type TooltipPortalProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  placement?: 'right' | 'left' | 'bottom' | 'top';
  children: React.ReactNode; // trigger element
};

export const TooltipPortal: React.FC<TooltipPortalProps> = ({ title, description, placement = 'right', children }) => {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; placement: 'right' | 'left' | 'bottom' | 'top' }>({
    top: 0,
    left: 0,
    placement,
  });

  const updatePosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spacing = 8;
    const estimatedWidth = 260; // conservative estimate
    const estimatedHeight = 200; // conservative estimate

    if (placement === 'bottom' || placement === 'top') {
      let nextPlacement: 'bottom' | 'top' = placement;
      if (placement === 'bottom' && rect.bottom + spacing + estimatedHeight > window.innerHeight) {
        nextPlacement = 'top';
      } else if (placement === 'top' && rect.top - spacing - estimatedHeight < 0) {
        nextPlacement = 'bottom';
      }
      let left = Math.min(Math.max(rect.left, 8), window.innerWidth - estimatedWidth - 8);
      let top = nextPlacement === 'bottom' ? rect.bottom + spacing : rect.top - spacing;
      setPos({ top, left, placement: nextPlacement });
      return;
    }

    let top = rect.top + rect.height / 2;
    let left = rect.right + spacing;
    let nextPlacement: 'right' | 'left' = 'right';
    if (left + estimatedWidth > window.innerWidth) {
      left = rect.left - spacing; // we'll translateX(-100%) when rendering
      nextPlacement = 'left';
    }
    setPos({ top, left, placement: nextPlacement });
  }, [placement]);

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
            transform: pos.placement === 'left'
              ? 'translate(-100%, -50%)'
              : pos.placement === 'right'
                ? 'translate(0, -50%)'
                : pos.placement === 'top'
                  ? 'translate(0, -100%)'
                  : 'translate(0, 0)',
            zIndex: 50,
            pointerEvents: 'none',
          }}
        >
          <div className="px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md shadow-lg min-w-[180px] max-w-[280px]">
            <div className="text-[var(--text)] text-sm font-medium mb-1">{title}</div>
            {description && <div className="text-[var(--muted)] text-xs whitespace-pre-line">{description}</div>}
          </div>
          {/* Arrow */}
          {pos.placement === 'right' && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full">
              <div className="border-4 border-transparent border-r-[var(--border)]" />
              <div className="-ml-px border-4 border-transparent border-r-[var(--card)]" />
            </div>
          )}
          {pos.placement === 'left' && (
            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full">
              <div className="border-4 border-transparent border-l-[var(--border)]" />
              <div className="-mr-px border-4 border-transparent border-l-[var(--card)]" />
            </div>
          )}
          {pos.placement === 'bottom' && (
            <div className="absolute left-4 top-0 -translate-y-full">
              <div className="border-4 border-transparent border-b-[var(--border)]" />
              <div className="-mt-px border-4 border-transparent border-b-[var(--card)]" />
            </div>
          )}
          {pos.placement === 'top' && (
            <div className="absolute left-4 bottom-0 translate-y-full">
              <div className="border-4 border-transparent border-t-[var(--border)]" />
              <div className="-mb-px border-4 border-transparent border-t-[var(--card)]" />
            </div>
          )}
        </div>,
        document.body
      )}
    </span>
  );
};

export default TooltipPortal;
