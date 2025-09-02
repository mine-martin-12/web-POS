import React from "react";
import { cn } from "@/lib/utils";

interface GrowthIndicatorProps {
  growth: number;
  comparisonLabel: string;
  className?: string;
}

export const GrowthIndicator: React.FC<GrowthIndicatorProps> = ({
  growth,
  comparisonLabel,
  className,
}) => {
  const formatGrowth = (value: number) => {
    if (value === 0) return "0.00%";
    const sign = value > 0 ? "+" : "";
    return `${sign}${value.toFixed(2)}%`;
  };

  const getGrowthColor = (value: number) => {
    if (value > 0) return "text-green-600 dark:text-green-400";
    if (value < 0) return "text-red-600 dark:text-red-400";
    return "text-muted-foreground";
  };

  return (
    <div className={cn("text-xs", className)}>
      <span className={getGrowthColor(growth)}>
        {formatGrowth(growth)}
      </span>
      <span className="text-muted-foreground ml-1">
        {comparisonLabel}
      </span>
    </div>
  );
};