/**
 * Main App component with routing
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from '@/lib/queryClient';
import Dashboard from './pages/Dashboard';
import { PeopleList, PersonForm } from './pages/People';
import { AssignmentList, AssignmentForm, AssignmentGrid } from './pages/Assignments';
import { DepartmentsList, ManagerDashboard, HierarchyView, ReportsView } from './pages/Departments';
import Projects from './pages/Projects';
import ProjectForm from './pages/Projects/ProjectForm';
import { SkillsDashboard } from './pages/Skills';

// Enable VSCode-style dark theme globally
document.documentElement.classList.add('dark');

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router future={{ 
        v7_relativeSplatPath: true,
        v7_startTransition: true 
      }}>
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
          {/* More routes will be added in later chunks */}
        </Routes>
      </Router>
      {/* React Query DevTools for development */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App;