import React from "react";
import { SupabaseAuthProvider } from "./SupabaseAuthProvider";

// eslint-disable-next-line react-refresh/only-export-components
export { useAuth } from "./auth-context";
export type { AppRole, AuthContextValue, Business, Profile, SignUpBusinessInput } from "./auth-context";

/** Real Supabase sign-in, or (in demo mode) the demo's signed-in user. */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <SupabaseAuthProvider>{children}</SupabaseAuthProvider>
);
