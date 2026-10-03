import React from "react";
import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useSecurity } from "@/hooks/useSecurity";
import type { Capability } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface RoleBasedAccessProps {
  /** Require the admin role. */
  adminOnly?: boolean;
  /** Or require a specific capability from the permissions matrix. */
  capability?: Capability;
  /** What to show without access. Defaults to an "Admin privileges required" panel;
   *  pass `null` to render nothing (for inline controls). */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Shows children only to users with the required role or capability. Renders nothing
 * while the role is loading so admin UI never flashes for staff. This is UX only:
 * the database enforces the same rules.
 */
export function RoleBasedAccess({ adminOnly, capability, fallback, children }: RoleBasedAccessProps) {
  const security = useSecurity();

  if (security.isLoadingRole) {
    return fallback === null ? null : <Skeleton className="h-32 w-full" />;
  }
  const allowed = (!adminOnly || security.isAdmin) && (!capability || security[capability]);
  if (allowed) return <>{children}</>;
  return fallback === undefined ? <AdminRequired /> : <>{fallback}</>;
}

export function AdminRequired() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed p-10 text-center">
      <ShieldAlert className="h-10 w-10 text-warning" aria-hidden />
      <div>
        <h2 className="text-lg font-semibold">Admin privileges required</h2>
        <p className="mt-1 text-sm text-muted-foreground">Ask an administrator of your business if you need access.</p>
      </div>
      <Button asChild variant="outline">
        <Link to="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
