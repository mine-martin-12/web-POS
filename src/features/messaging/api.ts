// Backend calls for messaging. The Supabase implementation is in api.supabase.ts; in demo
// mode the same calls are answered by the in-browser demo database (src/demo). Constants,
// types and pure helpers are re-exported unchanged.
import { routed } from "@/data/routed";
import * as remote from "./api.supabase";

export * from "./api.supabase";

const backend = {
  fetchMessages: remote.fetchMessages,
  fetchTemplates: remote.fetchTemplates,
  saveTemplate: remote.saveTemplate,
  deleteTemplate: remote.deleteTemplate,
  fetchAudience: remote.fetchAudience,
  sendSms: remote.sendSms,
  retrySms: remote.retrySms,
  sendOverdueReminders: remote.sendOverdueReminders,
};
export type MessagingApi = typeof backend;

export const {
  fetchMessages,
  fetchTemplates,
  saveTemplate,
  deleteTemplate,
  fetchAudience,
  sendSms,
  retrySms,
  sendOverdueReminders,
} = routed("messaging", backend);
