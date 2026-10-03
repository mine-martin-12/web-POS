import React, { useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Archive, Download, MoreHorizontal, Package, PackagePlus, Pencil, Plus, Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useActionParam } from "@/hooks/useActionParam";
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
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Money } from "@/components/common/Money";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { datedFilename, downloadCsv, toCsv } from "@/lib/csv";
import { getErrorMessage } from "@/lib/errors";
import { toCents } from "@/lib/finance";
import { LOW_STOCK_THRESHOLD, type Product } from "../api";
import { AddStockDialog } from "../components/AddStockDialog";
import { ProductFormDialog } from "../components/ProductFormDialog";
import { useArchiveProduct, useProducts } from "../hooks";

function stockBadge(stock: number) {
  if (stock <= 0) return <Badge variant="destructive">Out of stock</Badge>;
  if (stock < LOW_STOCK_THRESHOLD)
    return (
      <Badge variant="outline" className="border-warning/50 bg-warning/15">
        Low · {stock}
      </Badge>
    );
  return <Badge variant="secondary">{stock} in stock</Badge>;
}

const ProductsPage: React.FC = () => {
  const { business } = useAuth();
  const security = useSecurity();
  const products = useProducts();
  const archive = useArchiveProduct();
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [restocking, setRestocking] = useState<Product | null>(null);
  const [archiving, setArchiving] = useState<Product | null>(null);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };
  useActionParam("new", openNew);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (products.data ?? []).filter(
      (p) => !term || p.name.toLowerCase().includes(term) || p.description.toLowerCase().includes(term),
    );
  }, [products.data, search]);
  const stockValue = useMemo(() => rows.reduce((sum, p) => sum + p.stock_quantity * toCents(p.buying_price), 0), [rows]);
  const lowCount = rows.filter((p) => p.stock_quantity < LOW_STOCK_THRESHOLD).length;

  const exportCsv = () => {
    const csv = toCsv(
      rows,
      [
        { header: "ID", value: (_p, i) => `P${String(i + 1).padStart(4, "0")}` },
        { header: "Name", value: (p) => p.name },
        { header: "Description", value: (p) => p.description },
        { header: "Size", value: (p) => p.size ?? "" },
        { header: "In stock", value: (p) => p.stock_quantity },
        { header: "Buying price", value: (p) => Number(p.buying_price).toFixed(2) },
        { header: "Stock value", value: (p) => ((p.stock_quantity * toCents(p.buying_price)) / 100).toFixed(2) },
      ],
      [[business?.name ?? "Smart POS"], ["Products export", format(new Date(), "PPpp")], ["Currency", business?.currency ?? DEFAULT_CURRENCY]],
    );
    downloadCsv(csv, datedFilename("products", "csv"));
  };

  const confirmArchive = async () => {
    if (!archiving) return;
    try {
      await archive.mutateAsync(archiving.id);
      toast.success("Product archived", { description: `${archiving.name} is hidden; its sales history is kept.` });
      setArchiving(null);
    } catch (error) {
      toast.error("Couldn't archive the product", { description: getErrorMessage(error) });
    }
  };

  const actions = (p: Product) => (
    <div className="flex items-center justify-end gap-1">
      <Button size="sm" variant="outline" onClick={() => setRestocking(p)}>
        <PackagePlus className="mr-1.5 h-4 w-4" aria-hidden />
        <span className="hidden lg:inline">Add stock</span>
        <span className="lg:hidden">Stock</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`More actions for ${p.name}`}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              setEditing(p);
              setFormOpen(true);
            }}
          >
            <Pencil className="mr-2 h-4 w-4" />
            {security.canEditRecords ? "Edit" : "Request change"}
          </DropdownMenuItem>
          {security.canDeleteRecords && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setArchiving(p)} className="text-destructive focus:text-destructive">
                <Archive className="mr-2 h-4 w-4" />
                Archive
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Products</h1>
          <p className="text-muted-foreground">Your stock list and what it cost you.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={openNew} className="w-full sm:order-2 sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            <span className="sm:hidden">Add</span>
            <span className="hidden sm:inline">Add product</span>
          </Button>
          <Button variant="outline" onClick={exportCsv} disabled={!rows.length} className="w-full sm:order-1 sm:w-auto">
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Products</p>
            {products.isLoading ? <Skeleton className="mt-2 h-7 w-16" /> : <p className="mt-1 text-2xl font-bold tabular-nums">{rows.length}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Low or out of stock</p>
            {products.isLoading ? (
              <Skeleton className="mt-2 h-7 w-16" />
            ) : (
              <p className={`mt-1 text-2xl font-bold tabular-nums ${lowCount ? "text-warning-foreground dark:text-warning" : ""}`}>{lowCount}</p>
            )}
          </CardContent>
        </Card>
        {security.canViewFinancialData && (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Stock value (at cost)</p>
              {products.isLoading ? <Skeleton className="mt-2 h-7 w-28" /> : <Money cents={stockValue} className="mt-1 block text-2xl font-bold" />}
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <CardTitle>Stock list</CardTitle>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input placeholder="Search products" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" aria-label="Search products" />
          </div>
        </CardHeader>
        <CardContent>
          {products.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : products.isError ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">Couldn't load products.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => products.refetch()}>
                Try again
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Package className="h-10 w-10 text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">{search ? `No products match "${search}".` : "No products yet."}</p>
              {!search && (
                <Button variant="outline" size="sm" onClick={openNew}>
                  Add your first product
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead className="text-right">Buying price</TableHead>
                      {security.canViewFinancialData && <TableHead className="text-right">Stock value</TableHead>}
                      <TableHead>
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div className="font-medium">
                            {p.name}
                            {p.size && <span className="font-normal text-muted-foreground"> · {p.size}</span>}
                          </div>
                          {p.description && <div className="max-w-sm truncate text-xs text-muted-foreground">{p.description}</div>}
                        </TableCell>
                        <TableCell>{stockBadge(p.stock_quantity)}</TableCell>
                        <TableCell className="text-right">
                          <Money value={Number(p.buying_price)} />
                        </TableCell>
                        {security.canViewFinancialData && (
                          <TableCell className="text-right">
                            <Money cents={p.stock_quantity * toCents(p.buying_price)} />
                          </TableCell>
                        )}
                        <TableCell>{actions(p)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <ul className="space-y-3 md:hidden">
                {rows.map((p) => (
                  <li key={p.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {p.name}
                          {p.size && <span className="font-normal text-muted-foreground"> · {p.size}</span>}
                        </p>
                        <Money value={Number(p.buying_price)} className="text-sm text-muted-foreground" />
                      </div>
                      {stockBadge(p.stock_quantity)}
                    </div>
                    <div className="mt-2 flex justify-end">{actions(p)}</div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <ProductFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        product={editing}
        requestMode={!!editing && !security.canEditRecords}
      />
      <AddStockDialog product={restocking} onOpenChange={(open) => !open && setRestocking(null)} />
      <ConfirmDialog
        open={archiving !== null}
        onOpenChange={(open) => !open && setArchiving(null)}
        title="Archive this product?"
        description={`${archiving?.name ?? ""} will be hidden from your stock list and the sale form. Past sales keep it.`}
        confirmLabel="Archive"
        busyLabel="Archiving…"
        destructive
        busy={archive.isPending}
        onConfirm={confirmArchive}
      />
    </div>
  );
};

export default ProductsPage;
