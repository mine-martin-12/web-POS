// Backend calls for notifications. The Supabase implementation is in api.supabase.ts; in demo
// mode the same calls are answered by the in-browser demo database (src/demo). Constants,
// types and pure helpers are re-exported unchanged.
import { routed } from "@/data/routed";
import * as remote from "./api.supabase";

export * from "./api.supabase";

const backend = {
  fetchNotifications: remote.fetchNotifications,
  markRead: remote.markRead,
  archiveNotification: remote.archiveNotification,
  resolveTarget: remote.resolveTarget,
  fetchPreferences: remote.fetchPreferences,
  savePreferences: remote.savePreferences,
  checkOverdueCredits: remote.checkOverdueCredits,
};
export type NotificationsApi = typeof backend;

export const {
  fetchNotifications,
  markRead,
  archiveNotification,
  resolveTarget,
  fetchPreferences,
  savePreferences,
  checkOverdueCredits,
} = routed("notifications", backend);
