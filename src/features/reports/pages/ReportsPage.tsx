import React, { useMemo, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { FileSpreadsheet, HandCoins, Maximize2, Percent, Receipt, TrendingUp, Wallet } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useUrlState } from "@/hooks/useUrlState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarList } from "@/components/common/BarList";
import { Money } from "@/components/common/Money";
import { useCredits, usePaymentsInRange } from "@/features/credits/hooks";
import { InsightCard } from "@/features/dashboard/components/InsightCard";
import { RevenueExpensesChart } from "@/features/dashboard/components/RevenueExpensesChart";
import { useExpenses } from "@/features/expenses/hooks";
import { PeriodPicker } from "@/features/sales/components/PeriodPicker";
import { useMonthSummary, useSalesRange } from "@/features/sales/hooks";
import { comparisonPeriod, resolvePeriod } from "@/features/sales/period";
import { PAYMENT_METHOD_LABELS } from "@/features/sales/types";
import { DEFAULT_TIME_ZONE, todayKey } from "@/lib/dates";
import { creditOutstanding, marginPct, pctChange, summarizeBy, summarizeSales, toCents } from "@/lib/finance";
import { FocusMode } from "../components/FocusMode";
import { TaxExportDialog } from "../components/TaxExportDialog";
import { agingBuckets, pointsChange, receivedByMethod, totalsBy } from "../lib";

const TABS = [
  { value: "trends", label: "Trends" },
  { value: "receivables", label: "Receivables" },
  { value: "customers", label: "Customers" },
  { value: "expenses", label: "Expenses" },
  { value: "products", label: "Products" },
  { value: "methods", label: "Payment methods" },
] as const;
type TabValue = (typeof TABS)[number]["value"];

const ReportsPage: React.FC = () => {
  const { business } = useAuth();
  const timeZone = business?.timezone ?? DEFAULT_TIME_ZONE;
  const today = todayKey(timeZone);
  const url = useUrlState();
  const period = resolvePeriod({ period: url.get("period"), month: url.get("month"), from: url.get("from"), to: url.get("to") }, today);
  const tab = (TABS.some((t) => t.value === url.get("tab")) ? url.get("tab") : "trends") as TabValue;
  const [focused, setFocused] = useState(false);
  const [taxOpen, setTaxOpen] = useState(false);

  // A fair comparison: the same days of last month for a month in progress, and so on.
  const prev = comparisonPeriod(period, today);
  const sales = useSalesRange(period.from, period.to, timeZone);
  const prevSales = useSalesRange(prev.from, prev.to, timeZone);
  const expenses = useExpenses(period.from, period.to);
  const prevExpenses = useExpenses(prev.from, prev.to);
  const credits = useCredits();
  const payments = usePaymentsInRange(period.from, period.to, timeZone);
  const months = useMonthSummary();

  const now = useMemo(() => summarizeSales(sales.data ?? []), [sales.data]);
  const before = useMemo(() => summarizeSales(prevSales.data ?? []), [prevSales.data]);
  const spent = (expenses.data ?? []).reduce((s, e) => s + toCents(e.amount), 0);
  const spentBefore = (prevExpenses.data ?? []).reduce((s, e) => s + toCents(e.amount), 0);
  const net = now.profit - spent;
  const netBefore = before.profit - spentBefore;
  const margin = marginPct(net, now.billed);
  const marginBefore = marginPct(netBefore, before.billed);
  const loading = sales.isLoading || prevSales.isLoading || expenses.isLoading;
  const comparison = prev.label;

  const content = (value: TabValue) => {
    switch (value) {
      case "trends":
        return <RevenueExpensesChart summary={months.data} today={today} timeZone={timeZone} />;
      case "receivables": {
        const buckets = agingBuckets(credits.data ?? [], today);
        const debtors = totalsBy(
          (credits.data ?? []).filter((c) => c.status !== "paid"),
          (c) => c.customer_name,
          (c) => creditOutstanding(c),
        ).slice(0, 10);
        return (
          <div className="grid gap-6 lg:grid-cols-2">
            <ReportCard title="Ageing" description="All open balances by how far past due they are (not limited to the period).">
              <BarList
                items={buckets.map((b, i) => ({
                  key: b.key,
                  label: b.label,
                  cents: b.cents,
                  hint: `${b.count} ${b.count === 1 ? "credit" : "credits"}`,
                  barClassName: i === 0 ? undefined : "bg-destructive",
                }))}
              />
            </ReportCard>
            <ReportCard title="Largest balances" description="Who owes the most right now.">
              <BarList items={debtors.map((d) => ({ key: d.key, label: d.key, cents: d.cents, hint: `${d.count} open` }))} emptyLabel="Nobody owes you anything" />
            </ReportCard>
          </div>
        );
      }
      case "customers": {
        const rows = (sales.data ?? []).filter((s) => s.customer);
        const groups = summarizeBy(rows, (s) => s.customer!.id);
        const names = new Map(rows.map((s) => [s.customer!.id, s.customer!.name]));
        const list = [...groups].sort((a, b) => b[1].billed - a[1].billed).slice(0, 15);
        return (
          <ReportCard title="Customers" description={`Named customers in ${period.label}; walk-ins aren't listed.`}>
            <SimpleTable
              head={["Customer", "Sales", "Billed", "Outstanding"]}
              rows={list.map(([id, t]) => [names.get(id), t.count, <Money key="b" cents={t.billed} />, <Money key="o" cents={t.outstanding} className={t.outstanding ? "text-destructive" : undefined} />])}
            />
          </ReportCard>
        );
      }
      case "expenses":
        return (
          <ReportCard title="Expenses by category" description={period.label}>
            <BarList
              items={totalsBy(expenses.data ?? [], (e) => e.category, (e) => toCents(e.amount)).map((c) => ({
                key: c.key,
                label: c.key,
                cents: c.cents,
                hint: `${c.count} ${c.count === 1 ? "entry" : "entries"}`,
                barClassName: "bg-[hsl(var(--chart-2))]",
              }))}
              emptyLabel="No expenses recorded in this period"
            />
          </ReportCard>
        );
      case "products": {
        const groups = summarizeBy(sales.data ?? [], (s) => s.product_id);
        const names = new Map((sales.data ?? []).map((s) => [s.product_id, s.product_name]));
        const units = new Map<string, number>();
        for (const s of sales.data ?? []) units.set(s.product_id, (units.get(s.product_id) ?? 0) + s.quantity);
        const list = [...groups].sort((a, b) => b[1].billed - a[1].billed);
        return (
          <ReportCard title="Products" description={`What sold in ${period.label}, and what it earned after cost.`}>
            <SimpleTable
              head={["Product", "Units", "Revenue", "Gross profit", "Margin"]}
              rows={list.map(([id, t]) => {
                const m = marginPct(t.profit, t.billed);
                return [names.get(id), units.get(id), <Money key="r" cents={t.billed} />, <Money key="p" cents={t.profit} />, m === null ? "—" : `${m.toFixed(1)}%`];
              })}
            />
          </ReportCard>
        );
      }
      case "methods": {
        const received = receivedByMethod(sales.data ?? [], payments.data ?? []);
        const total = Object.values(received).reduce((a, b) => a + b, 0);
        return (
          <ReportCard title="Money received by method" description={`Paid-in-full sales plus credit payments (deposits included) in ${period.label}.`}>
            <p className="-mt-2 mb-4 text-2xl font-bold">
              <Money cents={total} />
            </p>
            <BarList
              items={(Object.keys(received) as Array<keyof typeof received>)
                .map((m) => ({ key: m, label: PAYMENT_METHOD_LABELS[m], cents: received[m], hint: total ? `${Math.round((received[m] / total) * 100)}%` : undefined }))
                .sort((a, b) => b.cents - a.cents)}
            />
          </ReportCard>
        );
      }
    }
  };

  const label = TABS.find((t) => t.value === tab)!.label;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        actions={
          <>
            <div className="flex flex-wrap items-center gap-2">
              <PeriodPicker period={period} today={today} onChange={(u) => url.set(u)} />
              <Button variant="outline" onClick={() => setTaxOpen(true)} disabled={loading}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Tax export
              </Button>
            </div>
          </>
        }
      />

      <section aria-label="Key figures" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <InsightCard title="Revenue" help="Billed for sales in the period." icon={TrendingUp} value={<Money cents={now.billed} />} growth={pctChange(now.billed, before.billed)} comparisonLabel={comparison} loading={loading} />
        <InsightCard title="Outstanding" help="Still owed on the period's sales. Lower is better." icon={HandCoins} tone="destructive" value={<Money cents={now.outstanding} />} growth={pctChange(now.outstanding, before.outstanding)} higherIsBetter={false} comparisonLabel={comparison} loading={loading} />
        <InsightCard title="Expenses" help="Running costs in the period. Lower is better." icon={Wallet} tone="warning" value={<Money cents={spent} />} growth={pctChange(spent, spentBefore)} higherIsBetter={false} comparisonLabel={comparison} loading={loading} />
        <InsightCard title="Net" help="Revenue − cost of goods − expenses." icon={Receipt} tone={net >= 0 ? "success" : "destructive"} value={<Money cents={net} className={net < 0 ? "text-destructive" : undefined} />} growth={pctChange(net, netBefore)} comparisonLabel={comparison} loading={loading} />
        <InsightCard
          title="Margin"
          help="Net as a share of revenue. The trend is the change in percentage points."
          icon={Percent}
          tone="neutral"
          value={margin === null ? "—" : `${margin.toFixed(1)}%`}
          growth={pointsChange(margin, marginBefore)}
          comparisonLabel={`pts ${comparison}`}
          loading={loading}
        />
      </section>

      <Tabs value={tab} onValueChange={(v) => url.set({ tab: v }, { tab: "trends" })}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="flex h-auto flex-wrap justify-start">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <Button variant="outline" size="sm" onClick={() => setFocused(true)}>
            <Maximize2 className="mr-1.5 h-4 w-4" />
            Focus mode
          </Button>
        </div>
        {TABS.map((t) => (
          <TabsContent key={t.value} value={t.value} className="mt-4">
            {loading && t.value !== "trends" ? <Skeleton className="h-72 w-full rounded-xl" /> : content(t.value)}
          </TabsContent>
        ))}
      </Tabs>

      <TaxExportDialog
        open={taxOpen}
        onOpenChange={setTaxOpen}
        periodLabel={period.label}
        sales={sales.data ?? []}
        expenses={expenses.data ?? []}
        timeZone={timeZone}
      />

      {focused && (
        <FocusMode title={`${label} · ${period.label}`} onClose={() => setFocused(false)}>
          {content(tab)}
        </FocusMode>
      )}
    </div>
  );
};

function ReportCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="rounded-xl">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function SimpleTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  if (!rows.length) return <p className="py-3 text-sm text-muted-foreground">Nothing in this period.</p>;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {head.map((h, i) => (
              <TableHead key={h} className={i > 0 ? "text-right" : undefined}>
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, r) => (
            <TableRow key={r}>
              {row.map((cell, i) => (
                <TableCell key={i} className={i > 0 ? "text-right tabular-nums" : "font-medium"}>
                  {cell}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default ReportsPage;
