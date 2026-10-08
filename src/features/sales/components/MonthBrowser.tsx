import { FillRow } from "@/components/common/FillRow";
import React, { useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Money } from "@/components/common/Money";
import { cn } from "@/lib/utils";
import type { MonthSummary } from "../api";
import { monthLabel } from "../period";

interface MonthBrowserProps {
  months: MonthSummary[] | undefined;
  loading: boolean;
  currentMonth: string;
  /** The month being viewed, or null when a preset/custom range is active. */
  selectedMonth: string | null;
  onSelect: (month: string) => void;
}

/** Month-first browsing: this month up front, earlier months in a collapsible archive. */
export function MonthBrowser({ months, loading, currentMonth, selectedMonth, onSelect }: MonthBrowserProps) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const current = months?.find((m) => m.month === currentMonth);
  const archive = (months ?? []).filter((m) => m.month !== currentMonth);
  const viewingCurrent = selectedMonth === currentMonth;

  return (
    <section aria-label="Browse by month" className="space-y-3">
      <button
        type="button"
        onClick={() => onSelect(currentMonth)}
        className={cn(
          "flex w-full flex-col gap-3 rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:hover:translate-y-0 sm:flex-row sm:items-center sm:justify-between",
          viewingCurrent ? "border-primary/40 bg-gradient-to-r from-primary/10 to-accent/10" : "bg-card",
        )}
        aria-pressed={viewingCurrent}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-primary text-white">
            <CalendarDays className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">This month</p>
            <p className="font-semibold">{monthLabel(currentMonth)}</p>
          </div>
        </div>
        {loading ? (
          <Skeleton className="h-6 w-56" />
        ) : (
          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Sales</dt>
              <dd className="font-semibold tabular-nums">{current?.sales_count ?? 0}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Revenue</dt>
              <dd className="font-semibold">
                <Money value={current?.billed ?? 0} />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Outstanding</dt>
              <dd className={cn("font-semibold", (current?.outstanding ?? 0) > 0 && "text-destructive")}>
                <Money value={current?.outstanding ?? 0} />
              </dd>
            </div>
          </dl>
        )}
      </button>

      {archive.length > 0 && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setArchiveOpen((o) => !o)}
            aria-expanded={archiveOpen}
            className="text-muted-foreground"
          >
            <ChevronDown className={cn("mr-1 h-4 w-4 transition-transform", !archiveOpen && "-rotate-90")} aria-hidden />
            Archive ({archive.length} {archive.length === 1 ? "month" : "months"})
          </Button>
          {archiveOpen && (
            <FillRow as="ul" layout="lg-4" className="mt-2">
              {archive.map((m, i) => (
                <div key={m.month} className="animate-fade-in" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
                  <button
                    type="button"
                    onClick={() => onSelect(m.month)}
                    aria-pressed={selectedMonth === m.month}
                    className={cn(
                      "w-full rounded-lg border p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:hover:translate-y-0",
                      selectedMonth === m.month ? "border-primary bg-primary/5" : "bg-card",
                    )}
                  >
                    <p className="font-medium">{monthLabel(m.month)}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.sales_count} {m.sales_count === 1 ? "sale" : "sales"}
                    </p>
                    <div className="mt-2 flex items-baseline justify-between gap-2 text-sm">
                      <Money value={m.billed} className="font-semibold" />
                      {m.outstanding > 0 && <Money value={m.outstanding} className="text-xs text-destructive" />}
                    </div>
                  </button>
                </div>
              ))}
            </FillRow>
          )}
        </div>
      )}
    </section>
  );
}
