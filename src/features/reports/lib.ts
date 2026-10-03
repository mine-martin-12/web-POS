import { daysInclusive } from "@/lib/dates";
import { creditOutstanding, toCents, type Cents } from "@/lib/finance";
import type { PaidMethod, SaleRow } from "@/features/sales/types";

export interface AgingBucket {
  key: string;
  label: string;
  cents: Cents;
  count: number;
}

const BUCKETS: Array<{ key: string; label: string; maxDays: number }> = [
  { key: "current", label: "Not yet due", maxDays: 0 },
  { key: "1-30", label: "1–30 days overdue", maxDays: 30 },
  { key: "31-60", label: "31–60 days overdue", maxDays: 60 },
  { key: "61-90", label: "61–90 days overdue", maxDays: 90 },
  { key: "90+", label: "Over 90 days overdue", maxDays: Infinity },
];

/** Receivables ageing: open balances by how long past their due date they are. */
export function agingBuckets(
  credits: Array<{ due_date: string; amount_owed: number | string; amount_paid: number | string; status: string }>,
  today: string,
): AgingBucket[] {
  const result = BUCKETS.map((b) => ({ key: b.key, label: b.label, cents: 0, count: 0 }));
  for (const c of credits) {
    const owed = creditOutstanding(c);
    if (c.status === "paid" || owed === 0) continue;
    const overdueDays = c.due_date < today ? daysInclusive(c.due_date, today) - 1 : 0;
    const index = BUCKETS.findIndex((b) => overdueDays <= b.maxDays);
    result[index].cents += owed;
    result[index].count++;
  }
  return result;
}

/** Money RECEIVED in the period by method: sales paid in full up front, plus every credit
 *  payment (deposits included). A part-payment's deposit is only in credit_payments, so
 *  nothing is counted twice. */
export function receivedByMethod(
  sales: SaleRow[],
  payments: Array<{ amount: number | string; payment_method: string }>,
): Record<PaidMethod, Cents> {
  const totals: Record<PaidMethod, Cents> = { cash: 0, mpesa: 0, bank_cheque: 0 };
  for (const s of sales) {
    if (!s.credit && s.payment_method !== "credit") totals[s.payment_method] += toCents(s.total_price);
  }
  for (const p of payments) {
    if (p.payment_method in totals) totals[p.payment_method as PaidMethod] += toCents(p.amount);
  }
  return totals;
}

/** Sum amounts by a key, largest first. */
export function totalsBy<T>(rows: T[], keyOf: (row: T) => string, amountOf: (row: T) => Cents): Array<{ key: string; cents: Cents; count: number }> {
  const map = new Map<string, { cents: Cents; count: number }>();
  for (const row of rows) {
    const key = keyOf(row);
    const entry = map.get(key) ?? { cents: 0, count: 0 };
    entry.cents += amountOf(row);
    entry.count++;
    map.set(key, entry);
  }
  return [...map].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.cents - a.cents);
}

/** Change in percentage POINTS (for margins), not percent of percent. */
export function pointsChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return current - previous;
}
