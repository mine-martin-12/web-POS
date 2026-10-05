import type { ActivityApi, ActivityFilters, ActivityLog } from "@/features/activity/api";
import { addDaysToKey, startOfDayUtc } from "@/lib/dates";
import { asActor, rows } from "../db/engine";

const COLUMNS = "id, actor_id, action, table_name, record_id, old_values, new_values, reason, created_at";

/** The same filters the Supabase query applies (admin-only via RLS). */
function where(f: ActivityFilters): { sql: string; params: unknown[] } {
  const params: unknown[] = [startOfDayUtc(f.from, f.timeZone), startOfDayUtc(addDaysToKey(f.to, 1), f.timeZone)];
  const clauses = ["created_at >= $1", "created_at < $2"];
  const add = (clause: string, value: unknown) => {
    params.push(value);
    clauses.push(clause.replace("?", `$${params.length}`));
  };
  if (f.actor) add("actor_id = ?", f.actor);
  if (f.action) add("action = ?", f.action);
  if (f.table) add("table_name = ?", f.table);
  const term = f.search.trim().toLowerCase().replace(/[%_\\]/g, (c) => `\\${c}`);
  if (term) add("search_text LIKE ?", `%${term}%`);
  return { sql: clauses.join(" AND "), params };
}

export const activity = {
  fetchActivityPage(f: ActivityFilters, page: number, pageSize: number) {
    const { sql, params } = where(f);
    return asActor(async (tx) => {
      const [{ total }] = await rows<{ total: number }>(tx, `SELECT count(*)::int AS total FROM public.activity_logs WHERE ${sql}`, params);
      const page_ = await rows<ActivityLog>(
        tx,
        `SELECT ${COLUMNS} FROM public.activity_logs WHERE ${sql}
         ORDER BY created_at DESC, id DESC LIMIT ${Math.max(1, pageSize)} OFFSET ${Math.max(0, page * pageSize)}`,
        params,
      );
      return { rows: page_, total };
    });
  },

  fetchActivityAll(f: ActivityFilters) {
    const { sql, params } = where(f);
    return asActor((tx) =>
      rows<ActivityLog>(tx, `SELECT ${COLUMNS} FROM public.activity_logs WHERE ${sql} ORDER BY created_at DESC, id`, params),
    );
  },
} satisfies ActivityApi;
