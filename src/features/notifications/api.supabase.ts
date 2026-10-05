import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { dayKey } from "@/lib/dates";

export type Notification = Tables<"notifications">;
export type NotificationPreferences = Pick<
  Tables<"notification_preferences">,
  "change_requests" | "overdue_credits" | "low_stock" | "team"
>;

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  change_requests: true,
  overdue_credits: true,
  low_stock: true,
  team: true,
};

const LIMIT = 50;

export async function fetchNotifications(): Promise<Notification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (error) throw error;
  return data ?? [];
}

export async function markRead(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
  if (error) throw error;
}

export async function archiveNotification(id: string): Promise<void> {
  const { error } = await supabase.from("notifications").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

/** The record a notification points at, as far as the caller can see it (null: gone). */
export type LinkedRecord = { sale_date?: string; name?: string; archived_at?: string | null } | null;

/** The tables a notification can link to, and the columns needed to build its path. */
export const LINK_LOOKUPS: Record<string, { key: string; columns: string }> = {
  pending_updates: { key: "id", columns: "id" },
  credits: { key: "id", columns: "id" },
  sales: { key: "id", columns: "id, sale_date" },
  products: { key: "id", columns: "id, name, archived_at" },
  profiles: { key: "user_id", columns: "user_id" },
};

/** Where a notification leads, given the linked record (null when it no longer exists). */
export function notificationPath(table: string, id: string, record: LinkedRecord, timeZone: string): string | null {
  if (!record) return null;
  switch (table) {
    case "pending_updates":
      return `/app/approvals?status=all&update=${id}`;
    case "credits":
      return `/app/credits?tab=all&focus=${id}`;
    case "sales":
      return `/app/sales?month=${dayKey(record.sale_date as string, timeZone).slice(0, 7)}&focus=${id}`;
    case "products":
      return record.archived_at ? null : `/app/products?q=${encodeURIComponent(record.name ?? "")}&focus=${id}`;
    case "profiles":
      return "/app/staff";
    default:
      return null;
  }
}

/**
 * Where a notification leads, after checking the record still exists. Returns null when
 * it's gone (deleted, archived), so the caller can say so instead of opening a dead page.
 */
export async function resolveTarget(n: Notification, timeZone: string): Promise<string | null> {
  if (!n.link_table || !n.link_id) return null;
  const lookup = LINK_LOOKUPS[n.link_table];
  if (!lookup) return null;
  const { data } = await supabase
    .from(n.link_table as "sales")
    .select(lookup.columns)
    .eq(lookup.key, n.link_id)
    .maybeSingle();
  return notificationPath(n.link_table, n.link_id, data as LinkedRecord, timeZone);
}

export async function fetchPreferences(userId: string): Promise<NotificationPreferences> {
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("change_requests, overdue_credits, low_stock, team")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? DEFAULT_PREFERENCES;
}

export async function savePreferences(userId: string, prefs: NotificationPreferences): Promise<void> {
  const { error } = await supabase.from("notification_preferences").upsert({ user_id: userId, ...prefs });
  if (error) throw error;
}

/** Ask the server to raise any newly overdue credits (idempotent). */
export async function checkOverdueCredits(): Promise<void> {
  await supabase.rpc("notify_overdue_credits");
}
