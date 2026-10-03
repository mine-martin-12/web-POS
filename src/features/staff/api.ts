import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/contexts/AuthContext";
import { invokeFunction } from "@/lib/functions";
import type { Invitation, InviteResult, Member } from "./types";

export async function fetchMembers(): Promise<Member[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, email, first_name, last_name, is_active, deactivated_at, created_at, user_roles(role)")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data.map(({ user_roles, ...profile }) => {
    const roleRow = Array.isArray(user_roles) ? user_roles[0] : user_roles;
    return { ...profile, role: roleRow?.role ?? "user" };
  });
}

/** Open (not accepted, not revoked) invitations, newest first. */
export async function fetchInvitations(): Promise<Invitation[]> {
  const { data, error } = await supabase
    .from("invitations")
    .select("id, email, first_name, last_name, role, user_id, expires_at, created_at")
    .is("accepted_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export interface InviteInput {
  email: string;
  firstName: string;
  lastName: string;
  role: AppRole;
  delivery: "email" | "link";
}

export const inviteMember = (input: InviteInput) =>
  invokeFunction<InviteResult>("invite-staff", { action: "invite", ...input });

export const resendInvitation = (invitationId: string, delivery: "email" | "link" = "email") =>
  invokeFunction<InviteResult>("invite-staff", { action: "resend", invitationId, delivery });

export const revokeInvitation = (invitationId: string) =>
  invokeFunction<{ ok: true }>("invite-staff", { action: "revoke", invitationId });

export interface UpdateMemberInput {
  userId: string;
  firstName?: string;
  lastName?: string;
  role?: AppRole;
}

export const updateMember = (input: UpdateMemberInput) =>
  invokeFunction<{ member: unknown }>("manage-staff", { action: "update", ...input });

export const setMemberActive = (userId: string, active: boolean) =>
  invokeFunction<{ member: unknown }>("manage-staff", { action: active ? "reactivate" : "deactivate", userId });
