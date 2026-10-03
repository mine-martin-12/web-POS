import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { type AppRole, HttpError } from "./http.ts";

export interface Caller {
  /** Service-role client. Bypasses RLS: every query MUST be scoped to `businessId`. */
  admin: SupabaseClient;
  userId: string;
  email: string;
  businessId: string;
  role: AppRole;
}

function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Verifies the caller's JWT and loads their business membership and role from the
 *  database (never from the token's user metadata). */
export async function requireMember(req: Request): Promise<Caller> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Not signed in");

  const admin = serviceClient();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) throw new HttpError(401, "Your session has expired. Please sign in again.");

  const { data: profile, error } = await admin
    .from("profiles")
    .select("business_id, is_active, user_roles(role), businesses(account_status, trial_ends_at)")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (error) throw error;
  if (!profile || !profile.is_active) throw new HttpError(403, "Your account is not active");

  // Same rule as get_user_business() in the database: expired/suspended businesses are locked.
  const business = (Array.isArray(profile.businesses) ? profile.businesses[0] : profile.businesses) as
    | { account_status: string; trial_ends_at: string | null }
    | null;
  const active =
    business?.account_status === "active" ||
    (business?.account_status === "trial" && !!business.trial_ends_at && new Date(business.trial_ends_at) > new Date());
  if (!active) throw new HttpError(403, "Your business account has expired. Please contact support.");

  const roles = profile.user_roles as { role: AppRole } | { role: AppRole }[] | null;
  const role = (Array.isArray(roles) ? roles[0]?.role : roles?.role) ?? null;
  if (!role) throw new HttpError(403, "Your account has no role");

  return {
    admin,
    userId: userData.user.id,
    email: userData.user.email ?? "",
    businessId: profile.business_id as string,
    role,
  };
}

export async function requireAdmin(req: Request): Promise<Caller> {
  const caller = await requireMember(req);
  if (caller.role !== "admin") throw new HttpError(403, "Admin privileges required");
  return caller;
}
