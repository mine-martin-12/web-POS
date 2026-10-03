import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import {
  fetchInvitations,
  fetchMembers,
  inviteMember,
  resendInvitation,
  revokeInvitation,
  setMemberActive,
  updateMember,
} from "./api";

export const useMembers = () => useQuery({ queryKey: queryKeys.staff.members(), queryFn: fetchMembers });

export const useInvitations = () => useQuery({ queryKey: queryKeys.staff.invitations(), queryFn: fetchInvitations });

/** All staff mutations refresh both members and invitations afterwards. */
function useStaffMutation<TInput, TResult>(fn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.staff.all }),
  });
}

export const useInviteMember = () => useStaffMutation(inviteMember);
export const useResendInvitation = () =>
  useStaffMutation((input: { id: string; delivery: "email" | "link" }) => resendInvitation(input.id, input.delivery));
export const useRevokeInvitation = () => useStaffMutation(revokeInvitation);
export const useUpdateMember = () => useStaffMutation(updateMember);
export const useSetMemberActive = () =>
  useStaffMutation((input: { userId: string; active: boolean }) => setMemberActive(input.userId, input.active));
