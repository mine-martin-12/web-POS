import React from "react";
import { useAuth } from "@/contexts/AuthContext";
import { DEFAULT_CURRENCY, formatMoney } from "@/lib/currency";
import { cn } from "@/lib/utils";

interface MoneyProps {
  value: number;
  compact?: boolean;
  className?: string;
}

/** An amount in the business currency. Marked `.sensitive` so privacy mode blurs it,
 *  with tabular figures so columns line up. */
export function Money({ value, compact, className }: MoneyProps) {
  const { business } = useAuth();
  return (
    <span className={cn("sensitive tabular-nums", className)}>
      {formatMoney(value, business?.currency ?? DEFAULT_CURRENCY, { compact })}
    </span>
  );
}
