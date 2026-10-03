import { dayKey } from "@/lib/dates";
import { fromCents, saleMoney } from "@/lib/finance";
import type { ExportSheet } from "@/lib/exports/table";
import { PAYMENT_METHOD_LABELS, type PaidMethod, type SaleRow } from "./types";

/** The payment method used most in the latest sales: the form's default. */
export function mostCommonMethod(sales: SaleRow[], sample = 50): PaidMethod {
  const counts = new Map<PaidMethod, number>();
  for (const sale of sales.slice(0, sample)) {
    if (sale.payment_method === "credit") continue;
    counts.set(sale.payment_method, (counts.get(sale.payment_method) ?? 0) + 1);
  }
  let best: PaidMethod = "cash";
  let max = 0;
  for (const [method, n] of counts) {
    if (n > max) {
      best = method;
      max = n;
    }
  }
  return best;
}

/** Price each product last sold for (sales are newest first). */
export function lastPrices(sales: SaleRow[]): Map<string, number> {
  const prices = new Map<string, number>();
  for (const sale of sales) if (!prices.has(sale.product_id)) prices.set(sale.product_id, sale.selling_price);
  return prices;
}

export function matchesSearch(sale: SaleRow, term: string): boolean {
  if (!term) return true;
  const t = term.toLowerCase();
  return (
    sale.product_name.toLowerCase().includes(t) ||
    (sale.description ?? "").toLowerCase().includes(t) ||
    (sale.customer?.name ?? sale.credit?.customer_name ?? "").toLowerCase().includes(t)
  );
}

/** The sales export (PDF / CSV / XLSX). Sequential readable ids (S0001…) replace
 *  internal UUIDs; money columns total exactly like the tiles on screen. */
export function salesSheet(rows: SaleRow[], timeZone: string, includeProfit: boolean): ExportSheet<SaleRow> {
  const columns: ExportSheet<SaleRow>["columns"] = [
    { header: "ID", value: (_s, i) => `S${String(i + 1).padStart(4, "0")}` },
    { header: "Date", value: (s) => dayKey(s.sale_date, timeZone) },
    { header: "Product", value: (s) => s.product_name, width: 24 },
    { header: "Customer", value: (s) => s.customer?.name ?? s.credit?.customer_name ?? "Walk-in", width: 20 },
    { header: "Qty", value: (s) => s.quantity },
    { header: "Price each", value: (s) => s.selling_price, money: true, noTotal: true },
    { header: "Total", value: (s) => fromCents(saleMoney(s).billed), money: true },
    { header: "Collected", value: (s) => fromCents(saleMoney(s).collected), money: true },
    { header: "Outstanding", value: (s) => fromCents(saleMoney(s).outstanding), money: true },
    { header: "Payment", value: (s) => (s.credit ? "Credit" : PAYMENT_METHOD_LABELS[s.payment_method]) },
    { header: "Status", value: (s) => saleMoney(s).status },
  ];
  if (includeProfit) columns.push({ header: "Profit", value: (s) => fromCents(saleMoney(s).profit), money: true });
  columns.push({ header: "Notes", value: (s) => s.description ?? "", width: 28 });
  return { name: "Sales", columns, rows, total: true };
}
