// Backend calls for products. The Supabase implementation is in api.supabase.ts; in demo
// mode the same calls are answered by the in-browser demo database (src/demo). Constants,
// types and pure helpers are re-exported unchanged.
import { routed } from "@/data/routed";
import * as remote from "./api.supabase";

export * from "./api.supabase";

const backend = {
  fetchProducts: remote.fetchProducts,
  createProduct: remote.createProduct,
  updateProduct: remote.updateProduct,
  archiveProduct: remote.archiveProduct,
  addStock: remote.addStock,
};
export type ProductsApi = typeof backend;

export const {
  fetchProducts,
  createProduct,
  updateProduct,
  archiveProduct,
  addStock,
} = routed("products", backend);
