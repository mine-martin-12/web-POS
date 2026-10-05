// Backend calls for approvals. The Supabase implementation is in api.supabase.ts; in demo
// mode the same calls are answered by the in-browser demo database (src/demo). Constants,
// types and pure helpers are re-exported unchanged.
import { routed } from "@/data/routed";
import * as remote from "./api.supabase";

export * from "./api.supabase";

const backend = {
  fetchChangeRequests: remote.fetchChangeRequests,
  fetchMemberNames: remote.fetchMemberNames,
  submitChange: remote.submitChange,
  resubmitChange: remote.resubmitChange,
  reviewChange: remote.reviewChange,
  archiveChange: remote.archiveChange,
  countApprovalsBadge: remote.countApprovalsBadge,
};
export type ApprovalsApi = typeof backend;

export const {
  fetchChangeRequests,
  fetchMemberNames,
  submitChange,
  resubmitChange,
  reviewChange,
  archiveChange,
  countApprovalsBadge,
} = routed("approvals", backend);
