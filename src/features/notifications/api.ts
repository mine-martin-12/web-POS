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

/**
 * Where a notification leads, after checking the record still exists. Returns null when
 * it's gone (deleted, archived), so the caller can say so instead of opening a dead page.
 */
export async function resolveTarget(n: Notification, timeZone: string): Promise<string | null> {
  if (!n.link_table || !n.link_id) return null;
  const id = n.link_id;
  switch (n.link_table) {
    case "pending_updates": {
      const { data } = await supabase.from("pending_updates").select("id").eq("id", id).maybeSingle();
      return data ? `/app/approvals?status=all&update=${id}` : null;
    }
    case "credits": {
      const { data } = await supabase.from("credits").select("id").eq("id", id).maybeSingle();
      return data ? `/app/credits?tab=all&focus=${id}` : null;
    }
    case "sales": {
      const { data } = await supabase.from("sales").select("id, sale_date").eq("id", id).maybeSingle();
      return data ? `/app/sales?month=${dayKey(data.sale_date, timeZone).slice(0, 7)}&focus=${id}` : null;
    }
    case "products": {
      const { data } = await supabase.from("products").select("id, name, archived_at").eq("id", id).maybeSingle();
      return data && !data.archived_at ? `/app/products?q=${encodeURIComponent(data.name)}&focus=${id}` : null;
    }
    case "profiles": {
      const { data } = await supabase.from("profiles").select("user_id").eq("user_id", id).maybeSingle();
      return data ? "/app/staff" : null;
    }
    default:
      return null;
  }
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
