import React from "react";
import type { TooltipProps } from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { DEFAULT_CURRENCY, formatMoney } from "@/lib/currency";

/** Tooltip card for money charts: label, then each series with its swatch and value. */
export function MoneyTooltip({ active, payload, label }: TooltipProps<number, string>) {
  const { business } = useAuth();
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <p className="mb-1 font-medium">{payload[0]?.payload?.tooltipLabel ?? label}</p>
      <ul className="space-y-0.5">
        {payload.map((item) => (
          <li key={String(item.dataKey)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} aria-hidden />
              {item.name}
            </span>
            <span className="font-medium tabular-nums">
              {formatMoney(Number(item.value ?? 0), business?.currency ?? DEFAULT_CURRENCY)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

