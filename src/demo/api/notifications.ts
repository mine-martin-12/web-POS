import type { Notification, NotificationPreferences, NotificationsApi } from "@/features/notifications/api";
import { DEFAULT_PREFERENCES, LINK_LOOKUPS, notificationPath, type LinkedRecord } from "@/features/notifications/api.supabase";
import { asActor, maybeOne, rows } from "../db/engine";

export const notifications = {
  fetchNotifications() {
    return asActor((tx) =>
      rows<Notification>(tx, "SELECT * FROM public.notifications WHERE archived_at IS NULL ORDER BY created_at DESC LIMIT 50"),
    );
  },

  async markRead(ids: string[]) {
    if (!ids.length) return;
    await asActor((tx) => rows(tx, "UPDATE public.notifications SET read_at = now() WHERE id = ANY($1::uuid[])", [ids]));
  },

  async archiveNotification(id: string) {
    await asActor((tx) => rows(tx, "UPDATE public.notifications SET archived_at = now() WHERE id = $1", [id]));
  },

  async resolveTarget(n: Notification, timeZone: string) {
    if (!n.link_table || !n.link_id) return null;
    const lookup = LINK_LOOKUPS[n.link_table];
    if (!lookup) return null;
    // Table and column names come from the fixed LINK_LOOKUPS map, never from input.
    const record = await asActor((tx) =>
      maybeOne<LinkedRecord>(tx, `SELECT ${lookup.columns} FROM public.${n.link_table} WHERE ${lookup.key} = $1`, [n.link_id]),
    );
    return notificationPath(n.link_table, n.link_id, record, timeZone);
  },

  async fetchPreferences(userId: string) {
    const prefs = await asActor((tx) =>
      maybeOne<NotificationPreferences>(
        tx,
        "SELECT change_requests, overdue_credits, low_stock, team FROM public.notification_preferences WHERE user_id = $1",
        [userId],
      ),
    );
    return prefs ?? DEFAULT_PREFERENCES;
  },

  async savePreferences(userId: string, prefs: NotificationPreferences) {
    await asActor((tx) =>
      rows(
        tx,
        `INSERT INTO public.notification_preferences (user_id, change_requests, overdue_credits, low_stock, team)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE SET change_requests = EXCLUDED.change_requests,
           overdue_credits = EXCLUDED.overdue_credits, low_stock = EXCLUDED.low_stock, team = EXCLUDED.team`,
        [userId, prefs.change_requests, prefs.overdue_credits, prefs.low_stock, prefs.team],
      ),
    );
  },

  async checkOverdueCredits() {
    await asActor((tx) => rows(tx, "SELECT public.notify_overdue_credits()"));
  },
} satisfies NotificationsApi;
