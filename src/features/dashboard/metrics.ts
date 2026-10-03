import { format } from "date-fns";
import { addDaysToKey, dayKey, daysInclusive, DEFAULT_TIME_ZONE, eachDayKey, parseDayKey } from "@/lib/dates";
import { fromCents, pctChange, saleMoney, summarizeBy, summarizeSales } from "@/lib/finance";
import type { SaleRow } from "@/features/sales/types";

export interface DateRangeKeys {
  from: string;
  to: string;
}

/** The period of the same length immediately before `range`. */
export function previousRange(range: DateRangeKeys): DateRangeKeys {
  const days = daysInclusive(range.from, range.to);
  return { from: addDaysToKey(range.from, -days), to: addDaysToKey(range.from, -1) };
}

export interface ProductTotal {
  productId: string;
  name: string;
  totalSales: number;
  quantity: number;
}

export interface DashboardMetrics {
  totalSalesAmount: number;
  actualRevenue: number;
  pendingRevenue: number;
  totalSalesCount: number;
  paidSalesCount: number;
  creditSalesCount: number;
  totalProfit: number;
  actualProfit: number;
  pendingProfit: number;
  averageSale: number;
  // Growth vs the previous period; null = no baseline (previous period was zero).
  actualRevenueGrowth: number | null;
  pendingRevenueGrowth: number | null;
  totalSalesAmountGrowth: number | null;
  actualProfitGrowth: number | null;
  pendingProfitGrowth: number | null;
  averageSaleGrowth: number | null;
  comparisonPeriodLabel: string;
  topProducts: ProductTotal[];
  bottomProducts: ProductTotal[];
  salesChart: Array<{ day: string; date: string; sales: number; profit: number; actualSales: number; actualProfit: number }>;
}

/** All dashboard numbers from the rows of the current and previous period. */
export function computeDashboardMetrics(
  current: SaleRow[],
  previous: SaleRow[],
  range: DateRangeKeys,
  timeZone = DEFAULT_TIME_ZONE,
): DashboardMetrics {
  const now = summarizeSales(current);
  const before = summarizeSales(previous);
  const days = daysInclusive(range.from, range.to);

  // Products grouped by id (two products may share a name).
  const byProduct = summarizeBy(current, (s) => s.product_id);
  const names = new Map(current.map((s) => [s.product_id, s.product_name]));
  const products = [...byProduct]
    .map(([productId, t]) => ({
      productId,
      name: names.get(productId) ?? "Unknown product",
      totalSales: fromCents(t.billed),
      quantity: current.filter((s) => s.product_id === productId).reduce((n, s) => n + s.quantity, 0),
    }))
    .sort((a, b) => b.totalSales - a.totalSales);
  const half = Math.ceil(products.length / 2);

  // One point per day, including days with no sales.
  const byDay = new Map(eachDayKey(range.from, range.to).map((d) => [d, { sales: 0, profit: 0, actualSales: 0, actualProfit: 0 }]));
  for (const sale of current) {
    const point = byDay.get(dayKey(sale.sale_date, timeZone));
    if (!point) continue;
    const m = saleMoney(sale);
    point.sales += m.billed;
    point.profit += m.profit;
    point.actualSales += m.collected;
    point.actualProfit += m.realizedProfit;
  }

  return {
    totalSalesAmount: fromCents(now.billed),
    actualRevenue: fromCents(now.collected),
    pendingRevenue: fromCents(now.outstanding),
    totalSalesCount: now.count,
    paidSalesCount: now.paidCount,
    creditSalesCount: now.partialCount + now.unpaidCount,
    totalProfit: fromCents(now.profit),
    actualProfit: fromCents(now.realizedProfit),
    pendingProfit: fromCents(now.pendingProfit),
    averageSale: fromCents(now.average),
    actualRevenueGrowth: pctChange(now.collected, before.collected),
    pendingRevenueGrowth: pctChange(now.outstanding, before.outstanding),
    totalSalesAmountGrowth: pctChange(now.billed, before.billed),
    actualProfitGrowth: pctChange(now.realizedProfit, before.realizedProfit),
    pendingProfitGrowth: pctChange(now.pendingProfit, before.pendingProfit),
    averageSaleGrowth: pctChange(now.average, before.average),
    comparisonPeriodLabel: days === 1 ? "vs previous day" : `vs previous ${days} days`,
    // Top and bottom lists never overlap when there are few products.
    topProducts: products.slice(0, Math.min(10, half)),
    bottomProducts: products.slice(Math.min(10, half)).slice(-10).reverse(),
    salesChart: [...byDay].map(([day, p]) => ({
      day,
      date: format(parseDayKey(day), "MMM dd"),
      sales: fromCents(p.sales),
      profit: fromCents(p.profit),
      actualSales: fromCents(p.actualSales),
      actualProfit: fromCents(p.actualProfit),
    })),
  };
}
