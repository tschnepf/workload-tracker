/**
 * Production Sidebar Component - Always collapsed with hover tooltips
 * Extracted from working mockup and cleaned for production use
 */

import React from 'react';
import { Link, useLocation, useNavigate, useNavigation } from 'react-router';
import TooltipPortal from '@/components/ui/TooltipPortal';
import { useAuth } from '@/hooks/useAuth';
import { logout as performLogout } from '@/store/auth';
import { getFlag } from '@/lib/flags';
import { prefetchRoute, wasPrefetched } from '@/routes/prefetch';
import { prefetchDataForRoute } from '@/routes/prefetchData';
import { startViewTransition, supportsViewTransitions } from '@/utils/viewTransitions';
import { trackPerformanceEvent } from '@/utils/monitoring';
import { setPendingPath, useNavFeedback } from '@/lib/navFeedback';
import { isAdminUser } from '@/utils/roleAccess';

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
    case 'my-work':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="7" height="7" rx="2"/>
          <rect x="3" y="13" width="7" height="7" rx="2"/>
          <circle cx="17" cy="9" r="3.25"/>
          <path d="M12.5 20a4.75 4.75 0 0 1 9.5 0"/>
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
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="9" r="3"/>
          <path d="M2 19a4 4 0 0 1 8 0"/>
          <rect x="11" y="4" width="10" height="14" rx="2"/>
          <circle cx="13.5" cy="8" r="1.1" fill={iconColor} stroke="none"/>
          <line x1="15.5" y1="8" x2="18.5" y2="8"/>
          <circle cx="13.5" cy="11" r="1.1" fill={iconColor} stroke="none"/>
          <line x1="15.5" y1="11" x2="18.5" y2="11"/>
          <circle cx="13.5" cy="14" r="1.1" fill={iconColor} stroke="none"/>
          <line x1="15.5" y1="14" x2="18.5" y2="14"/>
          <line x1="9" y1="11" x2="11" y2="11"/>
          <path d="M10 9.5 11.5 11 10 12.5"/>
        </svg>
      );
    case 'project-assignments':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="10" height="14" rx="2"/>
          <circle cx="6" cy="8" r="1.1" fill={iconColor} stroke="none"/>
          <line x1="8" y1="8" x2="11" y2="8"/>
          <circle cx="6" cy="11" r="1.1" fill={iconColor} stroke="none"/>
          <line x1="8" y1="11" x2="11" y2="11"/>
          <circle cx="6" cy="14" r="1.1" fill={iconColor} stroke="none"/>
          <line x1="8" y1="14" x2="11" y2="14"/>
          <circle cx="18" cy="9" r="3"/>
          <path d="M14 19a4 4 0 0 1 8 0"/>
          <path d="M12.5 11h4"/>
          <path d="M15.5 9.5 17 11l-1.5 1.5"/>
        </svg>
      );
    case 'departments':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="9" width="5" height="10" rx="1"/>
          <rect x="9.5" y="6" width="5" height="13" rx="1"/>
          <rect x="16" y="9" width="5" height="10" rx="1"/>
          <line x1="5" y1="12" x2="6" y2="12"/>
          <line x1="5" y1="14.5" x2="6" y2="14.5"/>
          <line x1="11" y1="9.5" x2="12" y2="9.5"/>
          <line x1="13" y1="9.5" x2="14" y2="9.5"/>
          <line x1="11" y1="12" x2="12" y2="12"/>
          <line x1="13" y1="12" x2="14" y2="12"/>
          <line x1="11" y1="14.5" x2="12" y2="14.5"/>
          <line x1="13" y1="14.5" x2="14" y2="14.5"/>
          <line x1="18" y1="12" x2="19" y2="12"/>
          <line x1="18" y1="14.5" x2="19" y2="14.5"/>
        </svg>
      );
    case 'projects':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="5" width="14" height="16" rx="2"/>
          <rect x="8" y="2" width="8" height="4" rx="2"/>
          <circle cx="10" cy="10" r="1.25" fill={iconColor} stroke="none"/>
          <line x1="12.5" y1="10" x2="16.5" y2="10"/>
          <circle cx="10" cy="14" r="1.25" fill={iconColor} stroke="none"/>
          <line x1="12.5" y1="14" x2="16.5" y2="14"/>
          <circle cx="10" cy="18" r="1.25" fill={iconColor} stroke="none"/>
          <line x1="12.5" y1="18" x2="16.5" y2="18"/>
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
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="8"/>
          <circle cx="12" cy="12" r="4"/>
          <circle cx="12" cy="12" r="1.2" fill={iconColor} stroke="none"/>
          <line x1="18.5" y1="6" x2="13.5" y2="11"/>
          <polygon points="19.3,5.2 20.8,6.7 18.7,7" fill={iconColor} stroke="none"/>
          <line x1="20.5" y1="12.5" x2="13.5" y2="12.5"/>
          <polygon points="21.2,11.8 21.2,13.2 19.5,12.5" fill={iconColor} stroke="none"/>
          <line x1="18.8" y1="18.5" x2="13.2" y2="13.5"/>
          <polygon points="19.6,18.9 18.1,20.4 17.7,18.3" fill={iconColor} stroke="none"/>
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
  const isAdmin = isAdminUser(auth.user);
  const [logoError, setLogoError] = React.useState(false);

  const primaryItems = [
    ...(getFlag('PERSONAL_DASHBOARD', true) ? [{
      path: '/my-work',
      icon: 'my-work',
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
      path: '/deliverables/calendar', 
      icon: 'calendar', 
      label: 'Calendar',
      description: 'Milestone schedule'
    }
  ];

  const workloadItems = [
    { 
      path: '/projects', 
      icon: 'projects', 
      label: 'Projects',
      description: 'Project tracking'
    },
    { 
      path: '/assignments', 
      icon: 'assignments', 
      label: 'Assignments',
      description: 'Workload allocation'
    },
    { 
      path: '/project-assignments', 
      icon: 'project-assignments', 
      label: 'Project Assignments',
      description: 'Projects grouped with assigned people'
    }
  ];

  const orgItems = [
    { 
      path: '/departments', 
      icon: 'departments', 
      label: 'Departments',
      description: 'Organization structure'
    },
    { 
      path: '/people', 
      icon: 'people', 
      label: 'People',
      description: 'Team management'
    },
    { 
      path: '/skills', 
      icon: 'skills', 
      label: 'Skills',
      description: 'Team skills analysis'
    }
  ];

  const settingsItems = [
    { 
      path: '/settings', 
      icon: 'settings', 
      label: 'Settings',
      description: 'System configuration'
    }
  ];

  const adminItems = isAdmin ? [
    {
      path: '/reports/forecast',
      icon: 'reports',
      label: 'Forecast',
      description: 'Team forecast & timeline'
    },
    {
      path: '/reports/person-experience',
      icon: 'reports',
      label: 'Person Experience',
      description: 'Per-person projects & hours'
    },
  ] : [];

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

  const extraItems = [
    ...adminItems,
    ...departmentItems,
    ...systemItems
  ];

  const pendingPath = (nav as any)?.location?.pathname as string | undefined;
  const isActive = (path: string) => {
    if (location.pathname === path || location.pathname.startsWith(path + '/')) return true;
    if (pendingPath && (pendingPath === path || pendingPath.startsWith(path + '/'))) return true;
    if (localPendingPath && (localPendingPath === path || localPendingPath.startsWith(path + '/'))) return true;
    return false;
  };

  const widthClass = showLabels ? 'w-64' : 'w-16';
  const linkLayoutClass = showLabels ? 'justify-start gap-3 w-full' : 'justify-center';

  const renderNavItems = (items: Array<{ path: string; icon: string; label: string; description?: string }>) => (
    items.map((item) => (
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
              ? 'bg-[var(--primary)]/10 border-r-2 border-[var(--primary)] text-[var(--primary)]' 
              : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]'
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
            <span className="text-[var(--text)] text-sm">{item.label}</span>
          )}
        </Link>
      </TooltipPortal>
    ))
  );

  return (
    <div className={`bg-[var(--surface)] border-r border-[var(--border)] flex-shrink-0 ${widthClass} h-screen flex flex-col z-10`}>

      {/* Header */}
      <div className="h-16 flex items-center relative flex-shrink-0">
        <TooltipPortal title="Workload Tracker" description="Resource Management System">
          {/* Match nav icon alignment: center within px-3 gutter */}
          <div className="w-full h-full flex items-center">
            <div className="w-full px-3 flex items-center justify-center">
              {!logoError ? (
                <img
                  src="/brand/SMC-TRIANGLE.png"
                  alt="Brand"
                  className="w-8 h-8 block object-contain mx-auto relative left-[3px]"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <div className="w-8 h-8 bg-[var(--primary)] rounded flex items-center justify-center mx-auto relative left-[3px]">
                  <span className="text-white text-sm leading-8 font-bold">WT</span>
                </div>
              )}
            </div>
          </div>
        </TooltipPortal>
      </div>

      {/* Scrollable middle: Navigation Menu */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-theme">
      <nav className="py-4" role="navigation" aria-label="Primary">
        <div className="space-y-1 px-3">
          {renderNavItems(primaryItems)}
        </div>

        <div className="my-4 mx-6 border-t border-[var(--border)]" />
        <div className="space-y-1 px-3">
          {renderNavItems(workloadItems)}
        </div>

        <div className="my-4 mx-6 border-t border-[var(--border)]" />
        <div className="space-y-1 px-3">
          {renderNavItems(orgItems)}
        </div>

        <div className="my-4 mx-6 border-t border-[var(--border)]" />
        <div className="space-y-1 px-3">
          {renderNavItems(settingsItems)}
        </div>

        <div className="my-4 mx-6 border-t border-[var(--border)]" />
        <div className="space-y-1 px-3">
          {renderNavItems(extraItems)}
        </div>
      </nav>
      </div>

      {/* Bottom Section (pinned) */}
      <div className="px-3 space-y-1 py-4 border-t border-[var(--border)] flex-shrink-0">
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
            className={`flex items-center rounded-md hover:bg-[var(--surfaceHover)] cursor-pointer transition-colors px-3 py-2.5 ${linkLayoutClass}`}
          >
            <div className="w-6 h-6 bg-[var(--primary)] rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            {showLabels && (
              <span className="text-[var(--text)] text-sm">Profile</span>
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
            className={`flex items-center rounded-md text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)] transition-colors px-3 py-2.5 ${linkLayoutClass}`}
          >
            <div className="flex-shrink-0">
              <IconComponent type="help" className="w-4 h-4" />
            </div>
            {showLabels && (
              <span className="text-[var(--text)] text-sm">Help</span>
            )}
          </Link>
        </TooltipPortal>
      </div>
    </div>
  );
};

export default Sidebar;
