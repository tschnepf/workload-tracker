/**
 * Main layout component with VSCode-style sidebar layout
 * CRITICAL: Consistent layout wrapper for all pages
 * PRESERVE ALL EXISTING FUNCTIONALITY - only changing navigation structure
 */

import React, { useEffect } from 'react';
import Sidebar from './Sidebar';
import { GlobalDepartmentFilter } from '@/components/filters/GlobalDepartmentFilter';
import { darkTheme } from '@/theme/tokens';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
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
  return (
    <div className="min-h-screen bg-[#1e1e1e] flex">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header actions bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 12,
            padding: '8px 12px',
            borderBottom: `1px solid ${darkTheme.colors.border.primary}`,
            backgroundColor: darkTheme.colors.background.secondary,
          }}
        >
          <GlobalDepartmentFilter />
        </div>
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;