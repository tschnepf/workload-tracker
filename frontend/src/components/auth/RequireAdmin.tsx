import React from 'react';
import { Navigate, useLocation } from 'react-router';
import Loader from '@/components/ui/Loader';
import { useAuth } from '@/hooks/useAuth';
import { isAdminUser } from '@/utils/roleAccess';

export const RequireAdmin: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const auth = useAuth();
  const location = useLocation();

  if (auth.hydrating) return <Loader message="Loading..." />;

  // If no access token after hydration, redirect to login
  if (!auth.accessToken) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!isAdminUser(auth.user)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};
