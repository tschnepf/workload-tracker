/**
 * Main App component with routing
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import { PeopleList, PersonForm } from './pages/People';
import { AssignmentList, AssignmentForm, AssignmentGrid } from './pages/Assignments';
import AssignmentGridMockup from './components/mockup/AssignmentGridMockup';

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
        <Route path="/assignments" element={<AssignmentGrid />} />
        <Route path="/assignments/list" element={<AssignmentList />} />
        <Route path="/assignments/new" element={<AssignmentForm />} />
        <Route path="/assignments/:id/edit" element={<AssignmentForm />} />
        <Route path="/mockup" element={<AssignmentGridMockup />} />
        {/* More routes will be added in later chunks */}
      </Routes>
    </Router>
  );
}

export default App;