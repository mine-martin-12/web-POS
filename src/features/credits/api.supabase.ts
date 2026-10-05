import { supabase } from "@/integrations/supabase/client";
import { addDaysToKey, startOfDayUtc } from "@/lib/dates";
import { fetchAll } from "@/lib/fetchAll";
import type { PaidMethod } from "@/features/sales/types";

export type CreditStatus = "unpaid" | "partially_paid" | "paid";

export interface CreditListRow {
  id: string;
  sale_id: string;
  customer_id: string | null;
  customer_name: string;
  amount_owed: number;
  amount_paid: number;
  status: CreditStatus;
  due_date: string;
  created_at: string;
  sale: { product_name: string; quantity: number; sale_date: string } | null;
}

export interface CreditPayment {
  id: string;
  amount: number;
  payment_method: PaidMethod;
  paid_at: string;
}

type One<T> = T | T[] | null;
const first = <T,>(value: One<T>): T | null => (Array.isArray(value) ? (value[0] ?? null) : value);

/** A credit as PostgREST returns it, with its sale embedded. */
export interface ApiCredit extends Omit<CreditListRow, "sale"> {
  sales: One<{ quantity: number; sale_date: string; products: One<{ name: string }> }>;
}

export function toCreditListRow({ sales, ...credit }: ApiCredit): CreditListRow {
  const sale = first(sales);
  return {
    ...credit,
    amount_owed: Number(credit.amount_owed),
    amount_paid: Number(credit.amount_paid),
    sale: sale
      ? { product_name: first(sale.products)?.name ?? "Unknown product", quantity: sale.quantity, sale_date: sale.sale_date }
      : null,
  };
}

export const toCreditPayment = (p: { id: string; amount: number; payment_method: string; paid_at: string }): CreditPayment => ({
  ...p,
  amount: Number(p.amount),
  payment_method: p.payment_method as PaidMethod,
});

export async function fetchCredits(): Promise<CreditListRow[]> {
  const rows = await fetchAll<ApiCredit>(() =>
    supabase
      .from("credits")
      .select(
        "id, sale_id, customer_id, customer_name, amount_owed, amount_paid, status, due_date, created_at, sales(quantity, sale_date, products(name))",
      )
      .order("due_date", { ascending: true })
      .order("id", { ascending: true }),
  );
  return rows.map(toCreditListRow);
}

export async function fetchCreditPayments(creditId: string): Promise<CreditPayment[]> {
  const { data, error } = await supabase
    .from("credit_payments")
    .select("id, amount, payment_method, paid_at")
    .eq("credit_id", creditId)
    .order("paid_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toCreditPayment);
}

/** Atomic server-side increment with a payment history row. */
export async function recordCreditPayment(input: { creditId: string; amount: number; method: PaidMethod }) {
  const { data, error } = await supabase.rpc("record_credit_payment", {
    _credit_id: input.creditId,
    _amount: input.amount,
    _payment_method: input.method,
  });
  if (error) throw error;
  return data;
}

/** Credit payments received on business-local days fromKey..toKey (deposits included). */
export async function fetchPaymentsInRange(fromKey: string, toKey: string, timeZone: string) {
  const rows = await fetchAll<{ id: string; amount: number; payment_method: string; paid_at: string }>(() =>
    supabase
      .from("credit_payments")
      .select("id, amount, payment_method, paid_at")
      .gte("paid_at", startOfDayUtc(fromKey, timeZone))
      .lt("paid_at", startOfDayUtc(addDaysToKey(toKey, 1), timeZone))
      .order("paid_at")
      .order("id"),
  );
  return rows.map((p) => ({ ...p, amount: Number(p.amount) }));
}

/** Unpaid credits past their due date (sidebar badge); `today` is the business-local day. */
export async function countOverdueCredits(today: string): Promise<number> {
  const { count, error } = await supabase
    .from("credits")
    .select("id", { count: "exact", head: true })
    .neq("status", "paid")
    .lt("due_date", today);
  if (error) throw error;
  return count ?? 0;
}
