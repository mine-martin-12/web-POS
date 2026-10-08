import React, { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { renderToStaticMarkup } from "react-dom/server";
import { format } from "date-fns";
import { toast } from "sonner";
import { CheckCircle2, Download, MoreHorizontal, Pencil, Plus, Printer, ShoppingCart, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useActionParam } from "@/hooks/useActionParam";
import { useSecurity } from "@/hooks/useSecurity";
import { useUrlState } from "@/hooks/useUrlState";
import { Receipt } from "@/components/receipt/Receipt";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { Money } from "@/components/common/Money";
import { DataTable, type DataTableColumn } from "@/components/common/data-table/DataTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { datedFilename, downloadCsv } from "@/lib/csv";
import { formatMoney } from "@/lib/currency";
import { sheetToCsv } from "@/lib/exports/files";
import { ExportMenu } from "@/components/common/ExportMenu";
import { DEFAULT_TIME_ZONE, dayKey, parseDayKey, todayKey } from "@/lib/dates";
import { fromCents, saleMoney, summarizeSales, type PaymentStatus } from "@/lib/finance";
import { printReceipt } from "@/utils/printUtils";
import { MonthBrowser } from "../components/MonthBrowser";
import { PaymentStatusBadge } from "../components/PaymentStatusBadge";
import { PeriodPicker } from "../components/PeriodPicker";
import { SaleFormDialog } from "../components/SaleFormDialog";
import { useDeleteSaleOptimistic, useMarkSalePaid, useMonthSummary, useProducts, useSales, useSalesRange } from "../hooks";
import { lastPrices, matchesSearch, mostCommonMethod, salesSheet } from "../lib";
import { resolvePeriod } from "../period";
import { PAYMENT_METHOD_LABELS, type PaymentMethod, type SaleRow } from "../types";

const ALL = "all";
const STATUS_LABELS: Record<PaymentStatus, string> = { paid: "Paid", partial: "Part paid", unpaid: "Unpaid" };

const SalesPage: React.FC = () => {
  const { business } = useAuth();
  const security = useSecurity();
  const timeZone = business?.timezone ?? DEFAULT_TIME_ZONE;
  const today = todayKey(timeZone);
  const url = useUrlState();

  const period = resolvePeriod(
    { period: url.get("period"), month: url.get("month"), from: url.get("from"), to: url.get("to") },
    today,
  );
  const search = url.get("q");
  const status = url.get("status", ALL) as PaymentStatus | typeof ALL;
  const method = url.get("method", ALL) as PaymentMethod | typeof ALL;
  const focus = url.get("focus") || null;

  const sales = useSalesRange(period.from, period.to, timeZone);
  const months = useMonthSummary();
  const recent = useSales(); // defaults for the form: usual method, last prices
  const products = useProducts();
  const markPaid = useMarkSalePaid();
  const remove = useDeleteSaleOptimistic();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SaleRow | null>(null);
  const [deleting, setDeleting] = useState<SaleRow[] | null>(null);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };
  useActionParam("new", openNew);

  const periodRows = useMemo(() => [...(sales.data ?? [])].reverse(), [sales.data]); // newest first
  const methodsPresent = useMemo(() => new Set(periodRows.map((s) => (s.credit ? "credit" : s.payment_method))), [periodRows]);
  const rows = useMemo(
    () =>
      periodRows
        .filter((s) => status === ALL || saleMoney(s).status === status)
        .filter((s) => method === ALL || (s.credit ? "credit" : s.payment_method) === method)
        .filter((s) => matchesSearch(s, search.trim())),
    [periodRows, status, method, search],
  );
  // Tiles are computed from exactly the rows on screen, so they always match the list.
  const totals = useMemo(() => summarizeSales(rows), [rows]);
  const defaults = useMemo(
    () => ({ method: mostCommonMethod(recent.data ?? []), prices: lastPrices(recent.data ?? []) }),
    [recent.data],
  );
  const filtered = !!search || status !== ALL || method !== ALL;

  // Deep link (?focus=<sale id>), e.g. from a notification: scroll to the row.
  useEffect(() => {
    if (!focus || !sales.data) return;
    document.getElementById(`row-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focus, sales.data]);

  const sheet = (list: SaleRow[]) => salesSheet(list, timeZone, security.canViewFinancialData);
  const exportSelected = (list: SaleRow[]) => {
    const csv = sheetToCsv(
      { businessName: business?.name ?? "Smart POS", title: "Sales (selected)", subtitle: period.label, currency: business?.currency ?? DEFAULT_CURRENCY },
      sheet(list),
    );
    downloadCsv(csv, datedFilename("sales-selected", "csv"));
  };

  const print = (sale: SaleRow) => {
    const html = renderToStaticMarkup(
      <Receipt
        sale={sale}
        business={{
          name: business?.name ?? "Smart POS",
          address: business?.address,
          phone: business?.phone,
          currency: business?.currency ?? DEFAULT_CURRENCY,
          timezone: timeZone,
        }}
      />,
    );
    if (!printReceipt(html)) {
      toast.error("Couldn't open the print window", { description: "Allow pop-ups for this site and try again." });
    }
  };

  const payInFull = (sale: SaleRow) =>
    markPaid.mutate(sale, { onSuccess: () => toast.success("Marked as paid", { description: sale.credit?.customer_name }) });

  // Rows disappear from the list immediately (optimistic) while the dialog shows
  // "Deleting…"; any the server refuses come back with an error toast.
  const confirmDelete = async () => {
    if (!deleting) return;
    const list = deleting;
    let deleted = 0;
    for (const sale of list) {
      try {
        await remove.mutateAsync(sale);
        deleted++;
      } catch {
        // reported by the mutation's onError
      }
    }
    setDeleting(null);
    if (deleted > 0) {
      toast.success(deleted === 1 ? "Sale deleted" : `${deleted} sales deleted`, {
        description: "Stock was returned and any credit removed.",
      });
    }
  };

  const actions = (sale: SaleRow) => {
    const owes = saleMoney(sale).outstanding > 0;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${sale.product_name} sale`}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {owes && (
            <DropdownMenuItem onSelect={() => payInFull(sale)}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Mark paid
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => print(sale)}>
            <Printer className="mr-2 h-4 w-4" />
            Print receipt
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setEditing(sale);
              setFormOpen(true);
            }}
          >
            <Pencil className="mr-2 h-4 w-4" />
            {security.canEditRecords ? "Edit" : "Request change"}
          </DropdownMenuItem>
          {security.canDeleteRecords && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setDeleting([sale])} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const columns: DataTableColumn<SaleRow>[] = [
    {
      id: "product",
      header: "Sale",
      sortValue: (s) => s.product_name.toLowerCase(),
      cell: (s) => (
        <div>
          <div className="font-medium">
            {s.quantity} × {s.product_name}
          </div>
          {s.description && <div className="max-w-[16rem] truncate text-xs text-muted-foreground">{s.description}</div>}
        </div>
      ),
    },
    {
      id: "customer",
      header: "Customer",
      sortValue: (s) => (s.customer?.name ?? "").toLowerCase(),
      cell: (s) => s.customer?.name ?? <span className="text-muted-foreground">Walk-in</span>,
    },
    {
      id: "total",
      header: "Total",
      align: "right",
      sortValue: (s) => saleMoney(s).billed,
      cell: (s) => <Money cents={saleMoney(s).billed} />,
    },
    { id: "payment", header: "Payment", cell: (s) => <PaymentStatusBadge sale={s} /> },
    ...(security.canViewFinancialData
      ? [
          {
            id: "profit",
            header: "Profit",
            align: "right" as const,
            sortValue: (s: SaleRow) => saleMoney(s).profit,
            cell: (s: SaleRow) => {
              const p = saleMoney(s).profit;
              return <Money cents={p} className={p < 0 ? "text-destructive" : undefined} />;
            },
          },
        ]
      : []),
    { id: "actions", header: <span className="sr-only">Actions</span>, className: "w-12", cell: actions },
  ];

  const collectedPct = totals.billed > 0 ? Math.round((totals.collected / totals.billed) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={security.canViewAllSales ? "Sales" : "My sales"}
        actions={
          <>
            <div className="flex flex-wrap gap-2">
              <Button onClick={openNew} className="sm:order-2">
                <Plus className="mr-2 h-4 w-4" />
                Record sale
              </Button>
              <ExportMenu
                filename="sales"
                title="Sales report"
                subtitle={period.label}
                disabled={!rows.length}
                className="sm:order-1"
                sheets={() => [sheet(rows)]}
                summary={() => [
                  ["Sales", String(totals.count)],
                  ["Total billed", formatMoney(fromCents(totals.billed), business?.currency)],
                  ["Collected", formatMoney(fromCents(totals.collected), business?.currency)],
                  ["Outstanding", formatMoney(fromCents(totals.outstanding), business?.currency)],
                ]}
              />
            </div>
          </>
        }
      />

      <MonthBrowser
        months={months.data}
        loading={months.isLoading}
        currentMonth={today.slice(0, 7)}
        selectedMonth={period.month}
        onSelect={(month) =>
          url.set({ month, period: null, from: null, to: null, page: null }, { month: today.slice(0, 7) })
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="space-y-2 p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-sm text-muted-foreground">Total billed · {period.label}</p>
              {!sales.isLoading && <span className="text-xs text-muted-foreground">{totals.count} sales</span>}
            </div>
            {sales.isLoading ? <Skeleton className="h-7 w-32" /> : <Money cents={totals.billed} className="block text-2xl font-bold" />}
            <Progress value={collectedPct} aria-label={`${collectedPct}% collected`} className="h-1.5" />
            <p className="text-xs text-muted-foreground">{collectedPct}% collected</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Collected</p>
            {sales.isLoading ? <Skeleton className="mt-2 h-7 w-32" /> : <Money cents={totals.collected} className="mt-1 block text-2xl font-bold text-success" />}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Outstanding</p>
            {sales.isLoading ? (
              <Skeleton className="mt-2 h-7 w-32" />
            ) : (
              <Money cents={totals.outstanding} className={`mt-1 block text-2xl font-bold ${totals.outstanding ? "text-destructive" : ""}`} />
            )}
          </CardContent>
        </Card>
      </div>
      {!sales.isLoading && totals.count > 0 && (
        <p className="-mt-2 text-xs text-muted-foreground">
          Collected <Money cents={totals.collected} /> + Outstanding <Money cents={totals.outstanding} /> = Total billed{" "}
          <Money cents={totals.billed} />
        </p>
      )}

      <DataTable<SaleRow>
        rows={rows}
        columns={columns}
        getRowId={(s) => s.id}
        loading={sales.isLoading}
        error={sales.error}
        onRetry={() => sales.refetch()}
        caption={`Sales, ${period.label}`}
        highlightId={focus}
        search={{ value: search, onChange: (v) => url.set({ q: v, page: null }), placeholder: "Product, customer or note" }}
        filtered={filtered}
        onClearFilters={() => url.set({ q: null, status: null, method: null, page: null })}
        toolbar={
          <>
            <PeriodPicker period={period} today={today} onChange={(updates) => url.set({ ...updates, page: null })} />
            <Select value={status} onValueChange={(v) => url.set({ status: v, page: null }, { status: ALL })}>
              <SelectTrigger className="h-9 w-[9rem]" aria-label="Payment status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any status</SelectItem>
                {(Object.keys(STATUS_LABELS) as PaymentStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Only worth showing when the period actually mixes payment types. */}
            {(methodsPresent.size > 1 || method !== ALL) && (
              <Select value={method} onValueChange={(v) => url.set({ method: v, page: null }, { method: ALL })}>
                <SelectTrigger className="h-9 w-[9rem]" aria-label="Payment type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Any type</SelectItem>
                  {[...methodsPresent].map((m) => (
                    <SelectItem key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m as PaymentMethod]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </>
        }
        groupBy={{
          key: (s) => dayKey(s.sale_date, timeZone),
          label: (day) => (day === today ? "Today" : format(parseDayKey(day), "EEE d MMM")),
          summary: (list) => {
            const t = summarizeSales(list);
            return (
              <span>
                {t.count} · <Money cents={t.billed} />
              </span>
            );
          },
        }}
        selectable={security.canBulkOperations}
        bulkActions={(selected, clear) => (
          <>
            <Button size="sm" variant="outline" onClick={() => exportSelected(selected)}>
              <Download className="mr-1.5 h-4 w-4" /> Export
            </Button>
            {selected.some((s) => saleMoney(s).outstanding > 0) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  selected.filter((s) => saleMoney(s).outstanding > 0).forEach((s) => markPaid.mutate(s));
                  clear();
                }}
              >
                <CheckCircle2 className="mr-1.5 h-4 w-4" /> Mark paid
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="text-destructive"
              onClick={() => {
                setDeleting(selected);
                clear();
              }}
            >
              <Trash2 className="mr-1.5 h-4 w-4" /> Delete
            </Button>
          </>
        )}
        emptyState={
          <EmptyState
            icon={ShoppingCart}
            title={period.kind === "month" && period.month === today.slice(0, 7) ? "No sales yet this month" : `No sales in ${period.label}`}
            description="Record a sale and it shows up here, grouped by day."
            action={{ label: "Record a sale", onClick: openNew }}
          />
        }
        mobileCard={(sale) => (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3 pr-6">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {sale.quantity} × {sale.product_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {format(parseDayKey(dayKey(sale.sale_date, timeZone)), "d MMM")} · {sale.customer?.name ?? "Walk-in"}
                </p>
              </div>
              <Money cents={saleMoney(sale).billed} className="font-semibold" />
            </div>
            <div className="flex items-center justify-between">
              <PaymentStatusBadge sale={sale} />
              {actions(sale)}
            </div>
          </div>
        )}
      />

      <SaleFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        products={products.data ?? []}
        sale={editing}
        defaultMethod={defaults.method}
        lastPrices={defaults.prices}
        requestMode={!security.canEditRecords}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={deleting && deleting.length > 1 ? `Delete ${deleting.length} sales?` : "Delete this sale?"}
        description={
          deleting && deleting.length === 1 ? (
            <>
              {deleting[0].quantity} × {deleting[0].product_name} (<Money value={deleting[0].total_price} />) will be
              deleted. The stock goes back to the shelf{deleting[0].credit ? " and its credit and payments are removed" : ""}.
              This can't be undone.
            </>
          ) : (
            "Their stock goes back to the shelf and any credits and payments are removed. This can't be undone."
          )
        }
        confirmLabel="Delete"
        busyLabel="Deleting…"
        destructive
        busy={remove.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
};

export default SalesPage;
