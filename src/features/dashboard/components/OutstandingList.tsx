import React from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import { CheckCircle2, HandCoins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { Money } from "@/components/common/Money";
import { useCredits, useMarkCreditPaid } from "@/features/credits/hooks";
import { parseDayKey } from "@/lib/dates";
import { creditOutstanding } from "@/lib/finance";
import { cn } from "@/lib/utils";

const SHOWN = 6;

/** Who owes money: unpaid in red, part-paid in amber, with one-tap "paid in full". */
export function OutstandingList({ today }: { today: string }) {
  const credits = useCredits();
  const markPaid = useMarkCreditPaid();
  const open = (credits.data ?? [])
    .filter((c) => c.status !== "paid")
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, SHOWN);

  return (
    <Card className="rounded-xl">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Outstanding</CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to="/app/credits">View all</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {credits.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : open.length === 0 ? (
          <EmptyState icon={HandCoins} title="Nobody owes you anything" variant="minimal" />
        ) : (
          <ul className="divide-y">
            {open.map((c) => {
              const overdue = c.due_date < today;
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 animate-fade-in">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={cn("h-2.5 w-2.5 shrink-0 rounded-full", c.status === "unpaid" ? "bg-destructive" : "bg-warning")}
                      aria-label={c.status === "unpaid" ? "Unpaid" : "Part paid"}
                    />
                    <div className="min-w-0">
                      <Link to={`/app/credits?tab=all&focus=${c.id}`} className="block truncate font-medium hover:underline">
                        {c.customer_name}
                      </Link>
                      <p className={cn("text-xs", overdue ? "text-destructive" : "text-muted-foreground")}>
                        {overdue ? "Overdue since" : "Due"} {format(parseDayKey(c.due_date), "d MMM")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Money cents={creditOutstanding(c)} className="font-semibold" />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-success"
                      aria-label={`Mark ${c.customer_name} as paid in full`}
                      onClick={() =>
                        markPaid.mutate(c, { onSuccess: () => toast.success("Marked as paid", { description: c.customer_name }) })
                      }
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
