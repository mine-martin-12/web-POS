import type { InviteInput, StaffApi, UpdateMemberInput } from "@/features/staff/api";
import { toMember } from "@/features/staff/api.supabase";
import type { Invitation } from "@/features/staff/types";
import { asActor, rows } from "../db/engine";
import * as edge from "../simulate/edge";

export const staff = {
  async fetchMembers() {
    const result = await asActor((tx) =>
      rows<Parameters<typeof toMember>[0]>(
        tx,
        `SELECT p.user_id, p.email, p.first_name, p.last_name, p.is_active, p.deactivated_at, p.created_at,
                (SELECT json_build_object('role', ur.role) FROM public.user_roles ur
                  WHERE ur.user_id = p.user_id AND ur.business_id = p.business_id) AS user_roles
         FROM public.profiles p ORDER BY p.created_at`,
      ),
    );
    return result.map(toMember);
  },

  fetchInvitations() {
    return asActor((tx) =>
      rows<Invitation>(
        tx,
        `SELECT id, email, first_name, last_name, role, user_id, expires_at, created_at FROM public.invitations
         WHERE accepted_at IS NULL AND revoked_at IS NULL ORDER BY created_at DESC`,
      ),
    );
  },

  inviteMember: (input: InviteInput) => edge.inviteStaff(input),
  resendInvitation: (invitationId: string, delivery: "email" | "link" = "email") => edge.resendInvitation(invitationId, delivery),
  revokeInvitation: (invitationId: string) => edge.revokeInvitation(invitationId),
  updateMember: (input: UpdateMemberInput) => edge.manageStaff("update", input),
  setMemberActive: (userId: string, active: boolean) => edge.manageStaff(active ? "reactivate" : "deactivate", { userId }),
} satisfies StaffApi;
