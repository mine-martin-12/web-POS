import React from "react";
import { cn } from "@/lib/utils";

interface GrowthIndicatorProps {
  /** Percentage change; null when the previous period had nothing to compare against. */
  growth: number | null;
  comparisonLabel: string;
  className?: string;
}

export const GrowthIndicator: React.FC<GrowthIndicatorProps> = ({ growth, comparisonLabel, className }) => {
  const label =
    growth === null ? "New" : growth === 0 ? "0%" : `${growth > 0 ? "+" : ""}${growth.toFixed(1)}%`;
  const color =
    growth === null || growth === 0
      ? "text-muted-foreground"
      : growth > 0
        ? "text-success"
        : "text-destructive";
  return (
    <div className={cn("text-xs", className)}>
      <span className={cn("tabular-nums", color)}>{label}</span>
      <span className="ml-1 text-muted-foreground">{comparisonLabel}</span>
    </div>
  );
};
