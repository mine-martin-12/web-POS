import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { fetchAll } from "@/lib/fetchAll";

export type Product = Tables<"products">;

export const LOW_STOCK_THRESHOLD = 5;

export interface ProductInput {
  name: string;
  description: string;
  size: string;
  buying_price: number;
}

/** Active (non-archived) products, by name. */
export async function fetchProducts(): Promise<Product[]> {
  return fetchAll<Product>(() =>
    supabase.from("products").select("*").is("archived_at", null).order("name").order("id"),
  );
}

export async function createProduct(input: ProductInput & { stock_quantity: number }): Promise<void> {
  // business_id defaults to (and is forced to) the caller's business on the server.
  const { error } = await supabase.from("products").insert({
    name: input.name,
    description: input.description,
    size: input.size || null,
    buying_price: input.buying_price,
    stock_quantity: input.stock_quantity,
  });
  if (error) throw error;
}

/** Admin-only (RLS). Stock changes go through addStock / sales, never a direct edit. */
export async function updateProduct(id: string, input: ProductInput): Promise<void> {
  const { data, error } = await supabase
    .from("products")
    .update({ name: input.name, description: input.description, size: input.size || null, buying_price: input.buying_price })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Only admins can edit products");
}

/** Archived products disappear from lists and the sale form; their sales history stays. */
export async function archiveProduct(id: string): Promise<void> {
  const { data, error } = await supabase
    .from("products")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Only admins can archive products");
}

export async function addStock(input: { productId: string; quantity: number }) {
  const { data, error } = await supabase.rpc("add_stock", { _product_id: input.productId, _quantity: input.quantity });
  if (error) throw error;
  return data;
}
