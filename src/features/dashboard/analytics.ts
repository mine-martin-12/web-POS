import { format } from "date-fns";
import { daysInMonth, parseDayKey } from "@/lib/dates";
import { fromCents, runRate, toCents } from "@/lib/finance";
import type { MonthSummary } from "@/features/sales/api";

export interface MonthPoint {
  month: string; // YYYY-MM
  label: string; // "Oct"
  revenue: number;
  expenses: number;
  /** Revenue − cost of goods − expenses. */
  net: number;
  /** Projected net for the unfinished current month (run rate); null for complete months. */
  projectedNet: number | null;
}

/** The last `count` months ending at `currentMonth`, oldest first, zero-filled. */
export function lastMonths(currentMonth: string, count: number): string[] {
  const [y, m] = currentMonth.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(y, m - 1 - (count - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

export function buildMonthlySeries(
  months: string[],
  summary: MonthSummary[],
  expensesByMonth: Map<string, number>, // cents
  today: string,
): MonthPoint[] {
  const byMonth = new Map(summary.map((m) => [m.month, m]));
  const currentMonth = today.slice(0, 7);
  return months.map((month) => {
    const s = byMonth.get(month);
    const revenue = toCents(s?.billed ?? 0);
    const cost = toCents(s?.cost ?? 0);
    const expenses = expensesByMonth.get(month) ?? 0;
    const net = revenue - cost - expenses;
    const isCurrent = month === currentMonth;
    return {
      month,
      label: format(parseDayKey(`${month}-01`), "MMM"),
      revenue: fromCents(revenue),
      expenses: fromCents(expenses),
      net: fromCents(net),
      projectedNet: isCurrent ? fromCents(runRate(net, Number(today.slice(8, 10)), daysInMonth(month))) : null,
    };
  });
}

export interface SeriesStats {
  best: MonthPoint | null;
  averageNet: number;
  profitable: number;
  total: number;
}

/** "Best period, average, profitable months N/M" under the chart. Months with no activity
 *  at all are left out so a new business isn't marked unprofitable for months it didn't trade. */
export function seriesStats(points: MonthPoint[]): SeriesStats {
  const active = points.filter((p) => p.revenue !== 0 || p.expenses !== 0);
  if (!active.length) return { best: null, averageNet: 0, profitable: 0, total: 0 };
  const best = active.reduce((a, b) => (b.net > a.net ? b : a));
  const totalCents = active.reduce((sum, p) => sum + toCents(p.net), 0);
  return {
    best,
    averageNet: fromCents(Math.round(totalCents / active.length)),
    profitable: active.filter((p) => p.net > 0).length,
    total: active.length,
  };
}

/** Sum expense amounts (in cents) by "YYYY-MM" of their date. */
export function expensesByMonth(expenses: Array<{ expense_date: string; amount: number | string }>): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of expenses) {
    const month = e.expense_date.slice(0, 7);
    map.set(month, (map.get(month) ?? 0) + toCents(e.amount));
  }
  return map;
}

/** Time-of-day greeting for the business's clock. */
export function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
