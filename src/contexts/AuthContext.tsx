import React from "react";
import { isDemoMode } from "@/data/mode";
import { getDemoUi } from "@/data/demoUi";
import { SupabaseAuthProvider } from "./SupabaseAuthProvider";

// eslint-disable-next-line react-refresh/only-export-components
export { useAuth } from "./auth-context";
export type { AppRole, AuthContextValue, Business, Profile, SignUpBusinessInput } from "./auth-context";

/** Real Supabase sign-in, or (in demo mode) the demo's signed-in member. */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const DemoAuthProvider = isDemoMode() ? getDemoUi()?.AuthProvider : undefined;
  if (DemoAuthProvider) return <DemoAuthProvider>{children}</DemoAuthProvider>;
  return <SupabaseAuthProvider>{children}</SupabaseAuthProvider>;
};
