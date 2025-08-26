/**
 * Main App component with routing
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import { PeopleList, PersonForm } from './pages/People';

// Enable dark mode globally
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
        {/* More routes will be added in later chunks */}
      </Routes>
    </Router>
  );
}

export default App;