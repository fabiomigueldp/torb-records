// frontend/src/components/ProtectedRoute.tsx
import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  isAdminRoute?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ isAdminRoute }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>; // Or a spinner component
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (isAdminRoute && !user.is_admin) {
    return <Navigate to="/library" replace />; // Or an unauthorized page
  }

  return <Outlet />;
};

export default ProtectedRoute;
