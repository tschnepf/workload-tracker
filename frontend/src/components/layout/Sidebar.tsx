/**
 * Production Sidebar Component - Always collapsed with hover tooltips
 * Extracted from working mockup and cleaned for production use
 */

import React from 'react';
import { Link, useLocation, useNavigate, useNavigation } from 'react-router';
import TooltipPortal from '@/components/ui/TooltipPortal';
import { useAuth } from '@/hooks/useAuth';
import { getFlag } from '@/lib/flags';
import { prefetchRoute, wasPrefetched } from '@/routes/prefetch';
import { prefetchDataForRoute } from '@/routes/prefetchData';
import { startViewTransition, supportsViewTransitions } from '@/utils/viewTransitions';
import { trackPerformanceEvent } from '@/utils/monitoring';
import { setPendingPath, useNavFeedback } from '@/lib/navFeedback';

// Reusable Icon Component for navigation
const IconComponent = ({ type, className = "w-4 h-4", isActive = false }: { type: string, className?: string, isActive?: boolean }) => {
  const iconColor = "currentColor";
  
  switch (type) {
    case 'dashboard':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="1.5">
          <rect x="3" y="3" width="7" height="7"/>
          <rect x="14" y="3" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/>
          <rect x="3" y="14" width="7" height="7"/>
        </svg>
      );
    case 'people':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="1.5">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      );
    case 'assignments':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14,2 14,8 20,8"/>
          <line x1="9" y1="15" x2="15" y2="15"/>
          <line x1="9" y1="18" x2="13" y2="18"/>
        </svg>
      );
    case 'departments':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="1.5">
          <path d="M3 21h18"/>
          <path d="M5 21V7l8-4v18"/>
          <path d="M19 21V11l-6-4"/>
        </svg>
      );
    case 'projects':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="1.5">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
      );
    case 'reports':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="1.5">
          <polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/>
        </svg>
      );
    case 'skills':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="1.5">
          <path d="M12 2L2 7v10c0 5.55 3.84 10 9 11 1.16.21 2.76.21 3.92 0C20.16 27 24 22.55 24 17V7l-10-5z"/>
          <path d="M8 11l2 2 4-4"/>
        </svg>
      );
    case 'hierarchy':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="1.5">
          <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/>
          <path d="M16 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/>
          <path d="M12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/>
          <path d="M10.5 8.5 9.5 14.5"/>
          <path d="M13.5 8.5 14.5 14.5"/>
        </svg>
      );
    case 'manager':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="1.5">
          <circle cx="12" cy="8" r="5"/>
          <path d="M20 21a8 8 0 0 0-16 0"/>
          <path d="M12 13v8"/>
          <path d="M8 17l4-4 4 4"/>
        </svg>
      );
    case 'settings':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="1.5">
          <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"/>
        </svg>
      );
    case 'help':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="1.5">
          <circle cx="12" cy="12" r="10"/>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
          <circle cx="12" cy="17" r="1"/>
        </svg>
      );
    case 'calendar':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="1.5">
          <rect x="3" y="5" width="18" height="16" rx="2"/>
          <line x1="16" y1="3" x2="16" y2="7"/>
          <line x1="8" y1="3" x2="8" y2="7"/>
          <line x1="3" y1="11" x2="21" y2="11"/>
        </svg>
      );
    default:
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="1.5">
          <circle cx="12" cy="12" r="10"/>
        </svg>
      );
  }
};

// Tooltips render via portal for menu items so they never get clipped by the scrollbox

type SidebarProps = {
  showLabels?: boolean; // When true, render text labels next to icons (used for mobile drawer)
};

const Sidebar: React.FC<SidebarProps> = ({ showLabels = false }) => {
  const location = useLocation();
  const nav = useNavigation();
  const { pendingPath: localPendingPath } = useNavFeedback();
  const navigate = useNavigate();
  const auth = useAuth();

  const menuItems = [
    ...(getFlag('PERSONAL_DASHBOARD', true) ? [{
      path: '/my-work',
      icon: 'dashboard',
      label: 'My Work',
      description: 'Your assignments & milestones'
    }] : []),
    { 
      path: '/dashboard', 
      icon: 'dashboard', 
      label: 'Dashboard',
      description: 'Overview and metrics'
    },
    { 
      path: '/people', 
      icon: 'people', 
      label: 'People',
      description: 'Team management'
    },
    { 
      path: '/departments', 
      icon: 'departments', 
      label: 'Departments',
      description: 'Organization structure'
    },
    { 
      path: '/assignments', 
      icon: 'assignments', 
      label: 'Assignments',
      description: 'Workload allocation'
    },
    { 
      path: '/project-assignments', 
      icon: 'assignments', 
      label: 'Project Assignments',
      description: 'Projects grouped with assigned people'
    },
    { 
      path: '/projects', 
      icon: 'projects', 
      label: 'Projects',
      description: 'Project tracking'
    },
    
    {
      path: '/reports/forecast',
      icon: 'reports',
      label: 'Forecast',
      description: 'Team forecast & timeline'
    },
    { 
      path: '/deliverables/calendar', 
      icon: 'calendar', 
      label: 'Calendar',
      description: 'Milestone schedule'
    },
    { 
      path: '/skills', 
      icon: 'skills', 
      label: 'Skills',
      description: 'Team skills analysis'
    },
    { 
      path: '/settings', 
      icon: 'settings', 
      label: 'Settings',
      description: 'System configuration'
    }
  ];

  // Advanced department features
  const departmentItems = [
    { 
      path: '/departments/manager', 
      icon: 'manager', 
      label: 'Manager View',
      description: 'Department management dashboard'
    },
    { 
      path: '/departments/hierarchy', 
      icon: 'hierarchy', 
      label: 'Org Chart',
      description: 'Department hierarchy visualization'
    },
    { 
      path: '/departments/reports', 
      icon: 'reports', 
      label: 'Reports',
      description: 'Department analytics and insights'
    }
  ];

  const systemItems: Array<{ path: string; icon: string; label: string; description?: string }> = [];


  const pendingPath = (nav as any)?.location?.pathname as string | undefined;
  const isActive = (path: string) => {
    if (location.pathname === path || location.pathname.startsWith(path + '/')) return true;
    if (pendingPath && (pendingPath === path || pendingPath.startsWith(path + '/'))) return true;
    if (localPendingPath && (localPendingPath === path || localPendingPath.startsWith(path + '/'))) return true;
    return false;
  };

  const widthClass = showLabels ? 'w-64' : 'w-16';
  const linkLayoutClass = showLabels ? 'justify-start gap-3 w-full' : 'justify-center';

  return (
    <div className={`bg-[#2d2d30] border-r border-[#3e3e42] flex-shrink-0 ${widthClass} h-screen flex flex-col z-10`}>

      {/* Header */}
      <div className="h-16 flex items-center border-b border-[#3e3e42] relative flex-shrink-0">
        <TooltipPortal title="Workload Tracker" description="Resource Management System">
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-8 h-8 bg-[#007acc] rounded flex items-center justify-center">
              <span className="text-white text-sm font-bold">WT</span>
            </div>
          </div>
        </TooltipPortal>
      </div>

      {/* Scrollable middle: Navigation Menu */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
      <nav className="py-4" role="navigation" aria-label="Primary">
        <div className="space-y-1 px-3">
          {menuItems.map((item) => (
            <TooltipPortal key={item.path} title={item.label} description={item.description}>
              <Link
                to={item.path}
                onMouseEnter={() => {
                  if (!auth?.accessToken) return; // gate by auth
                  if (!getFlag('ROUTE_PREFETCH', true)) return;
                  prefetchRoute(item.path, { delayMs: 120 }).catch(() => {});
                  prefetchDataForRoute(item.path).catch(() => {});
                }}
                onFocus={() => {
                  if (!auth?.accessToken) return;
                  if (!getFlag('ROUTE_PREFETCH', true)) return;
                  prefetchRoute(item.path, { delayMs: 120 }).catch(() => {});
                  prefetchDataForRoute(item.path).catch(() => {});
                }}
                onClick={(e) => {
                  // Wrap navigation in a view transition when enabled
                  const enableVT = getFlag('VIEW_TRANSITIONS', false) && supportsViewTransitions();
                  // Mark local pending immediately for instant sidebar feedback
                  setPendingPath(item.path);
                  if (!enableVT) {
                    // Record prefetch hit/miss telemetry
                    const hit = wasPrefetched(item.path);
                    trackPerformanceEvent('prefetch.chunk.click', hit ? 1 : 0, 'count', { path: item.path, status: hit ? 'hit' : 'miss' });
                    return; // allow default link navigation
                  }
                  e.preventDefault();
                  const hit = wasPrefetched(item.path);
                  trackPerformanceEvent('prefetch.chunk.click', hit ? 1 : 0, 'count', { path: item.path, status: hit ? 'hit' : 'miss' });
                  startViewTransition(() => navigate(item.path)).catch(() => navigate(item.path));
                }}
                aria-current={isActive(item.path) ? 'page' : undefined}
                aria-label={!showLabels ? item.label : undefined}
                className={`
                  group flex items-center rounded-md text-sm transition-all duration-200 px-3 py-2.5 ${linkLayoutClass}
                  ${isActive(item.path) 
                    ? 'bg-[#007acc]/10 border-r-2 border-[#007acc] text-[#007acc]' 
                    : 'text-[#969696] hover:text-[#cccccc] hover:bg-[#3e3e42]/50'
                  }
                `}
              >
                <div className="flex-shrink-0">
                  <IconComponent 
                    type={item.icon} 
                    className="w-4 h-4" 
                    isActive={isActive(item.path)}
                  />
                </div>
                {showLabels && (
                  <span className="text-[#cccccc] text-sm">{item.label}</span>
                )}
              </Link>
            </TooltipPortal>
          ))}
        </div>

        {/* Department Advanced Features */}
        <div className="my-4 mx-6 border-t border-[#3e3e42]" />
        <div className="space-y-1 px-3">
          {departmentItems.map((item) => (
            <TooltipPortal key={item.path} title={item.label} description={item.description}>
              <Link
                to={item.path}
                onMouseEnter={() => {
                  if (!auth?.accessToken) return;
                  if (!getFlag('ROUTE_PREFETCH', true)) return;
                  prefetchRoute(item.path, { delayMs: 120 }).catch(() => {});
                  prefetchDataForRoute(item.path).catch(() => {});
                }}
                onFocus={() => {
                  if (!auth?.accessToken) return;
                  if (!getFlag('ROUTE_PREFETCH', true)) return;
                  prefetchRoute(item.path, { delayMs: 120 }).catch(() => {});
                  prefetchDataForRoute(item.path).catch(() => {});
                }}
                onClick={(e) => {
                  const enableVT = getFlag('VIEW_TRANSITIONS', false) && supportsViewTransitions();
                  setPendingPath(item.path);
                  if (!enableVT) {
                    const hit = wasPrefetched(item.path);
                    trackPerformanceEvent('prefetch.chunk.click', hit ? 1 : 0, 'count', { path: item.path, status: hit ? 'hit' : 'miss' });
                    return;
                  }
                  e.preventDefault();
                  const hit = wasPrefetched(item.path);
                  trackPerformanceEvent('prefetch.chunk.click', hit ? 1 : 0, 'count', { path: item.path, status: hit ? 'hit' : 'miss' });
                  startViewTransition(() => navigate(item.path)).catch(() => navigate(item.path));
                }}
                aria-current={isActive(item.path) ? 'page' : undefined}
                aria-label={!showLabels ? item.label : undefined}
                className={`
                  group flex items-center rounded-md text-sm transition-all duration-200 px-3 py-2.5 ${linkLayoutClass}
                  ${isActive(item.path) 
                    ? 'bg-[#007acc]/10 border-r-2 border-[#007acc] text-[#007acc]' 
                    : 'text-[#969696] hover:text-[#cccccc] hover:bg-[#3e3e42]/50'
                  }
                `}
              >
                <div className="flex-shrink-0">
                  <IconComponent 
                    type={item.icon} 
                    className="w-4 h-4" 
                    isActive={isActive(item.path)}
                  />
                </div>
                {showLabels && (
                  <span className="text-[#cccccc] text-sm">{item.label}</span>
                )}
              </Link>
            </TooltipPortal>
          ))}
        </div>

        {/* System Items */}
        <div className="my-4 mx-6 border-t border-[#3e3e42]" />
        <div className="space-y-1 px-3">
          {systemItems.map((item) => (
            <TooltipPortal key={item.path} title={item.label} description={item.description}>
              <Link
                to={item.path}
                aria-label={!showLabels ? item.label : undefined}
                className={`
                  group flex items-center rounded-md text-sm transition-all duration-200 px-3 py-2.5 ${linkLayoutClass}
                  ${isActive(item.path) 
                    ? 'bg-[#007acc]/10 border-r-2 border-[#007acc] text-[#007acc]' 
                    : 'text-[#969696] hover:text-[#cccccc] hover:bg-[#3e3e42]/50'
                  }
                `}
              >
                <div className="flex-shrink-0">
                  <IconComponent 
                    type={item.icon} 
                    className="w-4 h-4" 
                    isActive={isActive(item.path)}
                  />
                </div>
                {showLabels && (
                  <span className="text-[#cccccc] text-sm">{item.label}</span>
                )}
              </Link>
            </TooltipPortal>
          ))}
        </div>
      </nav>
      </div>

      {/* Bottom Section (pinned) */}
      <div className="px-3 space-y-1 py-4 border-t border-[#3e3e42] flex-shrink-0">
        {/* User Profile */}
        <TooltipPortal title="User Profile" description="Account settings">
          <Link
            to="/profile"
            onMouseEnter={() => {
              if (!auth?.accessToken) return;
              if (!getFlag('ROUTE_PREFETCH', true)) return;
              prefetchRoute('/profile', { delayMs: 120 }).catch(() => {});
              prefetchDataForRoute('/profile').catch(() => {});
            }}
            onFocus={() => {
              if (!auth?.accessToken) return;
              if (!getFlag('ROUTE_PREFETCH', true)) return;
              prefetchRoute('/profile', { delayMs: 120 }).catch(() => {});
              prefetchDataForRoute('/profile').catch(() => {});
            }}
            onClick={(e) => {
              const enableVT = getFlag('VIEW_TRANSITIONS', false) && supportsViewTransitions();
              setPendingPath('/profile');
              if (!enableVT) {
                const hit = wasPrefetched('/profile');
                trackPerformanceEvent('prefetch.chunk.click', hit ? 1 : 0, 'count', { path: '/profile', status: hit ? 'hit' : 'miss' });
                return;
              }
              e.preventDefault();
              const hit = wasPrefetched('/profile');
              trackPerformanceEvent('prefetch.chunk.click', hit ? 1 : 0, 'count', { path: '/profile', status: hit ? 'hit' : 'miss' });
              startViewTransition(() => navigate('/profile')).catch(() => navigate('/profile'));
            }}
            aria-current={isActive('/profile') ? 'page' : undefined}
            aria-label={!showLabels ? 'Profile' : undefined}
            className={`flex items-center rounded-md hover:bg-[#3e3e42]/50 cursor-pointer transition-colors px-3 py-2.5 ${linkLayoutClass}`}
          >
            <div className="w-6 h-6 bg-[#007acc] rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            {showLabels && (
              <span className="text-[#cccccc] text-sm">Profile</span>
            )}
          </Link>
        </TooltipPortal>

        {/* Help */}
        <TooltipPortal title="Help & Support" description="Documentation and assistance">
          <Link
            to="/help"
            onMouseEnter={() => {
              if (!auth?.accessToken) return;
              if (!getFlag('ROUTE_PREFETCH', true)) return;
              prefetchRoute('/help', { delayMs: 120 }).catch(() => {});
              prefetchDataForRoute('/help').catch(() => {});
            }}
            onFocus={() => {
              if (!auth?.accessToken) return;
              if (!getFlag('ROUTE_PREFETCH', true)) return;
              prefetchRoute('/help', { delayMs: 120 }).catch(() => {});
              prefetchDataForRoute('/help').catch(() => {});
            }}
            onClick={(e) => {
              const enableVT = getFlag('VIEW_TRANSITIONS', false) && supportsViewTransitions();
              setPendingPath('/help');
              if (!enableVT) {
                const hit = wasPrefetched('/help');
                trackPerformanceEvent('prefetch.chunk.click', hit ? 1 : 0, 'count', { path: '/help', status: hit ? 'hit' : 'miss' });
                return;
              }
              e.preventDefault();
              const hit = wasPrefetched('/help');
              trackPerformanceEvent('prefetch.chunk.click', hit ? 1 : 0, 'count', { path: '/help', status: hit ? 'hit' : 'miss' });
              startViewTransition(() => navigate('/help')).catch(() => navigate('/help'));
            }}
            aria-current={isActive('/help') ? 'page' : undefined}
            aria-label={!showLabels ? 'Help' : undefined}
            className={`flex items-center rounded-md text-[#969696] hover:text-[#cccccc] hover:bg-[#3e3e42]/50 transition-colors px-3 py-2.5 ${linkLayoutClass}`}
          >
            <div className="flex-shrink-0">
              <IconComponent type="help" className="w-4 h-4" />
            </div>
            {showLabels && (
              <span className="text-[#cccccc] text-sm">Help</span>
            )}
          </Link>
        </TooltipPortal>
      </div>
    </div>
  );
};

export default Sidebar;

