import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useSecurity } from "@/hooks/useSecurity";
import { todayKey } from "@/lib/dates";
import { queryKeys } from "@/lib/queryKeys";
import type { NavBadge } from "@/config/routes";
import { countApprovalsBadge } from "@/features/approvals/api";
import { countOverdueCredits } from "@/features/credits/api";

/** Counts shown as badges in the sidebar. Cheap head-only count queries; the approvals
 *  count is kept live by useApprovalsRealtime. */
export function useNavCounts(): Partial<Record<NavBadge, number>> {
  const { business, user } = useAuth();
  const { canReviewChanges, isLoadingRole } = useSecurity();

  const overdue = useQuery({
    queryKey: queryKeys.nav.overdueCredits(),
    enabled: !!business,
    staleTime: 60_000,
    queryFn: () => countOverdueCredits(todayKey(business?.timezone)),
  });

  // Admins: requests waiting for review. Staff: their requests sent back to them.
  const approvals = useQuery({
    queryKey: queryKeys.nav.approvals(canReviewChanges ? "reviewer" : "requester"),
    enabled: !!business && !!user && !isLoadingRole,
    staleTime: 60_000,
    queryFn: () => countApprovalsBadge({ reviewer: canReviewChanges, userId: user!.id }),
  });

  return { overdueCredits: overdue.data, approvals: approvals.data };
}

/** "99+" cap for badges. */
export const formatBadge = (count: number) => (count > 99 ? "99+" : String(count));
