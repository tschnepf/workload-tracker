import React from 'react';
import { createPortal } from 'react-dom';
import type { OpenOpts, QuickViewContextValue, QuickViewState } from './types';

const POPOVER_Z = 1200;
const VIEWPORT_PADDING = 8;
const ARROW_SIZE = 8;

function ensurePortalRoot(): HTMLElement {
  if (typeof document === 'undefined') return null as unknown as HTMLElement;
  const id = 'project-quickview-root';
  let el = document.getElementById(id) as HTMLElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
  }
  return el;
}

const QuickViewCtx = React.createContext<QuickViewContextValue | null>(null);

export function useProjectQuickViewPopover(): QuickViewContextValue {
  const ctx = React.useContext(QuickViewCtx);
  if (!ctx) throw new Error('useProjectQuickViewPopover must be used within ProjectQuickViewPopoverProvider');
  return ctx;
}

type Position = { top: number; left: number; width: number; placement: 'top' | 'bottom' };

function computePosition(anchor: DOMRect, contentSize: { width: number; height: number }, placement: OpenOpts['placement']): Position {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(Math.max(320, anchor.width), Math.min(560, vw - VIEWPORT_PADDING * 2));
  let place: 'top' | 'bottom' = 'bottom';
  if (placement === 'top-start') place = 'top';
  else if (placement === 'bottom-start') place = 'bottom';
  else {
    // auto: pick based on space
    const spaceBelow = vh - anchor.bottom;
    const spaceAbove = anchor.top;
    place = spaceBelow >= Math.min(280, contentSize.height) ? 'bottom' : (spaceAbove > spaceBelow ? 'top' : 'bottom');
  }
  // Left aligns to anchor left, but clamp within viewport
  let left = Math.max(VIEWPORT_PADDING, Math.min(anchor.left, vw - VIEWPORT_PADDING - width));
  let top = place === 'bottom' ? anchor.bottom + ARROW_SIZE : anchor.top - contentSize.height - ARROW_SIZE;
  // Clamp vertically within viewport
  top = Math.max(VIEWPORT_PADDING, Math.min(top, vh - VIEWPORT_PADDING - contentSize.height));
  return { top: Math.round(top), left: Math.round(left), width: Math.round(width), placement: place };
}

export const ProjectQuickViewPopoverProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = React.useState<QuickViewState>({ isOpen: false, projectId: null, anchorRect: null, opts: undefined });
  const portalRootRef = React.useRef<HTMLElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = React.useRef<HTMLElement | null>(null);
  const ownedPortalsRef = React.useRef<Set<HTMLElement>>(new Set());
  const positionRef = React.useRef<Position | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const [contentSize, setContentSize] = React.useState<{ width: number; height: number }>({ width: 420, height: 320 });

  React.useEffect(() => { portalRootRef.current = ensurePortalRoot(); }, []);

  const open = React.useCallback((projectId: number, anchorEl?: HTMLElement | null, opts?: OpenOpts) => {
    if (!Number.isFinite(projectId)) return;
    const anchorRect = anchorEl ? anchorEl.getBoundingClientRect() : new DOMRect(Math.floor(window.innerWidth/2 - 220), Math.floor(window.innerHeight/2 - 180), 440, 360);
    // store previous focus
    previouslyFocusedRef.current = (document.activeElement as HTMLElement) || null;
    setState({ isOpen: true, projectId, anchorRect, opts });
  }, []);

  const close = React.useCallback(() => {
    setState(prev => ({ ...prev, isOpen: false }));
    // restore focus soon after unmount
    setTimeout(() => {
      const el = previouslyFocusedRef.current;
      if (el && typeof el.focus === 'function') {
        try { el.focus(); } catch {}
      } else {
        try { const main = document.getElementById('main-content') as HTMLElement | null; main?.focus(); } catch {}
      }
    }, 0);
  }, []);

  const reposition = React.useCallback(() => {
    if (!state.isOpen || !state.anchorRect) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const cont = containerRef.current;
      const size = cont ? cont.getBoundingClientRect() : ({ width: contentSize.width, height: contentSize.height } as DOMRect);
      const pos = computePosition(state.anchorRect!, { width: size.width, height: size.height }, state.opts?.placement || 'auto');
      positionRef.current = pos;
      if (cont) {
        cont.style.top = `${pos.top}px`;
        cont.style.left = `${pos.left}px`;
        cont.style.width = `${pos.width}px`;
      }
    });
  }, [state.isOpen, state.anchorRect, state.opts?.placement, contentSize.width, contentSize.height]);

  React.useLayoutEffect(() => { if (state.isOpen) reposition(); }, [state.isOpen, state.anchorRect, contentSize, reposition]);

  React.useEffect(() => {
    if (!state.isOpen) return;
    function onScroll() { reposition(); }
    function onResize() { reposition(); }
    function onMouseDownCapture(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const container = containerRef.current;
      if (container && container.contains(target)) return; // inside popover
      // clicks inside owned portals should be ignored
      for (const el of ownedPortalsRef.current) {
        if (el.contains(target)) return;
      }
      // attribute-based check
      let node: HTMLElement | null = target;
      while (node) {
        if (node.getAttribute && node.getAttribute('data-owner') === 'project-quickview') return;
        node = node.parentElement;
      }
      // outside click => close
      close();
    }
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    document.addEventListener('mousedown', onMouseDownCapture, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('mousedown', onMouseDownCapture, true);
    };
  }, [state.isOpen, close, reposition]);

  React.useEffect(() => {
    if (!state.isOpen) return;
    function onKeyDownCapture(e: KeyboardEvent) {
      const container = containerRef.current;
      if (!container) return;
      const active = document.activeElement as HTMLElement | null;
      const focusInside = active ? (container.contains(active) || Array.from(ownedPortalsRef.current).some(el => el.contains(active))) : false;
      if (!focusInside) return;
      if (e.key === 'Escape') {
        // If focus is inside owned portal, let it handle Esc first
        const inOwned = active ? Array.from(ownedPortalsRef.current).some(el => el.contains(active)) : false;
        if (!inOwned) {
          e.preventDefault(); e.stopPropagation();
          close();
          return;
        }
        return; // allow portal to consume
      }
      if (e.key === 'Tab') {
        // focus loop
        const focusable = container.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && active === first) { e.preventDefault(); (last as HTMLElement).focus(); return; }
        if (!e.shiftKey && active === last) { e.preventDefault(); (first as HTMLElement).focus(); return; }
        return; // allow natural tabbing within
      }
      // block other keys from bubbling to global handlers
      e.preventDefault();
      e.stopPropagation();
    }
    window.addEventListener('keydown', onKeyDownCapture, true);
    return () => window.removeEventListener('keydown', onKeyDownCapture, true);
  }, [state.isOpen, close]);

  React.useEffect(() => { return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }; }, []);

  const value: QuickViewContextValue = React.useMemo(() => ({
    state,
    open,
    close,
    reposition,
    registerOwnedPortal: (el: HTMLElement) => { ownedPortalsRef.current.add(el); },
    unregisterOwnedPortal: (el: HTMLElement) => { ownedPortalsRef.current.delete(el); },
  }), [state, open, close, reposition]);

  const dialog = !state.isOpen ? null : (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Project Quick View"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: 420,
        zIndex: POPOVER_Z,
        // No transform/filter to avoid new stacking contexts
      }}
      className="rounded-md border border-[var(--border)] shadow-xl bg-[var(--card)] text-[var(--text)] overflow-hidden"
      data-owner="project-quickview"
    >
      {/* Sticky header with close */}
      <div className="sticky top-0 z-[1] flex items-center justify-between px-3 py-2 bg-[var(--card)] border-b border-[var(--border)]">
        <div id="quickview-header" className="text-sm font-semibold">Project</div>
        <button
          type="button"
          aria-label="Close"
          onClick={close}
          className="px-2 py-1 text-xs rounded hover:bg-[var(--surfaceHover)]"
          autoFocus
        >
          Close
        </button>
      </div>
      {/* Slot for content */}
      <div className="p-3 max-h-[70vh] overflow-auto">
        {/* Lazy-mount container to avoid data fetching in provider */}
        {state.projectId != null ? (
          <QuickViewLazyContainer projectId={state.projectId} onMeasured={setContentSize} onContentChange={() => reposition()} />
        ) : null}
      </div>
    </div>
  );

  return (
    <QuickViewCtx.Provider value={value}>
      {children}
      {state.isOpen && portalRootRef.current ? createPortal(dialog, portalRootRef.current) : null}
    </QuickViewCtx.Provider>
  );
};

// Lazy import of the details container to avoid circular deps
const QuickViewLazyContainer: React.FC<{ projectId: number; onMeasured: (sz: { width: number; height: number }) => void; onContentChange: () => void }>
  = ({ projectId, onMeasured, onContentChange }) => {
  const ref = React.useRef<HTMLDivElement | null>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    onMeasured({ width: r.width, height: r.height });
  }, [ref.current]);
  React.useEffect(() => { onContentChange(); }, [onContentChange]);
  const Details = React.useMemo(() => React.lazy(() => import('./ProjectDetailsContainer').then(m => ({ default: m.ProjectDetailsContainer }))), []);
  return (
    <div ref={ref}>
      <React.Suspense fallback={<div className="text-[var(--muted)] text-sm">Loading...</div>}>
        <Details projectId={projectId} />
      </React.Suspense>
    </div>
  );
};

export default ProjectQuickViewPopoverProvider;

