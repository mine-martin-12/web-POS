import React, { useMemo, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { format } from "date-fns";
import { toast } from "sonner";
import { Archive, Download, MoreHorizontal, Package, PackagePlus, Pencil, Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useActionParam } from "@/hooks/useActionParam";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { Money } from "@/components/common/Money";
import { DataTable, type DataTableColumn } from "@/components/common/data-table/DataTable";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { datedFilename, downloadCsv } from "@/lib/csv";
import { sheetToCsv } from "@/lib/exports/files";
import type { ExportSheet } from "@/lib/exports/table";
import { ExportMenu } from "@/components/common/ExportMenu";
import { getErrorMessage } from "@/lib/errors";
import { toCents } from "@/lib/finance";
import { LOW_STOCK_THRESHOLD, type Product } from "../api";
import { AddStockDialog } from "../components/AddStockDialog";
import { ProductFormDialog } from "../components/ProductFormDialog";
import { useArchiveProduct, useProducts } from "../hooks";

type StockFilter = "all" | "low" | "out";

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
  const url = useUrlState();
  const search = url.get("q");
  const stockFilter = (url.get("stock", "all") as StockFilter) || "all";

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [restocking, setRestocking] = useState<Product | null>(null);
  const [archiving, setArchiving] = useState<Product[] | null>(null);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };
  useActionParam("new", openNew);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (products.data ?? [])
      .filter((p) =>
        stockFilter === "out" ? p.stock_quantity <= 0 : stockFilter === "low" ? p.stock_quantity < LOW_STOCK_THRESHOLD : true,
      )
      .filter((p) => !term || p.name.toLowerCase().includes(term) || p.description.toLowerCase().includes(term));
  }, [products.data, search, stockFilter]);
  // Tiles summarise exactly the rows on screen.
  const stockValue = useMemo(() => rows.reduce((sum, p) => sum + p.stock_quantity * toCents(p.buying_price), 0), [rows]);
  const lowCount = rows.filter((p) => p.stock_quantity < LOW_STOCK_THRESHOLD).length;

  const sheet = (list: Product[]): ExportSheet<Product> => ({
    name: "Products",
    total: security.canViewFinancialData,
    rows: list,
    columns: [
      { header: "ID", value: (_p, i) => `P${String(i + 1).padStart(4, "0")}` },
      { header: "Name", value: (p) => p.name, width: 24 },
      { header: "Description", value: (p) => p.description, width: 28 },
      { header: "Size", value: (p) => p.size ?? "" },
      { header: "In stock", value: (p) => p.stock_quantity },
      { header: "Buying price", value: (p) => Number(p.buying_price), money: true, noTotal: true },
      ...(security.canViewFinancialData
        ? [{ header: "Stock value", value: (p: Product) => (p.stock_quantity * toCents(p.buying_price)) / 100, money: true }]
        : []),
    ],
  });
  const exportSelected = (list: Product[]) =>
    downloadCsv(
      sheetToCsv({ businessName: business?.name ?? "Smart POS", title: "Products (selected)", currency: business?.currency ?? DEFAULT_CURRENCY }, sheet(list)),
      datedFilename("products-selected", "csv"),
    );

  const confirmArchive = async () => {
    if (!archiving) return;
    try {
      for (const p of archiving) await archive.mutateAsync(p.id);
      toast.success(archiving.length === 1 ? "Product archived" : `${archiving.length} products archived`, {
        description: "Hidden from lists; sales history is kept.",
      });
      setArchiving(null);
    } catch (error) {
      toast.error("Couldn't archive", { description: getErrorMessage(error) });
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
              <DropdownMenuItem onSelect={() => setArchiving([p])} className="text-destructive focus:text-destructive">
                <Archive className="mr-2 h-4 w-4" />
                Archive
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const columns: DataTableColumn<Product>[] = [
    {
      id: "name",
      header: "Product",
      sortValue: (p) => p.name.toLowerCase(),
      cell: (p) => (
        <div>
          <div className="font-medium">
            {p.name}
            {p.size && <span className="font-normal text-muted-foreground"> · {p.size}</span>}
          </div>
          {p.description && <div className="max-w-sm truncate text-xs text-muted-foreground">{p.description}</div>}
        </div>
      ),
    },
    { id: "stock", header: "Stock", sortValue: (p) => p.stock_quantity, cell: (p) => stockBadge(p.stock_quantity) },
    {
      id: "price",
      header: "Buying price",
      align: "right",
      sortValue: (p) => Number(p.buying_price),
      cell: (p) => <Money value={Number(p.buying_price)} />,
    },
    ...(security.canViewFinancialData
      ? [
          {
            id: "value",
            header: "Stock value",
            align: "right" as const,
            sortValue: (p: Product) => p.stock_quantity * toCents(p.buying_price),
            cell: (p: Product) => <Money cents={p.stock_quantity * toCents(p.buying_price)} />,
          },
        ]
      : []),
    { id: "actions", header: <span className="sr-only">Actions</span>, cell: actions },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        actions={
          <>
            <div className="flex flex-wrap gap-2">
              <Button onClick={openNew} className="sm:order-2">
                <Plus className="mr-2 h-4 w-4" />
                <span className="sm:hidden">Add</span>
                <span className="hidden sm:inline">Add product</span>
              </Button>
              <ExportMenu
                filename="products"
                title="Stock list"
                subtitle={format(new Date(), "d MMM yyyy")}
                disabled={!rows.length}
                className="sm:order-1"
                sheets={() => [sheet(rows)]}
              />
            </div>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile label="Products" loading={products.isLoading}>
          <span className="tabular-nums">{rows.length}</span>
        </Tile>
        <Tile label="Low or out of stock" loading={products.isLoading}>
          <span className={lowCount ? "tabular-nums text-warning-foreground dark:text-warning" : "tabular-nums"}>{lowCount}</span>
        </Tile>
        {security.canViewFinancialData && (
          <Tile label="Stock value (at cost)" loading={products.isLoading}>
            <Money cents={stockValue} />
          </Tile>
        )}
      </div>

      <DataTable<Product>
        rows={rows}
        columns={columns}
        getRowId={(p) => p.id}
        loading={products.isLoading}
        caption="Products"
        highlightId={url.get("focus") || null}
        search={{ value: search, onChange: (v) => url.set({ q: v, page: null }), placeholder: "Search products" }}
        filtered={!!search || stockFilter !== "all"}
        onClearFilters={() => url.set({ q: null, stock: null, page: null })}
        toolbar={
          <ToggleGroup
            type="single"
            value={stockFilter}
            onValueChange={(v) => url.set({ stock: v || "all", page: null }, { stock: "all" })}
            variant="outline"
            size="sm"
            aria-label="Filter by stock"
          >
            <ToggleGroupItem value="all">All</ToggleGroupItem>
            <ToggleGroupItem value="low">Low</ToggleGroupItem>
            <ToggleGroupItem value="out">Out</ToggleGroupItem>
          </ToggleGroup>
        }
        selectable={security.canBulkOperations}
        bulkActions={(selected, clear) => (
          <>
            <Button size="sm" variant="outline" onClick={() => exportSelected(selected)}>
              <Download className="mr-1.5 h-4 w-4" /> Export
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive"
              onClick={() => {
                setArchiving(selected);
                clear();
              }}
            >
              <Archive className="mr-1.5 h-4 w-4" /> Archive
            </Button>
          </>
        )}
        emptyState={
          <EmptyState
            icon={Package}
            title="No products yet"
            description="Add what you sell so you can record sales and track stock."
            action={{ label: "Add your first product", onClick: openNew }}
          />
        }
        mobileCard={(p) => (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3 pr-6">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {p.name}
                  {p.size && <span className="font-normal text-muted-foreground"> · {p.size}</span>}
                </p>
                <Money value={Number(p.buying_price)} className="text-sm text-muted-foreground" />
              </div>
              {stockBadge(p.stock_quantity)}
            </div>
            {actions(p)}
          </div>
        )}
      />

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
        title={archiving && archiving.length > 1 ? `Archive ${archiving.length} products?` : "Archive this product?"}
        description={
          archiving && archiving.length > 1
            ? "They'll be hidden from your stock list and the sale form. Past sales keep them."
            : `${archiving?.[0]?.name ?? ""} will be hidden from your stock list and the sale form. Past sales keep it.`
        }
        confirmLabel="Archive"
        busyLabel="Archiving…"
        destructive
        busy={archive.isPending}
        onConfirm={confirmArchive}
      />
    </div>
  );
};

function Tile({ label, loading, children }: { label: string; loading: boolean; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        {loading ? <Skeleton className="mt-2 h-7 w-24" /> : <div className="mt-1 text-2xl font-bold">{children}</div>}
      </CardContent>
    </Card>
  );
}

export default ProductsPage;
