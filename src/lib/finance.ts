/**
 * The ONE place that does money and metric maths. Pages never sum amounts themselves.
 *
 * All arithmetic is in integer cents, so 100.10 - 0.20 is exactly 99.90 and totals never
 * drift. Invariant: billed = collected + outstanding, for every sale and every total.
 */

export type Cents = number;

export const toCents = (value: number | string | null | undefined): Cents => {
  const n = typeof value === "string" ? Number(value) : value ?? 0;
  return Number.isFinite(n) ? Math.round((n as number) * 100) : 0;
};

export const fromCents = (cents: Cents): number => cents / 100;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** Deposits/payments can never exceed the bill or be negative. */
export function clampPayment(amount: Cents, total: Cents): Cents {
  return clamp(amount, 0, Math.max(total, 0));
}

export type PaymentStatus = "paid" | "partial" | "unpaid";

/** The shape every sale query provides (columns from `sales` + its credit, if any). */
export interface SaleAmounts {
  quantity: number;
  selling_price: number | string;
  total_price?: number | string | null;
  /** Buying price per unit at the time of sale; null for very old rows. */
  unit_cost?: number | string | null;
  credit?: { amount_owed: number | string; amount_paid: number | string } | null;
}

export interface SaleMoney {
  billed: Cents;
  collected: Cents;
  outstanding: Cents;
  /** Cost of goods; 0 when unknown. */
  cost: Cents;
  profit: Cents;
  /** Profit realised in proportion to what has been collected. */
  realizedProfit: Cents;
  pendingProfit: Cents;
  status: PaymentStatus;
  /** 0–100, how much of the bill is collected. */
  percentPaid: number;
}

/** Money facts for one sale. A sale with no credit row is fully paid. */
export function saleMoney(sale: SaleAmounts): SaleMoney {
  const billed = sale.total_price != null ? toCents(sale.total_price) : sale.quantity * toCents(sale.selling_price);
  const outstanding = sale.credit
    ? clamp(toCents(sale.credit.amount_owed) - toCents(sale.credit.amount_paid), 0, Math.max(billed, 0))
    : 0;
  const collected = billed - outstanding;
  const cost = sale.unit_cost != null ? sale.quantity * toCents(sale.unit_cost) : 0;
  const profit = billed - cost;
  const realizedProfit = billed > 0 ? Math.round((profit * collected) / billed) : 0;
  return {
    billed,
    collected,
    outstanding,
    cost,
    profit,
    realizedProfit,
    pendingProfit: profit - realizedProfit,
    status: outstanding === 0 ? "paid" : collected > 0 ? "partial" : "unpaid",
    percentPaid: billed > 0 ? Math.round((collected / billed) * 100) : 100,
  };
}

export interface MoneyTotals {
  count: number;
  billed: Cents;
  collected: Cents;
  outstanding: Cents;
  cost: Cents;
  profit: Cents;
  realizedProfit: Cents;
  pendingProfit: Cents;
  paidCount: number;
  unpaidCount: number;
  partialCount: number;
  /** Average bill per sale. */
  average: Cents;
}

export function emptyTotals(): MoneyTotals {
  return {
    count: 0,
    billed: 0,
    collected: 0,
    outstanding: 0,
    cost: 0,
    profit: 0,
    realizedProfit: 0,
    pendingProfit: 0,
    paidCount: 0,
    unpaidCount: 0,
    partialCount: 0,
    average: 0,
  };
}

/** Totals over exactly the rows given (so a list's tiles always match its rows). */
export function summarizeSales(sales: SaleAmounts[]): MoneyTotals {
  const t = emptyTotals();
  for (const sale of sales) {
    const m = saleMoney(sale);
    t.count++;
    t.billed += m.billed;
    t.collected += m.collected;
    t.outstanding += m.outstanding;
    t.cost += m.cost;
    t.profit += m.profit;
    t.realizedProfit += m.realizedProfit;
    t.pendingProfit += m.pendingProfit;
    if (m.status === "paid") t.paidCount++;
    else if (m.status === "partial") t.partialCount++;
    else t.unpaidCount++;
  }
  t.average = t.count > 0 ? Math.round(t.billed / t.count) : 0;
  return t;
}

/** Group rows by a key and summarise each group. */
export function summarizeBy<T extends SaleAmounts>(sales: T[], keyOf: (sale: T) => string): Map<string, MoneyTotals> {
  const groups = new Map<string, T[]>();
  for (const sale of sales) {
    const key = keyOf(sale);
    const list = groups.get(key);
    if (list) list.push(sale);
    else groups.set(key, [sale]);
  }
  return new Map([...groups].map(([key, rows]) => [key, summarizeSales(rows)]));
}

/** Credit balances (for the Credits page). */
export interface CreditAmounts {
  amount_owed: number | string;
  amount_paid: number | string;
}

export function creditOutstanding(credit: CreditAmounts): Cents {
  return Math.max(toCents(credit.amount_owed) - toCents(credit.amount_paid), 0);
}

export function summarizeCredits(credits: CreditAmounts[]) {
  let owed = 0;
  let paid = 0;
  let outstanding = 0;
  for (const c of credits) {
    const o = toCents(c.amount_owed);
    const p = clamp(toCents(c.amount_paid), 0, Math.max(o, 0));
    owed += o;
    paid += p;
    outstanding += o - p;
  }
  return { count: credits.length, owed, paid, outstanding };
}

/**
 * Percentage change vs the previous period, dividing by |previous| so recovering from a
 * loss (previous −100, current +50) reads as +150%, not −150%.
 * Returns null when there is no meaningful baseline (previous = 0 and current ≠ 0).
 */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * Projected full-period value for an unfinished period (e.g. this month on the 10th):
 * value so far ÷ days elapsed × days in period.
 */
export function runRate(valueSoFar: number, daysElapsed: number, daysInPeriod: number): number {
  if (daysElapsed <= 0) return 0;
  if (daysElapsed >= daysInPeriod) return valueSoFar;
  return Math.round((valueSoFar / daysElapsed) * daysInPeriod);
}

/** Margin as a percentage of revenue, or null with no revenue. */
export function marginPct(profit: Cents, revenue: Cents): number | null {
  return revenue === 0 ? null : (profit / revenue) * 100;
}
