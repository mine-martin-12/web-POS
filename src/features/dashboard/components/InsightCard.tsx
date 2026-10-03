import React from "react";
import { HelpCircle, type LucideIcon } from "lucide-react";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GrowthIndicator } from "@/components/common/GrowthIndicator";
import { cn } from "@/lib/utils";

export type InsightTone = "primary" | "success" | "warning" | "destructive" | "neutral";

const TONES: Record<InsightTone, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/20 text-warning-foreground dark:text-warning",
  destructive: "bg-destructive/10 text-destructive",
  neutral: "bg-muted text-muted-foreground",
};

interface InsightCardProps {
  title: string;
  help: string;
  icon: LucideIcon;
  tone?: InsightTone;
  value: React.ReactNode;
  growth?: number | null;
  comparisonLabel?: string;
  /** Growth is "good" when the number goes up (revenue) or down (outstanding). */
  higherIsBetter?: boolean;
  sparkline?: number[];
  loading?: boolean;
}

/** One KPI: icon tile coloured by status, help tooltip, value, trend, optional sparkline. */
export function InsightCard({
  title,
  help,
  icon: Icon,
  tone = "primary",
  value,
  growth,
  comparisonLabel,
  higherIsBetter = true,
  sparkline,
  loading,
}: InsightCardProps) {
  return (
    <Card className="group rounded-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg", TONES[tone])}>
              <Icon className="h-[18px] w-[18px]" aria-hidden />
            </span>
            <span className="text-sm font-medium text-muted-foreground">{title}</span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`About ${title}`}>
                <HelpCircle className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{help}</TooltipContent>
          </Tooltip>
        </div>
        {loading ? (
          <Skeleton className="h-8 w-32" />
        ) : (
          <div className="text-2xl font-bold tracking-tight">{value}</div>
        )}
        <div className="flex items-end justify-between gap-2">
          {growth !== undefined && comparisonLabel && !loading ? (
            <GrowthIndicator growth={higherIsBetter || growth === null ? growth : -growth} comparisonLabel={comparisonLabel} />
          ) : (
            <span />
          )}
          {sparkline && sparkline.length > 1 && !loading && (
            <div className="h-8 w-24" aria-hidden>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sparkline.map((v, i) => ({ i, v }))}>
                  <Line type="monotone" dataKey="v" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
