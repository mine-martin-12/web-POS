import React from "react";
import { Money } from "@/components/common/Money";
import type { Cents } from "@/lib/finance";
import { cn } from "@/lib/utils";

export interface BarListItem {
  key: string;
  label: React.ReactNode;
  cents: Cents;
  hint?: React.ReactNode;
  /** Tailwind background class for the bar; defaults to the first chart colour. */
  barClassName?: string;
}

/** Ranked horizontal bars with amounts: a readable alternative to a bar chart for a
 *  short list of categories. Bars are relative to the largest item. */
export function BarList({ items, emptyLabel = "Nothing to show" }: { items: BarListItem[]; emptyLabel?: string }) {
  if (!items.length) return <p className="py-3 text-sm text-muted-foreground">{emptyLabel}</p>;
  const max = Math.max(...items.map((i) => Math.abs(i.cents)), 1);
  return (
    <ol className="space-y-3">
      {items.map((item, i) => (
        <li key={item.key} className="space-y-1 animate-fade-in" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium">{item.label}</span>
            <Money cents={item.cents} className="shrink-0" />
          </div>
          <div className="h-1.5 rounded-full bg-muted" aria-hidden>
            <div
              className={cn("h-1.5 rounded-full bg-[hsl(var(--chart-1))]", item.barClassName)}
              style={{ width: `${(Math.abs(item.cents) / max) * 100}%` }}
            />
          </div>
          {item.hint && <p className="text-xs text-muted-foreground">{item.hint}</p>}
        </li>
      ))}
    </ol>
  );
}
