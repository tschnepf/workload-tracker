/**
 * Navigation component with dark mode styling
 * CRITICAL: Maintain consistent navigation across all pages
 */

import React from 'react';
import { Link, useLocation } from 'react-router';

const Navigation: React.FC = () => {
  const location = useLocation();
  
  // VSCode-style dark theme navigation styling - maintain consistency
  const navStyles = {
    container: 'bg-[#2d2d30] border-b border-[#3e3e42] shadow-sm',
    inner: 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8',
    logo: 'text-xl font-bold text-[#cccccc]',
    links: 'flex space-x-8',
    link: 'text-[#969696] hover:text-[#cccccc] px-3 py-2 text-sm font-medium transition-colors',
    activeLink: 'text-[#007acc] hover:text-[#1e90ff] px-3 py-2 text-sm font-medium'
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className={navStyles.container}>
      <div className={navStyles.inner}>
        <div className="flex justify-between items-center h-16">
          <div className={navStyles.logo}>
            Workload Tracker
          </div>
          <div className={navStyles.links}>
            <Link 
              to="/dashboard" 
              className={isActive('/dashboard') ? navStyles.activeLink : navStyles.link}
            >
              Dashboard
            </Link>
            <Link 
              to="/people" 
              className={isActive('/people') ? navStyles.activeLink : navStyles.link}
            >
              People
            </Link>
            <Link 
              to="/assignments" 
              className={isActive('/assignments') ? navStyles.activeLink : navStyles.link}
            >
              Assignments
            </Link>
            <Link 
              to="/projects" 
              className={isActive('/projects') ? navStyles.activeLink : navStyles.link}
            >
              Projects
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
