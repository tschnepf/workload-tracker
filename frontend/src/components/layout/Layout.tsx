/**
 * Main layout component with VSCode-style sidebar layout
 * CRITICAL: Consistent layout wrapper for all pages
 * PRESERVE ALL EXISTING FUNCTIONALITY - only changing navigation structure
 */

import React, { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import { GlobalDepartmentFilter } from '@/components/filters/GlobalDepartmentFilter';
import { darkTheme } from '@/theme/tokens';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
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

  // Close mobile drawer on Escape
  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileSidebarOpen(false);
    }
    if (mobileSidebarOpen) {
      window.addEventListener('keydown', onEsc);
      return () => window.removeEventListener('keydown', onEsc);
    }
  }, [mobileSidebarOpen]);
  return (
    <div className="min-h-screen bg-[#1e1e1e] flex">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar />
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header actions bar */}
        <div
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
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <GlobalDepartmentFilter />
        </div>
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-8">
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
  );
};

export default Layout;
