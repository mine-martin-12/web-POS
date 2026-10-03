import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Enums, Tables } from "@/integrations/supabase/types";
import { getErrorMessage } from "@/lib/errors";

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

interface AuthContextValue {
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

const AuthContext = createContext<AuthContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};

/** Supabase can emit the same event twice in quick succession (e.g. INITIAL_SESSION and
 * SIGNED_IN on load, or once per tab); identical events within this window are ignored. */
const DUPLICATE_EVENT_WINDOW_MS = 100;

function isRecoveryUrl(): boolean {
  const hash = new URLSearchParams(window.location.hash.substring(1));
  const query = new URLSearchParams(window.location.search);
  return (hash.get("type") ?? query.get("type")) === "recovery";
}

interface LoadedAccount {
  profile: Profile;
  business: Business | null;
  role: AppRole | null;
}

/** Profile columns, listed so the query only asks for what clients are granted. */
const PROFILE_COLUMNS =
  "id, user_id, business_id, email, first_name, last_name, is_active, deactivated_at, created_at, updated_at";

/** Profile, business and role in one round trip. */
async function loadAccount(userId: string): Promise<LoadedAccount | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(`${PROFILE_COLUMNS}, businesses(*), user_roles(role)`)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { businesses, user_roles, ...profile } = data;
  // PostgREST returns one-to-one embeds as an object; older versions return an array.
  const roleRow = Array.isArray(user_roles) ? user_roles[0] : user_roles;
  return {
    profile,
    business: (Array.isArray(businesses) ? businesses[0] : businesses) ?? null,
    role: roleRow?.role ?? null,
  };
}

/** Turn Supabase auth errors into something a shop owner can act on. */
function friendlyAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return "Incorrect email or password.";
  if (/email not confirmed/i.test(message)) return "Please confirm your email address first.";
  if (/already registered|already been registered/i.test(message)) return "This email is already registered. Sign in instead.";
  if (/database error saving new user/i.test(message)) return "We couldn't create your account. The business name may already be taken.";
  if (/rate limit/i.test(message)) return "Too many attempts. Please wait a minute and try again.";
  return message;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<LoadedAccount | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingRole, setIsLoadingRole] = useState(false);
  const [isRecoveryMode, setIsRecoveryMode] = useState(isRecoveryUrl);

  const lastEvent = useRef<{ key: string; at: number } | null>(null);
  const loadedFor = useRef<string | null>(null);

  const applyUser = useCallback(async (user: User | null, force = false) => {
    if (!user) {
      loadedFor.current = null;
      setAccount(null);
      setIsLoadingRole(false);
      return;
    }
    if (!force && loadedFor.current === user.id) return;
    loadedFor.current = user.id;
    setIsLoadingRole(true);
    try {
      const loaded = await loadAccount(user.id);
      if (loadedFor.current !== user.id) return; // a newer sign-in/out won the race
      if (!loaded || !loaded.profile.is_active) {
        loadedFor.current = null;
        setAccount(null);
        await supabase.auth.signOut();
        toast.error("Access denied", {
          description: loaded
            ? "Your account has been deactivated. Please contact your administrator."
            : "Your account is not linked to a business. Please contact your administrator.",
        });
        return;
      }
      setAccount(loaded);
    } catch (error) {
      loadedFor.current = null;
      toast.error("Couldn't load your account", { description: getErrorMessage(error) });
    } finally {
      setIsLoadingRole(false);
    }
  }, []);

  useEffect(() => {
    // Subscribe BEFORE reading the current session so no event is missed in between.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, next: Session | null) => {
      const key = `${event}:${next?.access_token ?? ""}`;
      const now = Date.now();
      if (lastEvent.current && lastEvent.current.key === key && now - lastEvent.current.at < DUPLICATE_EVENT_WINDOW_MS) {
        return;
      }
      lastEvent.current = { key, at: now };

      if (event === "PASSWORD_RECOVERY") setIsRecoveryMode(true);
      // Recovery ends once the new password is saved (or the user signs out).
      if (event === "SIGNED_OUT" || event === "USER_UPDATED") setIsRecoveryMode(false);
      setSession(next);
      // Never await Supabase calls inside this callback (it holds the auth lock).
      setTimeout(() => {
        void applyUser(next?.user ?? null, event === "USER_UPDATED");
      }, 0);
    });

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        setSession(data.session);
        await applyUser(data.session?.user ?? null);
      })
      .finally(() => setIsLoading(false));

    return () => subscription.unsubscribe();
  }, [applyUser]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) return { error: friendlyAuthError(error.message) };
    return { error: null };
  }, []);

  const signUpBusiness = useCallback(async (input: SignUpBusinessInput) => {
    const businessName = input.businessName.trim();
    const { data: available, error: checkError } = await supabase.rpc("is_business_name_available", {
      _name: businessName,
    });
    if (checkError) return { error: getErrorMessage(checkError) };
    if (!available) return { error: `A business called "${businessName}" already exists. Please choose another name.` };

    const { error } = await supabase.auth.signUp({
      email: input.email.trim().toLowerCase(),
      password: input.password,
      options: {
        emailRedirectTo: `${window.location.origin}/app`,
        // The server only reads these to name the new business and profile; role and
        // business are decided by the database, never by the client.
        data: {
          first_name: input.firstName.trim(),
          last_name: input.lastName.trim(),
          business_name: businessName,
        },
      },
    });
    if (error) return { error: friendlyAuthError(error.message) };
    return { error: null };
  }, []);

  const signOut = useCallback(async (options?: { silent?: boolean }) => {
    const { error } = await supabase.auth.signOut();
    loadedFor.current = null;
    setAccount(null);
    setSession(null);
    if (error) {
      toast.error("Error signing out", { description: error.message });
    } else if (!options?.silent) {
      toast.success("Signed out");
    }
  }, []);

  const refresh = useCallback(async () => {
    await applyUser(session?.user ?? null, true);
  }, [applyUser, session?.user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      profile: account?.profile ?? null,
      business: account?.business ?? null,
      role: account?.role ?? null,
      isLoading,
      isLoadingRole,
      isRecoveryMode,
      signIn,
      signUpBusiness,
      signOut,
      refresh,
    }),
    [session, account, isLoading, isLoadingRole, isRecoveryMode, signIn, signUpBusiness, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
