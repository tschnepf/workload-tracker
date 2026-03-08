import React from 'react';
import { Navigate, useLocation } from 'react-router';
import Loader from '@/components/ui/Loader';
import { useAuth } from '@/hooks/useAuth';
import { isAdminOrManager } from '@/utils/roleAccess';

type RequireAdminOrManagerProps = {
  children: React.ReactNode;
  redirectTo?: string;
};

export const RequireAdminOrManager: React.FC<RequireAdminOrManagerProps> = ({ children, redirectTo = '/dashboard' }) => {
  const auth = useAuth();
  const location = useLocation();

  if (auth.hydrating) return <Loader message="Loading..." />;

  if (!auth.accessToken) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!isAdminOrManager(auth.user)) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
};
