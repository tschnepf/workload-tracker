import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { initializePerformanceMonitoring } from './utils/monitoring'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router'
import App from './App'
import { RequireAuth } from '@/components/auth/RequireAuth'
 
import Loader from '@/components/ui/Loader'
import { useAuth } from '@/hooks/useAuth'
// Initialize ETag enhancements for assignments bulk updates
import '@/services/etagEnhancer'

// Lazy route components (kept near router for clarity)
const Dashboard = React.lazy(() => import('./pages/Dashboard'))
const PeopleList = React.lazy(() => import('./pages/People').then(m => ({ default: m.PeopleList })))
const PersonForm = React.lazy(() => import('./pages/People').then(m => ({ default: m.PersonForm })))
const AssignmentList = React.lazy(() => import('./pages/Assignments').then(m => ({ default: m.AssignmentList })))
const AssignmentForm = React.lazy(() => import('./pages/Assignments').then(m => ({ default: m.AssignmentForm })))
const AssignmentGrid = React.lazy(() => import('./pages/Assignments').then(m => ({ default: m.AssignmentGrid })))
const ProjectAssignmentsGrid = React.lazy(() => import('./pages/Assignments').then(m => ({ default: m.ProjectAssignmentsGrid })))
const DepartmentsList = React.lazy(() => import('./pages/Departments').then(m => ({ default: m.DepartmentsList })))
const ManagerDashboard = React.lazy(() => import('./pages/Departments').then(m => ({ default: m.ManagerDashboard })))
const HierarchyView = React.lazy(() => import('./pages/Departments').then(m => ({ default: m.HierarchyView })))
const ReportsView = React.lazy(() => import('./pages/Departments').then(m => ({ default: m.ReportsView })))
const Projects = React.lazy(() => import('./pages/Projects'))
const ProjectForm = React.lazy(() => import('./pages/Projects/ProjectForm'))
const SkillsDashboard = React.lazy(() => import('./pages/Skills').then(m => ({ default: m.SkillsDashboard })))
const PerformanceDashboard = React.lazy(() => import('./pages/Performance/PerformanceDashboard'))
const Settings = React.lazy(() => import('./pages/Settings/Settings'))
const MilestoneCalendar = React.lazy(() => import('./pages/Deliverables/Calendar'))
const TeamForecastPage = React.lazy(() => import('./pages/Reports/TeamForecast'))
const Login = React.lazy(() => import('./pages/Auth/Login'))
const Profile = React.lazy(() => import('./pages/Profile/Profile'))
const ComingSoon = React.lazy(() => import('./pages/ComingSoon/ComingSoon'))

// Initialize performance monitoring
initializePerformanceMonitoring()

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      // Public
      { path: 'login', element: <Login /> },
      // Redirect root to dashboard (protected)
      { index: true, element: <RequireAuth><Navigate to="/dashboard" replace /></RequireAuth> },

      // Protected routes
      { path: 'dashboard', element: <RequireAuth><Dashboard /></RequireAuth> },
      { path: 'profile', element: <RequireAuth><Profile /></RequireAuth> },
      { path: 'people', element: <RequireAuth><PeopleList /></RequireAuth> },
      { path: 'people/new', element: <RequireAuth><PersonForm /></RequireAuth> },
      { path: 'people/:id/edit', element: <RequireAuth><PersonForm /></RequireAuth> },
      { path: 'departments', element: <RequireAuth><DepartmentsList /></RequireAuth> },
      { path: 'departments/manager', element: <RequireAuth><ManagerDashboard /></RequireAuth> },
      { path: 'departments/hierarchy', element: <RequireAuth><HierarchyView /></RequireAuth> },
      { path: 'departments/reports', element: <RequireAuth><ReportsView /></RequireAuth> },
      { path: 'assignments', element: <RequireAuth><AssignmentGrid /></RequireAuth> },
      { path: 'project-assignments', element: <RequireAuth><ProjectAssignmentsGrid /></RequireAuth> },
      { path: 'assignments/list', element: <RequireAuth><AssignmentList /></RequireAuth> },
      { path: 'assignments/new', element: <RequireAuth><AssignmentForm /></RequireAuth> },
      { path: 'assignments/:id/edit', element: <RequireAuth><AssignmentForm /></RequireAuth> },
      { path: 'projects', element: <RequireAuth><Projects /></RequireAuth> },
      { path: 'projects/new', element: <RequireAuth><ProjectForm /></RequireAuth> },
      { path: 'projects/:id/edit', element: <RequireAuth><ProjectForm /></RequireAuth> },
      { path: 'skills', element: <RequireAuth><SkillsDashboard /></RequireAuth> },
      { path: 'performance', element: <RequireAuth><PerformanceDashboard /></RequireAuth> },
      { path: 'settings', element: <RequireAuth><Settings /></RequireAuth> },
      { path: 'deliverables/calendar', element: <RequireAuth><MilestoneCalendar /></RequireAuth> },
      { path: 'reports/forecast', element: <RequireAuth><TeamForecastPage /></RequireAuth> },
      { path: 'help', element: <RequireAuth><ComingSoon /></RequireAuth> },
    ],
  },
])


function RootApp() {
  const auth = useAuth();
  if (auth.hydrating) {
    return <Loader full message="Loading..." />;
  }
  return <RouterProvider router={router} />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootApp />
  </React.StrictMode>,
)



