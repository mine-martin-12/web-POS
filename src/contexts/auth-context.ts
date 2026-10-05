import { createContext, useContext } from "react";
import type { Session, User } from "@supabase/supabase-js";
import type { Enums, Tables } from "@/integrations/supabase/types";

export type AppRole = Enums<"app_role">;
export type Profile = Tables<"profiles">;
export type Business = Tables<"businesses">;

export interface SignUpBusinessInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  businessName: string;
}

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  business: Business | null;
  role: AppRole | null;
  /** True until the initial session has been resolved. */
  isLoading: boolean;
  /** True while the profile/business/role for the current user is being loaded. */
  isLoadingRole: boolean;
  /** True while the user arrived through a password-recovery link. */
  isRecoveryMode: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpBusiness: (input: SignUpBusinessInput) => Promise<{ error: string | null }>;
  signOut: (options?: { silent?: boolean }) => Promise<void>;
  refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};

