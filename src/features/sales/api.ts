import { supabase } from "@/integrations/supabase/client";
import { addDaysToKey, DEFAULT_TIME_ZONE, startOfDayUtc } from "@/lib/dates";
import { fetchAll } from "@/lib/fetchAll";
import type { CreditRow, PaymentMethod, RecordSaleInput, SaleChanges, SaleRow } from "./types";

export const SALE_SELECT =
  "id, product_id, quantity, selling_price, total_price, unit_cost, sale_date, payment_method, description, created_at, created_by, products(name), customers(id, name), credits(id, amount_owed, amount_paid, status, due_date, customer_name)";

type One<T> = T | T[] | null;
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
  products: One<{ name: string }>;
  customers: One<{ id: string; name: string }>;
  credits: One<CreditRow>;
}

const first = <T,>(value: One<T>): T | null => (Array.isArray(value) ? (value[0] ?? null) : value);

export function normalizeSale(row: ApiSale): SaleRow {
  const credit = first(row.credits);
  return {
    id: row.id,
    product_id: row.product_id,
    product_name: first(row.products)?.name ?? "Unknown product",
    quantity: Number(row.quantity),
    selling_price: Number(row.selling_price),
    total_price: Number(row.total_price ?? Number(row.quantity) * Number(row.selling_price)),
    unit_cost: row.unit_cost == null ? null : Number(row.unit_cost),
    sale_date: row.sale_date,
    payment_method: row.payment_method as PaymentMethod,
    description: row.description,
    created_at: row.created_at,
    created_by: row.created_by,
    customer: first(row.customers),
    credit: credit
      ? { ...credit, amount_owed: Number(credit.amount_owed), amount_paid: Number(credit.amount_paid) }
      : null,
  };
}

/** Every sale the caller may see (staff: their own), newest first. */
export async function fetchSales(): Promise<SaleRow[]> {
  const rows = await fetchAll<ApiSale>(() =>
    supabase
      .from("sales")
      .select(SALE_SELECT)
      .order("sale_date", { ascending: false })
      .order("id", { ascending: false }),
  );
  return rows.map(normalizeSale);
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

/** One atomic server call: the sale, its credit and any deposit. */
export async function recordSale(input: RecordSaleInput) {
  const { data, error } = await supabase.rpc("record_sale", {
    _product_id: input.productId,
    _quantity: input.quantity,
    _selling_price: input.sellingPrice,
    _payment_type: input.paymentType,
    _payment_method: input.paymentMethod,
    _deposit: input.paymentType === "partial" ? input.deposit : 0,
    _due_date: input.paymentType === "paid" ? undefined : (input.dueDate ?? undefined),
    _customer_id: input.customerId ?? undefined,
    _sale_day: input.saleDay ?? undefined,
    _description: input.description || undefined,
  });
  if (error) throw error;
  return data;
}

export async function updateSale(id: string, changes: SaleChanges) {
  const { data, error } = await supabase.rpc("update_sale", { _sale_id: id, _changes: changes as never });
  if (error) throw error;
  return data;
}

export interface MonthSummary {
  month: string;
  sales_count: number;
  billed: number;
  collected: number;
  outstanding: number;
}

/** Per-month totals for the archive grid (staff: their own sales). */
export async function fetchMonthSummary(): Promise<MonthSummary[]> {
  const { data, error } = await supabase.rpc("sales_month_summary");
  if (error) throw error;
  return (data ?? []).map((m) => ({
    month: m.month,
    sales_count: Number(m.sales_count),
    billed: Number(m.billed),
    collected: Number(m.collected),
    outstanding: Number(m.outstanding),
  }));
}

export async function deleteSale(id: string): Promise<void> {
  const { data, error } = await supabase.from("sales").delete().eq("id", id).select("id");
  if (error) throw error;
  // RLS filters instead of erroring: no row back means it wasn't allowed.
  if (!data?.length) throw new Error("This sale can't be deleted (admins only)");
}
