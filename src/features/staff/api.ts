// Backend calls for staff. The Supabase implementation is in api.supabase.ts; in demo
// mode the same calls are answered by the in-browser demo database (src/demo). Constants,
// types and pure helpers are re-exported unchanged.
import { routed } from "@/data/routed";
import * as remote from "./api.supabase";

export * from "./api.supabase";

const backend = {
  fetchMembers: remote.fetchMembers,
  fetchInvitations: remote.fetchInvitations,
  inviteMember: remote.inviteMember,
  resendInvitation: remote.resendInvitation,
  revokeInvitation: remote.revokeInvitation,
  updateMember: remote.updateMember,
  setMemberActive: remote.setMemberActive,
};
export type StaffApi = typeof backend;

export const {
  fetchMembers,
  fetchInvitations,
  inviteMember,
  resendInvitation,
  revokeInvitation,
  updateMember,
  setMemberActive,
} = routed("staff", backend);
