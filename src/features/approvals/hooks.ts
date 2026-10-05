import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { subscribeToChanges } from "@/lib/realtime";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { archiveChange, fetchChangeRequests, fetchMemberNames, resubmitChange, reviewChange, submitChange } from "./api";

export const useChangeRequests = (enabled = true) =>
  useQuery({ queryKey: queryKeys.approvals.list(), queryFn: fetchChangeRequests, enabled });

export const useMemberNames = () =>
  useQuery({ queryKey: queryKeys.staff.names(), queryFn: fetchMemberNames, staleTime: 5 * 60_000 });

/** Approving changes records everywhere, so refresh the data it can touch. */
function useApprovalMutation<TInput, TResult>(fn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () =>
      Promise.all(
        [queryKeys.approvals.all, queryKeys.sales.all, queryKeys.credits.all, queryKeys.products.all, queryKeys.nav.all].map(
          (queryKey) => queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  });
}

export const useSubmitChange = () => useApprovalMutation(submitChange);
export const useResubmitChange = () => useApprovalMutation(resubmitChange);
export const useReviewChange = () => useApprovalMutation(reviewChange);
export const useArchiveChange = () => useApprovalMutation(archiveChange);

/**
 * Keeps approval lists and the sidebar badge live: any insert/update on pending_updates
 * the user can see (RLS applies to realtime too) refreshes them.
 */
export function useApprovalsRealtime() {
  const queryClient = useQueryClient();
  const { business } = useAuth();
  const businessId = business?.id;
  useEffect(() => {
    if (!businessId) return;
    return subscribeToChanges(
      { channel: `pending_updates:${businessId}`, table: "pending_updates", filter: `business_id=eq.${businessId}` },
      () => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.approvals.all });
        void queryClient.invalidateQueries({ queryKey: queryKeys.nav.all });
      },
    );
  }, [businessId, queryClient]);
}
