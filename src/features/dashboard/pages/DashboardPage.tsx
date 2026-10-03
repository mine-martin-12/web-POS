import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Banknote, HandCoins, Receipt, ShoppingCart, TrendingUp, Wallet, Scale } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSecurity } from "@/hooks/useSecurity";
import { useUrlState } from "@/hooks/useUrlState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { Money } from "@/components/common/Money";
import { QUICK_ACTIONS } from "@/config/routes";
import { useExpenses } from "@/features/expenses/hooks";
import { PaymentStatusBadge } from "@/features/sales/components/PaymentStatusBadge";
import { PeriodPicker } from "@/features/sales/components/PeriodPicker";
import { useMonthSummary, useSalesRange } from "@/features/sales/hooks";
import { resolvePeriod } from "@/features/sales/period";
import type { SaleRow } from "@/features/sales/types";
import { addDaysToKey, DEFAULT_TIME_ZONE, dayKey, daysInclusive, eachDayKey, parseDayKey, todayKey } from "@/lib/dates";
import { fromCents, pctChange, saleMoney, summarizeBy, summarizeSales, toCents } from "@/lib/finance";
import { Greeting } from "../components/Greeting";
import { InsightCard } from "../components/InsightCard";
import { OutstandingList } from "../components/OutstandingList";
import { RevenueExpensesChart } from "../components/RevenueExpensesChart";
import { TrendChart } from "../components/TrendChart";

const sumExpenses = (rows: Array<{ amount: number }> | undefined) => (rows ?? []).reduce((s, e) => s + toCents(e.amount), 0);

const DashboardPage: React.FC = () => {
  const { business } = useAuth();
  const security = useSecurity();
  const timeZone = business?.timezone ?? DEFAULT_TIME_ZONE;
  const today = todayKey(timeZone);
  const url = useUrlState();
  const period = resolvePeriod(
    { period: url.get("period", "30d"), month: url.get("month"), from: url.get("from"), to: url.get("to") },
    today,
  );
  // The same number of days immediately before, for trends.
  const days = daysInclusive(period.from, period.to);
  const prev = { from: addDaysToKey(period.from, -days), to: addDaysToKey(period.from, -1) };

  const current = useSalesRange(period.from, period.to, timeZone);
  const previous = useSalesRange(prev.from, prev.to, timeZone);
  const todays = useSalesRange(today, today, timeZone);
  const months = useMonthSummary();
  const expenses = useExpenses(period.from, period.to, security.canManageExpenses);
  const prevExpenses = useExpenses(prev.from, prev.to, security.canManageExpenses);

  const now = useMemo(() => summarizeSales(current.data ?? []), [current.data]);
  const before = useMemo(() => summarizeSales(previous.data ?? []), [previous.data]);
  const spent = sumExpenses(expenses.data);
  const spentBefore = sumExpenses(prevExpenses.data);
  const loading = current.isLoading || previous.isLoading;
  const comparison = days === 1 ? "vs previous day" : `vs previous ${days} days`;

  const daily = useMemo(() => {
    if (!current.data) return null;
    const groups = summarizeBy(current.data, (s) => dayKey(s.sale_date, timeZone));
    return eachDayKey(period.from, period.to > today ? today : period.to).map((day) => {
      const t = groups.get(day);
      return {
        date: format(parseDayKey(day), "d MMM"),
        tooltipLabel: format(parseDayKey(day), "EEE d MMM"),
        billed: fromCents(t?.billed ?? 0),
        collected: fromCents(t?.collected ?? 0),
      };
    });
  }, [current.data, period.from, period.to, today, timeZone]);
  const spark = daily?.map((d) => d.billed);

  const ranked = (keyOf: (s: SaleRow) => string, labelOf: (s: SaleRow) => string) => {
    const rows = current.data ?? [];
    const labels = new Map(rows.map((s) => [keyOf(s), labelOf(s)]));
    return [...summarizeBy(rows, keyOf)]
      .map(([key, t]) => ({ key, label: labels.get(key) ?? "", billed: t.billed, count: t.count }))
      .sort((a, b) => b.billed - a.billed)
      .slice(0, 5);
  };
  const topProducts = ranked((s) => s.product_id, (s) => s.product_name);
  const topCustomers = ranked((s) => s.customer?.id ?? "walk-in", (s) => s.customer?.name ?? "Walk-in customers");
  const recent = [...(current.data ?? [])].reverse().slice(0, 5);

  const quickActions = QUICK_ACTIONS.filter((a) => !a.capability || security[a.capability]);
  const profit = now.profit;
  const net = profit - spent;
  const netBefore = before.profit - spentBefore;

  return (
    <div className="space-y-6">
      <Greeting todayCount={todays.data?.length ?? 0} loading={todays.isLoading} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {quickActions.map((a) => (
            <Button key={a.id} asChild variant="outline" size="sm">
              <Link to={a.to}>
                <a.icon className="mr-1.5 h-4 w-4" aria-hidden />
                {a.label}
              </Link>
            </Button>
          ))}
        </div>
        <PeriodPicker
          period={period}
          today={today}
          onChange={(updates) => url.set({ ...updates, period: updates.period === null ? "month" : updates.period }, { period: "30d" })}
        />
      </div>

      <section aria-label="Key figures" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <InsightCard
          title="Revenue"
          help="Total billed for sales in this period, paid or not."
          icon={TrendingUp}
          value={<Money cents={now.billed} />}
          growth={pctChange(now.billed, before.billed)}
          comparisonLabel={comparison}
          sparkline={spark}
          loading={loading}
        />
        <InsightCard
          title="Collected"
          help="Money actually received for these sales: cash, M-Pesa, bank and credit payments so far."
          icon={Banknote}
          tone="success"
          value={<Money cents={now.collected} />}
          growth={pctChange(now.collected, before.collected)}
          comparisonLabel={comparison}
          loading={loading}
        />
        <InsightCard
          title="Outstanding"
          help="Still owed on this period's sales. Lower is better."
          icon={HandCoins}
          tone={now.outstanding > 0 ? "destructive" : "neutral"}
          value={<Money cents={now.outstanding} />}
          growth={pctChange(now.outstanding, before.outstanding)}
          comparisonLabel={comparison}
          higherIsBetter={false}
          loading={loading}
        />
        <InsightCard
          title="Sales"
          help="Number of sales, and the average bill per sale."
          icon={ShoppingCart}
          tone="neutral"
          value={
            <span>
              {now.count} <span className="text-base font-normal text-muted-foreground">· avg <Money cents={now.average} /></span>
            </span>
          }
          growth={pctChange(now.count, before.count)}
          comparisonLabel={comparison}
          loading={loading}
        />
        {security.canViewFinancialData && (
          <>
            <InsightCard
              title="Gross profit"
              help="Revenue minus what the goods cost you (buying price at the time of each sale)."
              icon={Scale}
              tone={profit >= 0 ? "success" : "destructive"}
              value={<Money cents={profit} />}
              growth={pctChange(profit, before.profit)}
              comparisonLabel={comparison}
              loading={loading}
            />
            <InsightCard
              title="Expenses"
              help="Running costs recorded on the Expenses page for this period. Lower is better."
              icon={Wallet}
              tone="warning"
              value={<Money cents={spent} />}
              growth={pctChange(spent, spentBefore)}
              comparisonLabel={comparison}
              higherIsBetter={false}
              loading={expenses.isLoading}
            />
            <InsightCard
              title="Net"
              help="Gross profit minus expenses: what the business actually made."
              icon={Receipt}
              tone={net >= 0 ? "success" : "destructive"}
              value={<Money cents={net} className={net < 0 ? "text-destructive" : undefined} />}
              growth={pctChange(net, netBefore)}
              comparisonLabel={comparison}
              loading={loading || expenses.isLoading}
            />
          </>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <TrendChart data={daily} loading={current.isLoading} periodLabel={period.label} />
        </div>
        <OutstandingList today={today} />
      </div>

      {security.canViewFinancialData && <RevenueExpensesChart summary={months.data} today={today} timeZone={timeZone} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <RankedCard title="Top products" rows={topProducts} loading={current.isLoading} />
        <RankedCard title="Top customers" rows={topCustomers} loading={current.isLoading} />
        <Card className="rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Recent sales</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/app/sales">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {current.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : recent.length === 0 ? (
              <EmptyState icon={ShoppingCart} title="No sales in this period" variant="minimal" />
            ) : (
              <ul className="divide-y">
                {recent.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link to={`/app/sales?focus=${s.id}&month=${dayKey(s.sale_date, timeZone).slice(0, 7)}`} className="block truncate font-medium hover:underline">
                        {s.quantity} × {s.product_name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{s.customer?.name ?? "Walk-in"}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Money cents={saleMoney(s).billed} className="font-medium" />
                      <PaymentStatusBadge sale={s} showAmounts={false} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

function RankedCard({
  title,
  rows,
  loading,
}: {
  title: string;
  rows: Array<{ key: string; label: string; billed: number; count: number }>;
  loading: boolean;
}) {
  const max = Math.max(...rows.map((r) => r.billed), 1);
  return (
    <Card className="rounded-xl">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : rows.length === 0 ? (
          <EmptyState icon={TrendingUp} title="Nothing sold in this period" variant="minimal" />
        ) : (
          <ol className="space-y-3">
            {rows.map((r, i) => (
              <li key={r.key} className="space-y-1 animate-fade-in" style={{ animationDelay: `${i * 40}ms` }}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate font-medium">{r.label}</span>
                  <Money cents={r.billed} className="shrink-0" />
                </div>
                <div className="h-1.5 rounded-full bg-muted" aria-hidden>
                  <div className="h-1.5 rounded-full bg-[hsl(var(--chart-1))]" style={{ width: `${(r.billed / max) * 100}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {r.count} {r.count === 1 ? "sale" : "sales"}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export default DashboardPage;
