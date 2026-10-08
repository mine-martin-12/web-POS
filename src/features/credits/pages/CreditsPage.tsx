import React, { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { format } from "date-fns";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, HandCoins, MoreHorizontal, Pencil, Trash2, Wallet } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSecurity } from "@/hooks/useSecurity";
import { useUrlState } from "@/hooks/useUrlState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { Money } from "@/components/common/Money";
import { DataTable, type DataTableColumn } from "@/components/common/data-table/DataTable";
import { useDeleteSale } from "@/features/sales/hooks";
import { parseDayKey, todayKey } from "@/lib/dates";
import { getErrorMessage } from "@/lib/errors";
import { creditOutstanding, summarizeCredits } from "@/lib/finance";
import { cn } from "@/lib/utils";
import type { CreditListRow } from "../api";
import { EditCreditDialog } from "../components/EditCreditDialog";
import { RecordPaymentDialog } from "../components/RecordPaymentDialog";
import { useCredits, useMarkCreditPaid } from "../hooks";

type Filter = "open" | "overdue" | "paid" | "all";
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "open", label: "Open" },
  { value: "overdue", label: "Overdue" },
  { value: "paid", label: "Paid" },
  { value: "all", label: "All" },
];

const CreditsPage: React.FC = () => {
  const { business } = useAuth();
  const security = useSecurity();
  const credits = useCredits();
  const markPaid = useMarkCreditPaid();
  const removeSale = useDeleteSale();
  const today = todayKey(business?.timezone);
  const url = useUrlState();
  const search = url.get("q");
  const filter = (url.get("tab", "open") as Filter) || "open";
  const focus = url.get("focus") || null;

  const [paying, setPaying] = useState<CreditListRow | null>(null);
  const [editing, setEditing] = useState<CreditListRow | null>(null);
  const [deleting, setDeleting] = useState<CreditListRow | null>(null);

  const isOverdue = (c: CreditListRow) => c.status !== "paid" && c.due_date < today;
  const all = useMemo(() => credits.data ?? [], [credits.data]);
  const counts: Record<Filter, number> = {
    open: all.filter((c) => c.status !== "paid").length,
    overdue: all.filter(isOverdue).length,
    paid: all.filter((c) => c.status === "paid").length,
    all: all.length,
  };

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return all
      .filter((c) =>
        filter === "open" ? c.status !== "paid" : filter === "overdue" ? isOverdue(c) : filter === "paid" ? c.status === "paid" : true,
      )
      .filter(
        (c) =>
          !term || c.customer_name.toLowerCase().includes(term) || (c.sale?.product_name ?? "").toLowerCase().includes(term),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, filter, search, today]);
  // Tiles summarise exactly the rows on screen.
  const totals = useMemo(() => summarizeCredits(rows), [rows]);
  const overdueOnScreen = rows.filter(isOverdue).length;

  useEffect(() => {
    if (!focus || !credits.data) return;
    // A notification may point at a paid credit that the default tab hides.
    const target = credits.data.find((c) => c.id === focus);
    if (target && target.status === "paid" && filter !== "paid" && filter !== "all") url.set({ tab: "all" });
    document.getElementById(`row-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, credits.data]);

  const payAll = (list: CreditListRow[]) => {
    for (const c of list) {
      markPaid.mutate(c, { onSuccess: () => list.length === 1 && toast.success("Marked as paid", { description: c.customer_name }) });
    }
    if (list.length > 1) toast.success(`Marking ${list.length} credits as paid…`);
  };

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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`More actions for ${c.customer_name}`}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {c.status !== "paid" && (
            <DropdownMenuItem onSelect={() => payAll([c])}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Mark fully paid
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setEditing(c)}>
            <Pencil className="mr-2 h-4 w-4" />
            {security.canEditRecords ? "Edit customer / due date" : "Request change"}
          </DropdownMenuItem>
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
    </div>
  );

  const columns: DataTableColumn<CreditListRow>[] = [
    {
      id: "customer",
      header: "Customer",
      sortValue: (c) => c.customer_name.toLowerCase(),
      cell: (c) => (
        <div>
          <div className="font-medium">{c.customer_name}</div>
          {c.sale && (
            <div className="text-xs text-muted-foreground">
              {c.sale.quantity} × {c.sale.product_name}
            </div>
          )}
        </div>
      ),
    },
    { id: "owed", header: "Owed", align: "right", sortValue: (c) => c.amount_owed, cell: (c) => <Money value={c.amount_owed} /> },
    { id: "paid", header: "Paid", align: "right", sortValue: (c) => c.amount_paid, cell: (c) => <Money value={c.amount_paid} /> },
    {
      id: "balance",
      header: "Balance",
      align: "right",
      sortValue: (c) => creditOutstanding(c),
      cell: (c) => <Money cents={creditOutstanding(c)} className="font-semibold" />,
    },
    {
      id: "due",
      header: "Due",
      sortValue: (c) => c.due_date,
      cell: (c) => (
        <span className={cn("whitespace-nowrap", isOverdue(c) && "font-medium text-destructive")}>
          {format(parseDayKey(c.due_date), "d MMM yyyy")}
        </span>
      ),
    },
    { id: "status", header: "Status", cell: statusBadge },
    { id: "actions", header: <span className="sr-only">Actions</span>, cell: actions },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Credits" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile label="Outstanding" loading={credits.isLoading} icon={HandCoins}>
          <Money cents={totals.outstanding} className="text-2xl font-bold text-destructive" />
        </Tile>
        <Tile label="Collected so far" loading={credits.isLoading} icon={Wallet}>
          <Money cents={totals.paid} className="text-2xl font-bold text-success" />
        </Tile>
        <Tile label="Overdue" loading={credits.isLoading} icon={AlertTriangle}>
          <span className="text-2xl font-bold tabular-nums">{overdueOnScreen}</span>
        </Tile>
      </div>
      {!credits.isLoading && totals.count > 0 && (
        <p className="-mt-2 text-xs text-muted-foreground">
          Collected <Money cents={totals.paid} /> + Outstanding <Money cents={totals.outstanding} /> = Total owed{" "}
          <Money cents={totals.owed} />
        </p>
      )}

      <DataTable<CreditListRow>
        rows={rows}
        columns={columns}
        getRowId={(c) => c.id}
        loading={credits.isLoading}
        error={credits.error}
        onRetry={() => credits.refetch()}
        caption="Credit accounts"
        highlightId={focus}
        rowClassName={(c) => (isOverdue(c) ? "bg-destructive/5" : undefined)}
        search={{ value: search, onChange: (v) => url.set({ q: v, page: null }), placeholder: "Customer or product" }}
        filtered={!!search}
        onClearFilters={() => url.set({ q: null, page: null })}
        toolbar={
          <Tabs value={filter} onValueChange={(v) => url.set({ tab: v, page: null }, { tab: "open" })}>
            <TabsList className="flex-wrap">
              {FILTERS.map((f) => (
                <TabsTrigger key={f.value} value={f.value}>
                  {f.label} ({counts[f.value]})
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
        selectable={security.canBulkOperations}
        bulkActions={(selected, clear) =>
          selected.some((c) => c.status !== "paid") ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                payAll(selected.filter((c) => c.status !== "paid"));
                clear();
              }}
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4" /> Mark paid
            </Button>
          ) : null
        }
        emptyState={
          <EmptyState
            icon={HandCoins}
            title={filter === "overdue" ? "Nothing overdue" : filter === "open" ? "Nobody owes you anything" : "No credits yet"}
            description="Sales made on credit or part payment appear here until they're paid."
          />
        }
        mobileCard={(c) => (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3 pr-6">
              <div className="min-w-0">
                <p className="truncate font-medium">{c.customer_name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {c.sale ? `${c.sale.quantity} × ${c.sale.product_name} · ` : ""}due {format(parseDayKey(c.due_date), "d MMM")}
                </p>
              </div>
              <Money cents={creditOutstanding(c)} className="font-semibold" />
            </div>
            <div className="flex items-center justify-between">
              {statusBadge(c)}
              {actions(c)}
            </div>
          </div>
        )}
      />

      <RecordPaymentDialog credit={paying} onOpenChange={(open) => !open && setPaying(null)} />
      <EditCreditDialog
        credit={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        requestMode={!security.canEditRecords}
      />
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
