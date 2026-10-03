import { supabase } from "@/integrations/supabase/client";
import { addDaysToKey, DEFAULT_TIME_ZONE, startOfDayUtc } from "@/lib/dates";
import { fetchAll } from "@/lib/fetchAll";
import type { CreditRow, PaymentMethod, SaleRow } from "./types";

export const SALE_SELECT =
  "id, product_id, quantity, selling_price, total_price, unit_cost, sale_date, payment_method, description, created_at, created_by, products(name), credits(id, amount_owed, amount_paid, status, due_date, customer_name)";

interface ApiSale {
  id: string;
  product_id: string;
  quantity: number;
  selling_price: number;
  total_price: number | null;
  unit_cost: number | null;
  sale_date: string;
  payment_method: string;
  description: string | null;
  created_at: string;
  created_by: string | null;
  products: { name: string } | { name: string }[] | null;
  credits: CreditRow[] | CreditRow | null;
}

export function normalizeSale(row: ApiSale): SaleRow {
  const product = Array.isArray(row.products) ? row.products[0] : row.products;
  const credit = Array.isArray(row.credits) ? row.credits[0] : row.credits;
  return {
    id: row.id,
    product_id: row.product_id,
    product_name: product?.name ?? "Unknown product",
    quantity: Number(row.quantity),
    selling_price: Number(row.selling_price),
    total_price: Number(row.total_price ?? Number(row.quantity) * Number(row.selling_price)),
    unit_cost: row.unit_cost == null ? null : Number(row.unit_cost),
    sale_date: row.sale_date,
    payment_method: row.payment_method as PaymentMethod,
    description: row.description,
    created_at: row.created_at,
    created_by: row.created_by,
    credit: credit ?? null,
  };
}

/** Every sale whose sale_date falls on the business-local days fromKey..toKey (inclusive). */
export async function fetchSalesInRange(
  fromKey: string,
  toKey: string,
  timeZone = DEFAULT_TIME_ZONE,
): Promise<SaleRow[]> {
  const start = startOfDayUtc(fromKey, timeZone);
  const end = startOfDayUtc(addDaysToKey(toKey, 1), timeZone);
  const rows = await fetchAll<ApiSale>(() =>
    supabase
      .from("sales")
      .select(SALE_SELECT)
      .gte("sale_date", start)
      .lt("sale_date", end)
      .order("sale_date", { ascending: true })
      .order("id", { ascending: true }),
  );
  return rows.map(normalizeSale);
}
