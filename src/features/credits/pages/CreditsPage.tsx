import React, { useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { AlertTriangle, HandCoins, MoreHorizontal, Pencil, Search, Trash2, Wallet } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSecurity } from "@/hooks/useSecurity";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Money } from "@/components/common/Money";
import { useDeleteSale } from "@/features/sales/hooks";
import { parseDayKey, todayKey } from "@/lib/dates";
import { getErrorMessage } from "@/lib/errors";
import { creditOutstanding, summarizeCredits } from "@/lib/finance";
import { cn } from "@/lib/utils";
import type { CreditListRow } from "../api";
import { EditCreditDialog } from "../components/EditCreditDialog";
import { RecordPaymentDialog } from "../components/RecordPaymentDialog";
import { useCredits } from "../hooks";

type Filter = "open" | "overdue" | "paid" | "all";

const CreditsPage: React.FC = () => {
  const { business } = useAuth();
  const security = useSecurity();
  const credits = useCredits();
  const removeSale = useDeleteSale();
  const today = todayKey(business?.timezone);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("open");
  const [paying, setPaying] = useState<CreditListRow | null>(null);
  const [editing, setEditing] = useState<CreditListRow | null>(null);
  const [deleting, setDeleting] = useState<CreditListRow | null>(null);

  const isOverdue = (c: CreditListRow) => c.status !== "paid" && c.due_date < today;
  const counts = useMemo(() => {
    const all = credits.data ?? [];
    return {
      open: all.filter((c) => c.status !== "paid").length,
      overdue: all.filter(isOverdue).length,
      paid: all.filter((c) => c.status === "paid").length,
      all: all.length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credits.data, today]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (credits.data ?? [])
      .filter((c) =>
        filter === "open" ? c.status !== "paid" : filter === "overdue" ? isOverdue(c) : filter === "paid" ? c.status === "paid" : true,
      )
      .filter(
        (c) =>
          !term || c.customer_name.toLowerCase().includes(term) || (c.sale?.product_name ?? "").toLowerCase().includes(term),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credits.data, filter, search, today]);
  // Tiles summarise exactly the rows on screen.
  const totals = useMemo(() => summarizeCredits(rows), [rows]);

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await removeSale.mutateAsync(deleting.sale_id);
      toast.success("Sale and credit deleted", { description: deleting.customer_name });
      setDeleting(null);
    } catch (error) {
      toast.error("Couldn't delete", { description: getErrorMessage(error) });
    }
  };

  const statusBadge = (c: CreditListRow) =>
    c.status === "paid" ? (
      <Badge variant="outline" className="border-success/30 bg-success/15 text-success">
        Paid
      </Badge>
    ) : isOverdue(c) ? (
      <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
        Overdue
      </Badge>
    ) : c.status === "partially_paid" ? (
      <Badge variant="outline" className="border-warning/40 bg-warning/15">
        Part paid
      </Badge>
    ) : (
      <Badge variant="outline">Unpaid</Badge>
    );

  const actions = (c: CreditListRow) => (
    <div className="flex items-center justify-end gap-1">
      {c.status !== "paid" && (
        <Button size="sm" variant="outline" onClick={() => setPaying(c)}>
          <Wallet className="mr-1.5 h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Record payment</span>
          <span className="sm:hidden">Pay</span>
        </Button>
      )}
      {(security.canEditRecords || security.canDeleteRecords) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`More actions for ${c.customer_name}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {security.canEditRecords && (
              <DropdownMenuItem onSelect={() => setEditing(c)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit customer / due date
              </DropdownMenuItem>
            )}
            {security.canDeleteRecords && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setDeleting(c)} className="text-destructive focus:text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete sale
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Credits</h1>
        <p className="text-muted-foreground">Customers who owe you, and the payments they've made.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile label="Outstanding" loading={credits.isLoading} icon={HandCoins}>
          <Money cents={totals.outstanding} className="text-2xl font-bold text-destructive" />
        </Tile>
        <Tile label="Collected so far" loading={credits.isLoading} icon={Wallet}>
          <Money cents={totals.paid} className="text-2xl font-bold text-success" />
        </Tile>
        <Tile label="Overdue" loading={credits.isLoading} icon={AlertTriangle}>
          <span className="text-2xl font-bold tabular-nums">{counts.overdue}</span>
        </Tile>
      </div>
      {!credits.isLoading && totals.count > 0 && (
        <p className="-mt-2 text-xs text-muted-foreground">
          Collected <Money cents={totals.paid} /> + Outstanding <Money cents={totals.outstanding} /> = Total owed{" "}
          <Money cents={totals.owed} />
        </p>
      )}

      <Card>
        <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between lg:space-y-0">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <TabsList className="flex-wrap">
              <TabsTrigger value="open">Open ({counts.open})</TabsTrigger>
              <TabsTrigger value="overdue">Overdue ({counts.overdue})</TabsTrigger>
              <TabsTrigger value="paid">Paid ({counts.paid})</TabsTrigger>
              <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative w-full lg:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              placeholder="Customer or product"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              aria-label="Search credits"
            />
          </div>
        </CardHeader>
        <CardContent>
          <CardTitle className="sr-only">Credit accounts</CardTitle>
          {credits.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : credits.isError ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">Couldn't load credits.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => credits.refetch()}>
                Try again
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <HandCoins className="h-10 w-10 text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">
                {search
                  ? `No credits match "${search}".`
                  : filter === "overdue"
                    ? "Nothing overdue. Nice."
                    : filter === "open"
                      ? "Nobody owes you anything right now."
                      : "No credits yet. Sales made on credit or part payment appear here."}
              </p>
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>For</TableHead>
                      <TableHead className="text-right">Owed</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((c) => (
                      <TableRow key={c.id} className={cn(isOverdue(c) && "bg-destructive/5")}>
                        <TableCell className="font-medium">{c.customer_name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {c.sale ? `${c.sale.quantity} × ${c.sale.product_name}` : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Money value={c.amount_owed} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Money value={c.amount_paid} />
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          <Money cents={creditOutstanding(c)} />
                        </TableCell>
                        <TableCell className={cn("whitespace-nowrap", isOverdue(c) && "font-medium text-destructive")}>
                          {format(parseDayKey(c.due_date), "d MMM yyyy")}
                        </TableCell>
                        <TableCell>{statusBadge(c)}</TableCell>
                        <TableCell>{actions(c)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <ul className="space-y-3 md:hidden">
                {rows.map((c) => (
                  <li key={c.id} className={cn("rounded-lg border p-3", isOverdue(c) && "border-destructive/40")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{c.customer_name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.sale ? `${c.sale.quantity} × ${c.sale.product_name} · ` : ""}due{" "}
                          {format(parseDayKey(c.due_date), "d MMM")}
                        </p>
                      </div>
                      <Money cents={creditOutstanding(c)} className="font-semibold" />
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      {statusBadge(c)}
                      {actions(c)}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <RecordPaymentDialog credit={paying} onOpenChange={(open) => !open && setPaying(null)} />
      <EditCreditDialog credit={editing} onOpenChange={(open) => !open && setEditing(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this sale and its credit?"
        description={`The sale to ${deleting?.customer_name ?? ""}, its balance and its payment history will be deleted, and the stock returned. This can't be undone.`}
        confirmLabel="Delete sale"
        busyLabel="Deleting…"
        destructive
        busy={removeSale.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
};

function Tile({
  label,
  icon: Icon,
  loading,
  children,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between p-4">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <div className="mt-1">{loading ? <Skeleton className="h-7 w-28" /> : children}</div>
        </div>
        <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
      </CardContent>
    </Card>
  );
}

export default CreditsPage;
