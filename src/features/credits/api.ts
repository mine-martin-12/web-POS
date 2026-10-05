// Backend calls for credits. The Supabase implementation is in api.supabase.ts; in demo
// mode the same calls are answered by the in-browser demo database (src/demo). Constants,
// types and pure helpers are re-exported unchanged.
import { routed } from "@/data/routed";
import * as remote from "./api.supabase";

export * from "./api.supabase";

const backend = {
  fetchCredits: remote.fetchCredits,
  fetchCreditPayments: remote.fetchCreditPayments,
  recordCreditPayment: remote.recordCreditPayment,
  fetchPaymentsInRange: remote.fetchPaymentsInRange,
  countOverdueCredits: remote.countOverdueCredits,
};
export type CreditsApi = typeof backend;

export const {
  fetchCredits,
  fetchCreditPayments,
  recordCreditPayment,
  fetchPaymentsInRange,
  countOverdueCredits,
} = routed("credits", backend);
