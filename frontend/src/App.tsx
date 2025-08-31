/**
 * Main App component with routing and code splitting
 */

import React, { Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from '@/lib/queryClient';
import { initializePerformanceMonitoring } from '@/utils/performanceMonitoring';

// Lazy-loaded route components for code splitting
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const PeopleList = React.lazy(() => import('./pages/People').then(module => ({ default: module.PeopleList })));
const PersonForm = React.lazy(() => import('./pages/People').then(module => ({ default: module.PersonForm })));
const AssignmentList = React.lazy(() => import('./pages/Assignments').then(module => ({ default: module.AssignmentList })));
const AssignmentForm = React.lazy(() => import('./pages/Assignments').then(module => ({ default: module.AssignmentForm })));
const AssignmentGrid = React.lazy(() => import('./pages/Assignments').then(module => ({ default: module.AssignmentGrid })));
const DepartmentsList = React.lazy(() => import('./pages/Departments').then(module => ({ default: module.DepartmentsList })));
const ManagerDashboard = React.lazy(() => import('./pages/Departments').then(module => ({ default: module.ManagerDashboard })));
const HierarchyView = React.lazy(() => import('./pages/Departments').then(module => ({ default: module.HierarchyView })));
const ReportsView = React.lazy(() => import('./pages/Departments').then(module => ({ default: module.ReportsView })));
const Projects = React.lazy(() => import('./pages/Projects'));
const ProjectForm = React.lazy(() => import('./pages/Projects/ProjectForm'));
const SkillsDashboard = React.lazy(() => import('./pages/Skills').then(module => ({ default: module.SkillsDashboard })));
const PerformanceDashboard = React.lazy(() => import('./pages/Performance/PerformanceDashboard'));
const Settings = React.lazy(() => import('./pages/Settings/Settings'));

// Loading component for Suspense fallback
const PageLoader: React.FC = () => (
  <div className="flex items-center justify-center min-h-screen bg-[#1e1e1e]">
    <div className="flex flex-col items-center space-y-4">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#007acc]"></div>
      <div className="text-[#cccccc] text-lg">Loading...</div>
    </div>
  </div>
);

// Error boundary for lazy-loaded components
class LazyLoadErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-[#1e1e1e]">
          <div className="text-center">
            <div className="text-red-400 text-xl mb-2">Something went wrong</div>
            <div className="text-[#969696] mb-4">Failed to load page component</div>
            <button 
              onClick={() => window.location.reload()} 
              className="bg-[#007acc] hover:bg-[#005a99] text-white px-4 py-2 rounded"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Enable VSCode-style dark theme globally
document.documentElement.classList.add('dark');

function App() {
  // Initialize performance monitoring on app load
  useEffect(() => {
    initializePerformanceMonitoring();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Router future={{ 
        v7_relativeSplatPath: true,
        v7_startTransition: true 
      }}>
        <LazyLoadErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/people" element={<PeopleList />} />
              <Route path="/people/new" element={<PersonForm />} />
              <Route path="/people/:id/edit" element={<PersonForm />} />
              <Route path="/departments" element={<DepartmentsList />} />
              <Route path="/departments/manager" element={<ManagerDashboard />} />
              <Route path="/departments/hierarchy" element={<HierarchyView />} />
              <Route path="/departments/reports" element={<ReportsView />} />
              <Route path="/assignments" element={<AssignmentGrid />} />
              <Route path="/assignments/list" element={<AssignmentList />} />
              <Route path="/assignments/new" element={<AssignmentForm />} />
              <Route path="/assignments/:id/edit" element={<AssignmentForm />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/projects/new" element={<ProjectForm />} />
              <Route path="/projects/:id/edit" element={<ProjectForm />} />
              <Route path="/skills" element={<SkillsDashboard />} />
              <Route path="/performance" element={<PerformanceDashboard />} />
              <Route path="/settings" element={<Settings />} />
              {/* More routes will be added in later chunks */}
            </Routes>
          </Suspense>
        </LazyLoadErrorBoundary>
      </Router>
      {/* React Query DevTools for development */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App;