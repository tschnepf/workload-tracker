/**
 * Main layout component with VSCode-style sidebar layout
 * CRITICAL: Consistent layout wrapper for all pages
 * PRESERVE ALL EXISTING FUNCTIONALITY - only changing navigation structure
 */

import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigation, useNavigate } from 'react-router';
import { LayoutContext } from './LayoutContext';
import Sidebar from './Sidebar';
import { GlobalDepartmentFilter } from '@/components/filters/GlobalDepartmentFilter';
import TopProgress from '@/components/ui/TopProgress';
import GlobalNavPending from '@/components/ui/GlobalNavPending';
import { setPendingPath } from '@/lib/navFeedback';
import { useNavTiming } from '@/utils/useNavTiming';
import Button from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { logout as performLogout } from '@/store/auth';
import { TopBarSlotsProvider, useTopBarSlotValues } from '@/components/layout/TopBarSlots';
import { LayoutDensityProvider, useLayoutDensity } from '@/components/layout/useLayoutDensity';
import { ProjectQuickViewPopoverProvider } from '@/components/projects/quickview';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const nav = useNavigation();
  const navigate = useNavigate();
  useNavTiming();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const auth = useAuth();
  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      // Don't hijack when typing in inputs/textareas/contenteditable
      const target = e.target as HTMLElement;
      const isTyping = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        (target as any).isContentEditable
      );
      if (isTyping) return;
      if (e.altKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        const input = document.getElementById('global-dept-filter-input') as HTMLInputElement | null;
        if (input) {
          e.preventDefault();
          input.focus();
        }
      }
    }
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, []);

  // Clear local pending-path marker when navigation finishes
  useEffect(() => {
    if (nav.state === 'idle') {
      setPendingPath(null);
    }
  }, [nav.state]);

  // Close mobile drawer on Escape and manage focus trap when open
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMobileSidebarOpen(false);
        return;
      }
      if (e.key === 'Tab' && mobileSidebarOpen && dialogRef.current) {
        const root = dialogRef.current;
        const focusable = root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (!active || !root.contains(active)) {
          first.focus();
          e.preventDefault();
          return;
        }
        if (!e.shiftKey && active === last) {
          first.focus();
          e.preventDefault();
        } else if (e.shiftKey && active === first) {
          last.focus();
          e.preventDefault();
        }
      }
    }
    if (mobileSidebarOpen) {
      window.addEventListener('keydown', onKey);
      // Move focus to first focusable in dialog on open
      setTimeout(() => {
        const root = dialogRef.current;
        if (!root) return;
        const first = root.querySelector<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        first?.focus();
      }, 0);
      return () => window.removeEventListener('keydown', onKey);
    } else {
      // Restore focus to hamburger when closing
      hamburgerRef.current?.focus();
    }
  }, [mobileSidebarOpen]);
  return (
    <LayoutContext.Provider value={true}>
    <LayoutDensityProvider>
    <div className="h-[100svh] md:h-screen overflow-hidden bg-[var(--bg)] flex">
      {/* Global top-edge progress indicator */}
      <TopProgress />
      {/* Blank overlay while navigation is pending (ensures obvious feedback) */}
      <GlobalNavPending />
      {/* Skip link for keyboard users */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 bg-[var(--primary)] text-white px-3 py-2 rounded">
        Skip to main content
      </a>
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar />
      </div>
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Header actions bar */}
        <TopBarSlotsProvider>
          <TopBarInner
            authPresent={!!auth?.accessToken}
            onLogout={async () => { try { await performLogout(); } finally { navigate('/login', { replace: true }); } }}
            onOpenSidebar={() => setMobileSidebarOpen(true)}
            hamburgerRef={hamburgerRef}
          />
          <MainWithDensity ariaBusy={nav.state !== 'idle'}>
            <ProjectQuickViewPopoverProvider>
              {children}
            </ProjectQuickViewPopoverProvider>
          </MainWithDensity>
        </TopBarSlotsProvider>
      </div>

      {/* Mobile off-canvas sidebar */}
      {mobileSidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          ref={dialogRef}
        >
          {/* backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileSidebarOpen(false)}
          />
          {/* panel */}
          <div className="absolute inset-y-0 left-0 flex w-64">
            <div className="relative h-full bg-[var(--surface)] border-r border-[var(--border)] shadow-xl">
              {/* Close button (overlay) */}
              <button
                type="button"
                aria-label="Close navigation"
                className="absolute -right-10 top-2 inline-flex items-center justify-center w-10 h-10 rounded-md text-[var(--text)] hover:text-white hover:bg-[var(--surfaceHover)] focus:outline-none focus:ring-2 focus:ring-[var(--focus)]"
                onClick={() => setMobileSidebarOpen(false)}
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
              {/* Reuse existing Sidebar markup for consistency */}
              <Sidebar showLabels />
            </div>
          </div>
        </div>
      )}
    </div>
    </LayoutDensityProvider>
    </LayoutContext.Provider>
  );
};

export default Layout;

// Separate top bar to read slot content and keep Layout readable
const TopBarInner: React.FC<{
  authPresent: boolean;
  onLogout: () => Promise<void> | void;
  onOpenSidebar: () => void;
  hamburgerRef: React.RefObject<HTMLButtonElement>;
}> = ({ authPresent, onLogout, onOpenSidebar, hamburgerRef }) => {
  const { left, right } = useTopBarSlotValues();
  return (
    <div
      id="app-topbar"
      className="flex-shrink-0"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        flexWrap: 'nowrap',
        padding: '6px 10px',
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--surface)',
        zIndex: 30,
        position: 'sticky',
        top: 0,
      }}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <button
          type="button"
          aria-label="Open navigation"
          className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-md text-[var(--text)] hover:text-white hover:bg-[var(--surfaceHover)] focus:outline-none focus:ring-2 focus:ring-[var(--focus)]"
          onClick={onOpenSidebar}
          ref={hamburgerRef}
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <GlobalDepartmentFilter expand={false} />
        {/* Explicit portal mount points for page headers */}
        <div id="topbar-left-mount" className="min-w-0" />
        <div id="topbar-right-mount" className="min-w-0" />
        {left ? <div className="min-w-0">{left}</div> : null}
      </div>
      <div className="flex items-center gap-2 min-w-0 ml-auto">
        {authPresent && (
          <Button
            variant="ghost"
            size="sm"
            aria-label="Log out"
            onClick={onLogout}
            className="px-2 py-1 text-xs sm:text-sm"
            style={{ minHeight: 32 }}
          >
            Log out
          </Button>
        )}
      </div>
    </div>
  );
};

const MainWithDensity: React.FC<{ children: React.ReactNode; ariaBusy: boolean }>
  = ({ children, ariaBusy }) => {
  const { density } = useLayoutDensity();
  // In compact mode we want the content (week header) to snap directly under the top bar
  const verticalPadding = density === 'compact' ? 'py-0' : 'py-0';
  const horizontalPadding = density === 'compact' ? 'px-0' : 'px-0';
  return (
    <main id="main-content" tabIndex={-1} aria-busy={ariaBusy} className={`flex-1 min-h-0 overflow-y-auto ${horizontalPadding} ${verticalPadding}`}>
      {children}
    </main>
  );
};
