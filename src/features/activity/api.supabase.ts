import { supabase } from "@/integrations/supabase/client";
import { addDaysToKey, startOfDayUtc } from "@/lib/dates";
import { fetchAll } from "@/lib/fetchAll";

export type ActivityAction = "create" | "update" | "delete";

export interface ActivityLog {
  id: string;
  actor_id: string | null;
  action: ActivityAction;
  table_name: string;
  record_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
}

export interface ActivityFilters {
  from: string; // YYYY-MM-DD, business-local
  to: string;
  actor: string | null;
  action: ActivityAction | null;
  table: string | null;
  search: string;
  timeZone: string;
}

const COLUMNS = "id, actor_id, action, table_name, record_id, old_values, new_values, reason, created_at";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the PostgREST builder type is deeply generic
function applyFilters(query: any, f: ActivityFilters) {
  let q = query
    .gte("created_at", startOfDayUtc(f.from, f.timeZone))
    .lt("created_at", startOfDayUtc(addDaysToKey(f.to, 1), f.timeZone));
  if (f.actor) q = q.eq("actor_id", f.actor);
  if (f.action) q = q.eq("action", f.action);
  if (f.table) q = q.eq("table_name", f.table);
  const term = f.search.trim().toLowerCase().replace(/[%_\\]/g, (c) => `\\${c}`);
  if (term) q = q.like("search_text", `%${term}%`);
  return q;
}

/** One page of the log plus the total for the filters (admin-only via RLS). */
export async function fetchActivityPage(f: ActivityFilters, page: number, pageSize: number) {
  const from = page * pageSize;
  const query = applyFilters(supabase.from("activity_logs").select(COLUMNS, { count: "exact" }), f)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + pageSize - 1);
  const { data, count, error } = await query;
  if (error) throw error;
  return { rows: (data ?? []) as ActivityLog[], total: (count as number | null) ?? 0 };
}

/** Every row for the filters (for CSV export). */
export async function fetchActivityAll(f: ActivityFilters): Promise<ActivityLog[]> {
  return fetchAll<ActivityLog>(() =>
    applyFilters(supabase.from("activity_logs").select(COLUMNS), f).order("created_at", { ascending: false }).order("id"),
  );
}
