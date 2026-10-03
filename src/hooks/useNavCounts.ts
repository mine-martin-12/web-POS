import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import type { NavBadge } from "@/config/routes";

/** Counts shown as badges in the sidebar. Cheap head-only count queries. */
export function useNavCounts(): Partial<Record<NavBadge, number>> {
  const { business } = useAuth();
  const overdue = useQuery({
    queryKey: queryKeys.nav.overdueCredits(),
    enabled: !!business,
    staleTime: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("credits")
        .select("id", { count: "exact", head: true })
        .neq("status", "paid")
        .lt("due_date", format(new Date(), "yyyy-MM-dd"));
      if (error) throw error;
      return count ?? 0;
    },
  });
  return { overdueCredits: overdue.data };
}

/** "99+" cap for badges. */
export const formatBadge = (count: number) => (count > 99 ? "99+" : String(count));
