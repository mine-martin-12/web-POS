// Backend calls for sales. The Supabase implementation is in api.supabase.ts; in demo
// mode the same calls are answered by the in-browser demo database (src/demo). Constants,
// types and pure helpers are re-exported unchanged.
import { routed } from "@/data/routed";
import * as remote from "./api.supabase";

export * from "./api.supabase";

const backend = {
  fetchSales: remote.fetchSales,
  fetchSalesInRange: remote.fetchSalesInRange,
  recordSale: remote.recordSale,
  updateSale: remote.updateSale,
  fetchMonthSummary: remote.fetchMonthSummary,
  deleteSale: remote.deleteSale,
};
export type SalesApi = typeof backend;

export const {
  fetchSales,
  fetchSalesInRange,
  recordSale,
  updateSale,
  fetchMonthSummary,
  deleteSale,
} = routed("sales", backend);
