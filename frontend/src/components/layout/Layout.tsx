/**
 * Main layout component with VSCode-style sidebar layout
 * CRITICAL: Consistent layout wrapper for all pages
 * PRESERVE ALL EXISTING FUNCTIONALITY - only changing navigation structure
 */

import React, { useEffect, useRef, useState } from 'react';
import { LayoutContext } from './LayoutContext';
import Sidebar from './Sidebar';
import { GlobalDepartmentFilter } from '@/components/filters/GlobalDepartmentFilter';
import { darkTheme } from '@/theme/tokens';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
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
    <div className="h-[100svh] md:h-screen overflow-hidden bg-[#1e1e1e] flex">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar />
      </div>
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Header actions bar */}
        <div
          className="flex-shrink-0"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '8px 12px',
            borderBottom: `1px solid ${darkTheme.colors.border.primary}`,
            backgroundColor: darkTheme.colors.background.secondary,
          }}
        >
          {/* Mobile: hamburger to toggle sidebar */}
          <button
            type="button"
            aria-label="Open navigation"
            className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-md text-[#cccccc] hover:text-white hover:bg-[#3e3e42] focus:outline-none focus:ring-2 focus:ring-[#007acc]"
            onClick={() => setMobileSidebarOpen(true)}
            ref={hamburgerRef}
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <GlobalDepartmentFilter />
        </div>
        <main className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
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
            <div className="relative h-full bg-[#2d2d30] border-r border-[#3e3e42] shadow-xl">
              {/* Close button (overlay) */}
              <button
                type="button"
                aria-label="Close navigation"
                className="absolute -right-10 top-2 inline-flex items-center justify-center w-10 h-10 rounded-md text-[#cccccc] hover:text-white hover:bg-[#3e3e42] focus:outline-none focus:ring-2 focus:ring-[#007acc]"
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
    </LayoutContext.Provider>
  );
};

export default Layout;
