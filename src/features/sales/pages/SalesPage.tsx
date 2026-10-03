import React, { useMemo, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { format } from "date-fns";
import { toast } from "sonner";
import { Download, MoreHorizontal, Pencil, Plus, Printer, Search, ShoppingCart, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useActionParam } from "@/hooks/useActionParam";
import { useSecurity } from "@/hooks/useSecurity";
import { Receipt } from "@/components/receipt/Receipt";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Money } from "@/components/common/Money";
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
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { datedFilename, downloadCsv, toCsv } from "@/lib/csv";
import { DEFAULT_TIME_ZONE, dayKey, parseDayKey } from "@/lib/dates";
import { getErrorMessage } from "@/lib/errors";
import { saleMoney, summarizeSales } from "@/lib/finance";
import { printReceipt } from "@/utils/printUtils";
import { PaymentStatusBadge } from "../components/PaymentStatusBadge";
import { SaleFormDialog } from "../components/SaleFormDialog";
import { useDeleteSale, useProducts, useSales } from "../hooks";
import { lastPrices, matchesSearch, mostCommonMethod, saleCsvColumns } from "../lib";
import type { SaleRow } from "../types";

const SalesPage: React.FC = () => {
  const { business } = useAuth();
  const security = useSecurity();
  const timeZone = business?.timezone ?? DEFAULT_TIME_ZONE;
  const sales = useSales();
  const products = useProducts();
  const remove = useDeleteSale();

  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SaleRow | null>(null);
  const [deleting, setDeleting] = useState<SaleRow | null>(null);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };
  useActionParam("new", openNew);

  const rows = useMemo(() => (sales.data ?? []).filter((s) => matchesSearch(s, search.trim())), [sales.data, search]);
  // Tiles are computed from exactly the rows on screen, so they always match the list.
  const totals = useMemo(() => summarizeSales(rows), [rows]);
  const defaults = useMemo(
    () => ({ method: mostCommonMethod(sales.data ?? []), prices: lastPrices(sales.data ?? []) }),
    [sales.data],
  );

  const exportCsv = () => {
    const csv = toCsv(rows, saleCsvColumns(timeZone, security.canViewFinancialData), [
      [business?.name ?? "Smart POS"],
      ["Sales export", format(new Date(), "PPpp")],
      ["Currency", business?.currency ?? DEFAULT_CURRENCY],
    ]);
    downloadCsv(csv, datedFilename("sales", "csv"));
    toast.success("Export ready", { description: `${rows.length} sales` });
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

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast.success("Sale deleted", { description: "Its stock was returned and any credit removed." });
      setDeleting(null);
    } catch (error) {
      toast.error("Couldn't delete the sale", { description: getErrorMessage(error) });
    }
  };

  const actions = (sale: SaleRow) => (
    <SaleActions
      sale={sale}
      canEdit={security.canEditRecords}
      canDelete={security.canDeleteRecords}
      onPrint={print}
      onEdit={(s) => {
        setEditing(s);
        setFormOpen(true);
      }}
      onDelete={setDeleting}
    />
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Sales</h1>
          <p className="text-muted-foreground">
            {security.canViewAllSales ? "Every sale in your business." : "The sales you recorded."}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={openNew} className="w-full sm:order-2 sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Record sale
          </Button>
          <Button variant="outline" onClick={exportCsv} disabled={!rows.length} className="w-full sm:order-1 sm:w-auto">
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryTile label="Total billed" cents={totals.billed} loading={sales.isLoading} hint={`${totals.count} sales`} />
        <SummaryTile label="Collected" cents={totals.collected} loading={sales.isLoading} tone="text-success" />
        <SummaryTile label="Outstanding" cents={totals.outstanding} loading={sales.isLoading} tone="text-destructive" />
      </div>
      {!sales.isLoading && totals.count > 0 && (
        <p className="-mt-2 text-xs text-muted-foreground">
          Collected <Money cents={totals.collected} /> + Outstanding <Money cents={totals.outstanding} /> = Total billed{" "}
          <Money cents={totals.billed} />
        </p>
      )}

      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <CardTitle>Sales history</CardTitle>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              placeholder="Product, customer or note"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              aria-label="Search sales"
            />
          </div>
        </CardHeader>
        <CardContent>
          {sales.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : sales.isError ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">Couldn't load sales. {getErrorMessage(sales.error)}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => sales.refetch()}>
                Try again
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <ShoppingCart className="h-10 w-10 text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">
                {search ? `No sales match "${search}".` : "No sales yet. Record your first sale to see it here."}
              </p>
              {!search && (
                <Button variant="outline" size="sm" onClick={openNew}>
                  Record a sale
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Payment</TableHead>
                      {security.canViewFinancialData && <TableHead className="text-right">Profit</TableHead>}
                      <TableHead className="w-12">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((sale) => {
                      const m = saleMoney(sale);
                      return (
                        <TableRow key={sale.id}>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {format(parseDayKey(dayKey(sale.sale_date, timeZone)), "d MMM yyyy")}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{sale.product_name}</div>
                            {sale.description && (
                              <div className="max-w-[16rem] truncate text-xs text-muted-foreground">{sale.description}</div>
                            )}
                          </TableCell>
                          <TableCell>{sale.customer?.name ?? <span className="text-muted-foreground">Walk-in</span>}</TableCell>
                          <TableCell className="text-right tabular-nums">{sale.quantity}</TableCell>
                          <TableCell className="text-right">
                            <Money cents={m.billed} />
                          </TableCell>
                          <TableCell>
                            <PaymentStatusBadge sale={sale} />
                          </TableCell>
                          {security.canViewFinancialData && (
                            <TableCell className="text-right">
                              <Money cents={m.profit} className={m.profit < 0 ? "text-destructive" : undefined} />
                            </TableCell>
                          )}
                          <TableCell>{actions(sale)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <ul className="space-y-3 md:hidden">
                {rows.map((sale) => (
                  <li key={sale.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {sale.quantity} × {sale.product_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(parseDayKey(dayKey(sale.sale_date, timeZone)), "d MMM")} ·{" "}
                          {sale.customer?.name ?? "Walk-in"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Money cents={saleMoney(sale).billed} className="font-semibold" />
                        {actions(sale)}
                      </div>
                    </div>
                    <div className="mt-2">
                      <PaymentStatusBadge sale={sale} />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

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
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this sale?"
        description={
          deleting ? (
            <>
              {deleting.quantity} × {deleting.product_name} (<Money value={deleting.total_price} />) will be deleted.
              The stock goes back to the shelf{deleting.credit ? " and its credit and payments are removed" : ""}. This
              can't be undone.
            </>
          ) : null
        }
        confirmLabel="Delete sale"
        busyLabel="Deleting…"
        destructive
        busy={remove.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
};

function SummaryTile({
  label,
  cents,
  loading,
  hint,
  tone,
}: {
  label: string;
  cents: number;
  loading: boolean;
  hint?: string;
  tone?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        {loading ? (
          <Skeleton className="mt-2 h-7 w-32" />
        ) : (
          <Money cents={cents} className={`mt-1 block text-2xl font-bold ${tone ?? ""}`} />
        )}
        {hint && !loading && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function SaleActions({
  sale,
  canEdit,
  canDelete,
  onPrint,
  onEdit,
  onDelete,
}: {
  sale: SaleRow;
  canEdit: boolean;
  canDelete: boolean;
  onPrint: (s: SaleRow) => void;
  onEdit: (s: SaleRow) => void;
  onDelete: (s: SaleRow) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Actions for ${sale.product_name} sale`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onPrint(sale)}>
          <Printer className="mr-2 h-4 w-4" />
          Print receipt
        </DropdownMenuItem>
        {canEdit && (
          <DropdownMenuItem onSelect={() => onEdit(sale)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
        )}
        {canDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onDelete(sale)} className="text-destructive focus:text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default SalesPage;
