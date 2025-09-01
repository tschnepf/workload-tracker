import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Main App component with routing and code splitting
 */
import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from '@/lib/queryClient';
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
const PageLoader = () => (_jsx("div", { className: "flex items-center justify-center min-h-screen bg-[#1e1e1e]", children: _jsxs("div", { className: "flex flex-col items-center space-y-4", children: [_jsx("div", { className: "animate-spin rounded-full h-12 w-12 border-b-2 border-[#007acc]" }), _jsx("div", { className: "text-[#cccccc] text-lg", children: "Loading..." })] }) }));
// Error boundary for lazy-loaded components
class LazyLoadErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError() {
        return { hasError: true };
    }
    render() {
        if (this.state.hasError) {
            return (_jsx("div", { className: "flex items-center justify-center min-h-screen bg-[#1e1e1e]", children: _jsxs("div", { className: "text-center", children: [_jsx("div", { className: "text-red-400 text-xl mb-2", children: "Something went wrong" }), _jsx("div", { className: "text-[#969696] mb-4", children: "Failed to load page component" }), _jsx("button", { onClick: () => window.location.reload(), className: "bg-[#007acc] hover:bg-[#005a99] text-white px-4 py-2 rounded", children: "Reload Page" })] }) }));
        }
        return this.props.children;
    }
}
// Enable VSCode-style dark theme globally
document.documentElement.classList.add('dark');
function App() {
    return (_jsxs(QueryClientProvider, { client: queryClient, children: [_jsx(Router, { future: {
                    v7_relativeSplatPath: true,
                    v7_startTransition: true
                }, children: _jsx(LazyLoadErrorBoundary, { children: _jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(Navigate, { to: "/dashboard", replace: true }) }), _jsx(Route, { path: "/dashboard", element: _jsx(Dashboard, {}) }), _jsx(Route, { path: "/people", element: _jsx(PeopleList, {}) }), _jsx(Route, { path: "/people/new", element: _jsx(PersonForm, {}) }), _jsx(Route, { path: "/people/:id/edit", element: _jsx(PersonForm, {}) }), _jsx(Route, { path: "/departments", element: _jsx(DepartmentsList, {}) }), _jsx(Route, { path: "/departments/manager", element: _jsx(ManagerDashboard, {}) }), _jsx(Route, { path: "/departments/hierarchy", element: _jsx(HierarchyView, {}) }), _jsx(Route, { path: "/departments/reports", element: _jsx(ReportsView, {}) }), _jsx(Route, { path: "/assignments", element: _jsx(AssignmentGrid, {}) }), _jsx(Route, { path: "/assignments/list", element: _jsx(AssignmentList, {}) }), _jsx(Route, { path: "/assignments/new", element: _jsx(AssignmentForm, {}) }), _jsx(Route, { path: "/assignments/:id/edit", element: _jsx(AssignmentForm, {}) }), _jsx(Route, { path: "/projects", element: _jsx(Projects, {}) }), _jsx(Route, { path: "/projects/new", element: _jsx(ProjectForm, {}) }), _jsx(Route, { path: "/projects/:id/edit", element: _jsx(ProjectForm, {}) }), _jsx(Route, { path: "/skills", element: _jsx(SkillsDashboard, {}) }), _jsx(Route, { path: "/performance", element: _jsx(PerformanceDashboard, {}) }), _jsx(Route, { path: "/settings", element: _jsx(Settings, {}) })] }) }) }) }), _jsx(ReactQueryDevtools, { initialIsOpen: false })] }));
}
export default App;
