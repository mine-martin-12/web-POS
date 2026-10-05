// Backend calls for expenses. The Supabase implementation is in api.supabase.ts; in demo
// mode the same calls are answered by the in-browser demo database (src/demo). Constants,
// types and pure helpers are re-exported unchanged.
import { routed } from "@/data/routed";
import * as remote from "./api.supabase";

export * from "./api.supabase";

const backend = {
  fetchExpenses: remote.fetchExpenses,
  createExpense: remote.createExpense,
  updateExpense: remote.updateExpense,
  deleteExpense: remote.deleteExpense,
};
export type ExpensesApi = typeof backend;

export const {
  fetchExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
} = routed("expenses", backend);
