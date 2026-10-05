// Backend calls for account. The Supabase implementation is in api.supabase.ts; in demo
// mode the same calls are answered by the in-browser demo database (src/demo). Constants,
// types and pure helpers are re-exported unchanged.
import { routed } from "@/data/routed";
import * as remote from "./api.supabase";

export * from "./api.supabase";

const backend = {
  updateMyName: remote.updateMyName,
  updateBusinessDetails: remote.updateBusinessDetails,
  changePassword: remote.changePassword,
};
export type AccountApi = typeof backend;

export const {
  updateMyName,
  updateBusinessDetails,
  changePassword,
} = routed("account", backend);
