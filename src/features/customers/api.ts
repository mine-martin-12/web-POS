// Backend calls for customers. The Supabase implementation is in api.supabase.ts; in demo
// mode the same calls are answered by the in-browser demo database (src/demo). Constants,
// types and pure helpers are re-exported unchanged.
import { routed } from "@/data/routed";
import * as remote from "./api.supabase";

export * from "./api.supabase";

const backend = {
  searchCustomers: remote.searchCustomers,
  fetchCustomers: remote.fetchCustomers,
  createCustomer: remote.createCustomer,
  updateCustomer: remote.updateCustomer,
  archiveCustomer: remote.archiveCustomer,
};
export type CustomersApi = typeof backend;

export const {
  searchCustomers,
  fetchCustomers,
  createCustomer,
  updateCustomer,
  archiveCustomer,
} = routed("customers", backend);
