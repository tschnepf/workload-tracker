/**
 * Main layout component with VSCode-style sidebar layout
 * CRITICAL: Consistent layout wrapper for all pages
 * PRESERVE ALL EXISTING FUNCTIONALITY - only changing navigation structure
 */

import React from 'react';
import Sidebar from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-[#1e1e1e] flex">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;