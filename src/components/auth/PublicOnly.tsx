import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { APP_HOME } from "@/config/routes";

/** Public marketing pages send a signed-in user straight into the app. */
export function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, profile, isRecoveryMode } = useAuth();
  if (isRecoveryMode) return <Navigate to="/reset-password" replace />;
  if (user && profile) return <Navigate to={APP_HOME} replace />;
  return <>{children}</>;
}
