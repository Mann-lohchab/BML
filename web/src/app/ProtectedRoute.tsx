import { Navigate, Outlet, useLocation } from 'react-router';
import { Brand, LoadingState } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="app-loading">
        <Brand />
        <LoadingState label="Opening BML operations" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
