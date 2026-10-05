// Backend calls for realtime. The Supabase implementation is in realtime.supabase.ts; in demo
// mode the same calls are answered by the in-browser demo database (src/demo). Constants,
// types and pure helpers are re-exported unchanged.
import { routed } from "@/data/routed";
import * as remote from "./realtime.supabase";

export * from "./realtime.supabase";

const backend = {
  subscribeToChanges: remote.subscribeToChanges,
};
export type RealtimeApi = typeof backend;

export const {
  subscribeToChanges,
} = routed("realtime", backend);
