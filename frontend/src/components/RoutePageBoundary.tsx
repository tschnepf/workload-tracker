import React from 'react';
import { useLocation } from 'react-router';
import PageErrorBoundary from '@/components/PageErrorBoundary';

type Props = {
  children: React.ReactNode;
};

function pageNameFromPath(pathname: string): string {
  if (!pathname || pathname === '/') return 'Home';
  if (pathname.startsWith('/project-assignments')) return 'Project Assignments';
  if (pathname.startsWith('/assignments')) return 'Assignments';
  if (pathname.startsWith('/departments')) return 'Departments';
  if (pathname.startsWith('/deliverables')) return 'Deliverables';
  if (pathname.startsWith('/reports')) return 'Reports';
  const segment = pathname.replace(/^\//, '').split('/')[0] || 'Page';
  return segment
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const RoutePageBoundary: React.FC<Props> = ({ children }) => {
  const location = useLocation();
  return (
    <PageErrorBoundary key={location.pathname} pageName={pageNameFromPath(location.pathname)}>
      {children}
    </PageErrorBoundary>
  );
};

export default RoutePageBoundary;
