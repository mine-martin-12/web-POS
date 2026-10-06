import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AuthContext, type AppRole, type AuthContextValue, type Business, type Profile } from "@/contexts/auth-context";
import { asActor, maybeOne } from "../db/engine";
import { currentRole, exitDemo, resetDemo, switchRole as setDemoRole, type DemoRole } from "../session";

interface DemoAccount {
  profile: Profile;
  business: Business;
  role: AppRole;
}

/** Profile, business and role of the acting member, read through RLS like the real app. */
function loadAccount(): Promise<DemoAccount | null> {
  return asActor((tx) =>
    maybeOne<DemoAccount>(
      tx,
      `SELECT to_jsonb(p) AS profile, to_jsonb(b) AS business, ur.role
       FROM public.profiles p
       JOIN public.businesses b ON b.id = p.business_id
       JOIN public.user_roles ur ON ur.user_id = p.user_id AND ur.business_id = p.business_id
       WHERE p.user_id = auth.uid()`,
    ),
  );
}

interface DemoControls {
  role: DemoRole;
  switchRole: (role: DemoRole) => Promise<void>;
  reset: () => Promise<void>;
  exit: (to?: string) => Promise<void>;
}

const DemoContext = createContext<DemoControls | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useDemo(): DemoControls {
  const context = useContext(DemoContext);
  if (!context) throw new Error("useDemo must be used inside the demo");
  return context;
}

const NOT_IN_DEMO = { error: "You're using the demo. Exit the demo to sign in or create your own account." };

/**
 * Stands in for Supabase Auth in demo mode: a signed-in member of Demo Shop, switchable
 * between the admin and a staff member. No auth listener, session or token timers.
 */
export function DemoAuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<DemoRole>(currentRole);
  const [account, setAccount] = useState<DemoAccount | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const loaded = await loadAccount();
      if (loaded) {
        setAccount(loaded);
        return;
      }
      // Only a deactivated member can't load (RLS hides their business): go back to the admin.
      toast.error("That team member is deactivated", { description: "Reactivate them on the Staff page to try their view." });
      setDemoRole("admin");
      setRole("admin");
      setAccount(await loadAccount());
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, role]);

  const switchRole = useCallback(
    async (next: DemoRole) => {
      setDemoRole(next);
      setAccount(null);
      setRole(next);
      // Everything on screen was read as the previous member.
      queryClient.removeQueries();
    },
    [queryClient],
  );

  const reset = useCallback(async () => {
    await resetDemo();
    window.location.reload();
  }, []);

  const exit = useCallback(async (to = "/auth") => {
    await exitDemo();
    queryClient.clear();
    window.location.assign(to);
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(() => {
    const user = account
      ? ({
          id: account.profile.user_id,
          email: account.profile.email,
          aud: "authenticated",
          role: "authenticated",
          app_metadata: {},
          user_metadata: { first_name: account.profile.first_name, last_name: account.profile.last_name },
          created_at: account.profile.created_at,
          last_sign_in_at: new Date().toISOString(),
        } as User)
      : null;
    return {
      user,
      session: null,
      profile: account?.profile ?? null,
      business: account?.business ?? null,
      role: account?.role ?? null,
      isLoading: !account && !failed,
      isLoadingRole: !account && !failed,
      isRecoveryMode: false,
      signIn: async () => NOT_IN_DEMO,
      signUpBusiness: async () => NOT_IN_DEMO,
      signOut: () => exit(),
      refresh: load,
    };
  }, [account, failed, exit, load]);

  const controls = useMemo<DemoControls>(() => ({ role, switchRole, reset, exit }), [role, switchRole, reset, exit]);

  return (
    <DemoContext.Provider value={controls}>
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    </DemoContext.Provider>
  );
}
