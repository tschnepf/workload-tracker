/**
 * Main App component with routing
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import { PeopleList, PersonForm } from './pages/People';
import { AssignmentList, AssignmentForm, AssignmentGrid } from './pages/Assignments';
import { DepartmentsList, ManagerDashboard, HierarchyView, ReportsView } from './pages/Departments';
import Projects from './pages/Projects';
import ProjectForm from './pages/Projects/ProjectForm';
import AssignmentGridMockup from './components/mockup/AssignmentGridMockup';
import SidebarNavigationMockup from './components/mockup/SidebarNavigationMockup';
import ProjectsListMockup from './components/mockup/ProjectsListMockup';

// Enable VSCode-style dark theme globally
document.documentElement.classList.add('dark');

function App() {
  return (
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
        <Route path="/mockup" element={<AssignmentGridMockup />} />
        <Route path="/sidebar-mockup" element={<SidebarNavigationMockup />} />
        <Route path="/projects-mockup" element={<ProjectsListMockup />} />
        {/* More routes will be added in later chunks */}
      </Routes>
    </Router>
  );
}

export default App;