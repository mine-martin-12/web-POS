import React, { useMemo, useState } from "react";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Money } from "@/components/common/Money";
import { useIsMobile } from "@/hooks/use-mobile";
import { useExpenses } from "@/features/expenses/hooks";
import { useSalesRange } from "@/features/sales/hooks";
import { daysInMonth, dayKey, eachDayKey, parseDayKey } from "@/lib/dates";
import { fromCents, saleMoney, toCents } from "@/lib/finance";
import { buildMonthlySeries, expensesByMonth, lastMonths, seriesStats, type MonthPoint } from "../analytics";
import type { MonthSummary } from "@/features/sales/api";
import { compactNumber } from "@/lib/currency";
import { MoneyTooltip } from "./ChartTooltip";

const REVENUE = "hsl(var(--chart-1))";
const EXPENSES = "hsl(var(--chart-2))";
const NET = "hsl(var(--chart-3))";

interface Props {
  summary: MonthSummary[] | undefined;
  today: string;
  timeZone: string;
}

/** Admin: revenue vs expenses by month (6/12 months), net line with a zero line when
 *  there's a loss; click a month to drill into its days. */
export function RevenueExpensesChart({ summary, today, timeZone }: Props) {
  const isMobile = useIsMobile();
  const [span, setSpan] = useState<"6" | "12">("6");
  const [drill, setDrill] = useState<string | null>(null);
  const months = useMemo(() => lastMonths(today.slice(0, 7), Number(span)), [today, span]);
  const expenses = useExpenses(`${months[0]}-01`, today);
  const points = useMemo(
    () => (summary && expenses.data ? buildMonthlySeries(months, summary, expensesByMonth(expenses.data), today) : null),
    [summary, expenses.data, months, today],
  );
  const stats = points ? seriesStats(points) : null;
  const hasLoss = points?.some((p) => p.net < 0);

  return (
    <Card className="rounded-xl">
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base">{drill ? format(parseDayKey(`${drill}-01`), "MMMM yyyy") : "Revenue vs expenses"}</CardTitle>
          <CardDescription>
            {drill ? "Daily revenue and expenses" : "Net = revenue − cost of goods − expenses. Click a month for its days."}
          </CardDescription>
        </div>
        {drill ? (
          <Button variant="outline" size="sm" onClick={() => setDrill(null)}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> All months
          </Button>
        ) : (
          <ToggleGroup type="single" size="sm" variant="outline" value={span} onValueChange={(v) => v && setSpan(v as "6" | "12")} aria-label="Months shown">
            <ToggleGroupItem value="6">6m</ToggleGroupItem>
            <ToggleGroupItem value="12">12m</ToggleGroupItem>
          </ToggleGroup>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {drill ? (
          <DailyBars month={drill} timeZone={timeZone} expenses={expenses.data ?? []} />
        ) : !points ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={points.map((p) => ({ ...p, tooltipLabel: format(parseDayKey(`${p.month}-01`), "MMMM yyyy") }))}
                  barGap={2}
                  onClick={(state) => {
                    const month = (state?.activePayload?.[0]?.payload as MonthPoint | undefined)?.month;
                    if (month) setDrill(month);
                  }}
                  className="cursor-pointer"
                >
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={isMobile ? 36 : 48}
                    tickFormatter={compactNumber}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  />
                  <Tooltip content={<MoneyTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
                  <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
                  {hasLoss && <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeOpacity={0.4} />}
                  <Bar dataKey="revenue" name="Revenue" fill={REVENUE} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="expenses" name="Expenses" fill={EXPENSES} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Line dataKey="net" name="Net" stroke={NET} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: "hsl(var(--card))" }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            {stats && stats.total > 0 && (
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">Best month</dt>
                  <dd className="font-medium">
                    {stats.best ? format(parseDayKey(`${stats.best.month}-01`), "MMM yyyy") : "—"} ·{" "}
                    <Money value={stats.best?.net ?? 0} />
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Average net per month</dt>
                  <dd className="font-medium">
                    <Money value={stats.averageNet} className={stats.averageNet < 0 ? "text-destructive" : undefined} />
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Profitable months</dt>
                  <dd className="font-medium tabular-nums">
                    {stats.profitable}/{stats.total}
                  </dd>
                </div>
              </dl>
            )}
            {points.at(-1)?.projectedNet != null && (
              <p className="text-xs text-muted-foreground">
                At this month's pace, net would reach <Money value={points.at(-1)!.projectedNet!} /> by month end.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DailyBars({ month, timeZone, expenses }: { month: string; timeZone: string; expenses: Array<{ expense_date: string; amount: number }> }) {
  const to = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const sales = useSalesRange(`${month}-01`, to, timeZone);
  const data = useMemo(() => {
    if (!sales.data) return null;
    const revenue = new Map<string, number>();
    for (const s of sales.data) {
      const day = dayKey(s.sale_date, timeZone);
      revenue.set(day, (revenue.get(day) ?? 0) + saleMoney(s).billed);
    }
    const spent = new Map<string, number>();
    for (const e of expenses) if (e.expense_date.startsWith(month)) spent.set(e.expense_date, (spent.get(e.expense_date) ?? 0) + toCents(e.amount));
    return eachDayKey(`${month}-01`, to).map((day) => ({
      day: day.slice(8),
      tooltipLabel: format(parseDayKey(day), "EEE d MMM"),
      revenue: fromCents(revenue.get(day) ?? 0),
      expenses: fromCents(spent.get(day) ?? 0),
    }));
  }, [sales.data, expenses, month, to, timeZone]);

  if (!data) return <Skeleton className="h-64 w-full" />;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={2}>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="day" tickLine={false} axisLine={false} interval="preserveStartEnd" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
          <YAxis tickLine={false} axisLine={false} width={40} tickFormatter={compactNumber} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
          <Tooltip content={<MoneyTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
          <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="revenue" name="Revenue" fill={REVENUE} radius={[4, 4, 0, 0]} />
          <Bar dataKey="expenses" name="Expenses" fill={EXPENSES} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
