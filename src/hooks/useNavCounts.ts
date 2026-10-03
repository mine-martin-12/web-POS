import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSecurity } from "@/hooks/useSecurity";
import { todayKey } from "@/lib/dates";
import { queryKeys } from "@/lib/queryKeys";
import type { NavBadge } from "@/config/routes";

/** Counts shown as badges in the sidebar. Cheap head-only count queries; the approvals
 *  count is kept live by useApprovalsRealtime. */
export function useNavCounts(): Partial<Record<NavBadge, number>> {
  const { business, user } = useAuth();
  const { canReviewChanges, isLoadingRole } = useSecurity();

  const overdue = useQuery({
    queryKey: queryKeys.nav.overdueCredits(),
    enabled: !!business,
    staleTime: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("credits")
        .select("id", { count: "exact", head: true })
        .neq("status", "paid")
        .lt("due_date", todayKey(business?.timezone));
      if (error) throw error;
      return count ?? 0;
    },
  });

  // Admins: requests waiting for review. Staff: their requests sent back to them.
  const approvals = useQuery({
    queryKey: queryKeys.nav.approvals(canReviewChanges ? "reviewer" : "requester"),
    enabled: !!business && !!user && !isLoadingRole,
    staleTime: 60_000,
    queryFn: async () => {
      let query = supabase.from("pending_updates").select("id", { count: "exact", head: true });
      query = canReviewChanges
        ? query.eq("status", "pending")
        : query.eq("status", "sent_back_for_review").eq("requested_by", user!.id);
      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    },
  });

  return { overdueCredits: overdue.data, approvals: approvals.data };
}

/** "99+" cap for badges. */
export const formatBadge = (count: number) => (count > 99 ? "99+" : String(count));
