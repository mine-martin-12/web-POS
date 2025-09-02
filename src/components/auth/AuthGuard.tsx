import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface AuthGuardProps {
  children: React.ReactNode;
}

const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  const { user, profile, isLoading, isRecoveryMode } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Allow access to reset password page during recovery mode
  if (isRecoveryMode && location.pathname === '/reset-password') {
    return <>{children}</>;
  }

  // Block access to protected routes during recovery mode
  if (isRecoveryMode && location.pathname !== '/reset-password') {
    return <Navigate to="/reset-password" replace />;
  }

  // Check if user exists but doesn't have a valid profile (only for non-recovery sessions)
  if (user && !profile && !isRecoveryMode) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (!user && !isRecoveryMode) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

export default AuthGuard;