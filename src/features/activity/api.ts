// Backend calls for activity. The Supabase implementation is in api.supabase.ts; in demo
// mode the same calls are answered by the in-browser demo database (src/demo). Constants,
// types and pure helpers are re-exported unchanged.
import { routed } from "@/data/routed";
import * as remote from "./api.supabase";

export * from "./api.supabase";

const backend = {
  fetchActivityPage: remote.fetchActivityPage,
  fetchActivityAll: remote.fetchActivityAll,
};
export type ActivityApi = typeof backend;

export const {
  fetchActivityPage,
  fetchActivityAll,
} = routed("activity", backend);
