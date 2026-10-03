import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { capabilitiesFor, type CapabilitySet } from "@/lib/permissions";

export interface Security extends CapabilitySet {
  isAdmin: boolean;
  isUser: boolean;
  /** While true, render neither admin nor staff-only UI (avoids flashing admin controls). */
  isLoadingRole: boolean;
}

export function useSecurity(): Security {
  const { role, isLoading, isLoadingRole } = useAuth();
  const loading = isLoading || isLoadingRole;
  return useMemo(
    () => ({
      ...capabilitiesFor(loading ? null : role),
      isAdmin: !loading && role === "admin",
      isUser: !loading && role === "user",
      isLoadingRole: loading,
    }),
    [role, loading],
  );
}
