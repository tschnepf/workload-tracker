import React from 'react';
import { Navigate, useLocation } from 'react-router';
import Loader from '@/components/ui/Loader';
import { useAuth } from '@/hooks/useAuth';
import { isAdminOrManager } from '@/utils/roleAccess';

export const RequireAdminOrManager: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const auth = useAuth();
  const location = useLocation();

  if (auth.hydrating) return <Loader message="Loading..." />;

  if (!auth.accessToken) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!isAdminOrManager(auth.user)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

