import React from "react";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { compactNumber } from "@/lib/currency";
import { MoneyTooltip } from "./ChartTooltip";

export interface TrendPoint {
  date: string;
  tooltipLabel: string;
  billed: number;
  collected: number;
}

/** Daily billed vs collected over the selected period, with a crosshair tooltip. */
export function TrendChart({ data, loading, periodLabel }: { data: TrendPoint[] | null; loading: boolean; periodLabel: string }) {
  return (
    <Card className="rounded-xl">
      <CardHeader>
        <CardTitle className="text-base">Daily sales</CardTitle>
        <CardDescription>{periodLabel}: billed and collected each day</CardDescription>
      </CardHeader>
      <CardContent>
        {loading || !data ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="billedFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={compactNumber} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <Tooltip content={<MoneyTooltip />} cursor={{ stroke: "hsl(var(--muted-foreground))", strokeDasharray: "3 3" }} />
                <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="billed" name="Billed" stroke="hsl(var(--chart-1))" strokeWidth={2} fill="url(#billedFill)" activeDot={{ r: 4 }} />
                <Area type="monotone" dataKey="collected" name="Collected" stroke="hsl(var(--chart-3))" strokeWidth={2} fill="transparent" activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
