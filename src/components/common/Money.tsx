import React from "react";
import { useAuth } from "@/contexts/AuthContext";
import { DEFAULT_CURRENCY, formatMoney } from "@/lib/currency";
import { fromCents, type Cents } from "@/lib/finance";
import { cn } from "@/lib/utils";

type MoneyProps = {
  compact?: boolean;
  className?: string;
} & ({ value: number; cents?: never } | { cents: Cents; value?: never });

/** An amount in the business currency. Marked `.sensitive` so privacy mode blurs it,
 *  with tabular figures so columns line up. Pass `cents` for finance-module totals. */
export function Money({ value, cents, compact, className }: MoneyProps) {
  const { business } = useAuth();
  const amount = cents !== undefined ? fromCents(cents) : value ?? 0;
  return (
    <span className={cn("sensitive tabular-nums", className)}>
      {formatMoney(amount, business?.currency ?? DEFAULT_CURRENCY, { compact })}
    </span>
  );
}
