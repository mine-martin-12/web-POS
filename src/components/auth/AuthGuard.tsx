import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { BrandedSpinner } from "@/components/common/BrandedSpinner";

/** Protects signed-in areas: signed-out users go to /auth (and come back afterwards);
 *  a password-recovery session can only use the reset page. */
const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, isLoading, isLoadingRole, isRecoveryMode } = useAuth();
  const location = useLocation();

  if (isLoading || (user && isLoadingRole && !profile)) {
    return <BrandedSpinner fullScreen label="Loading your workspace…" />;
  }
  if (isRecoveryMode) return <Navigate to="/reset-password" replace />;
  if (!user || !profile) return <Navigate to="/auth" state={{ from: location }} replace />;

  return <>{children}</>;
};

export default AuthGuard;
