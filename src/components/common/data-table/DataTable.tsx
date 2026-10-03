import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, Rows3, Rows4, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDensity } from "@/hooks/useDensity";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUrlState } from "@/hooks/useUrlState";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { clampPage, pageWindow } from "./pagination";

export interface DataTableColumn<T> {
  id: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Enables sorting on this column. */
  sortValue?: (row: T) => string | number;
  align?: "left" | "right";
  className?: string;
}

export interface DataTableGroup<T> {
  /** Rows with the same key are shown together (e.g. by day). Rows must arrive sorted by it. */
  key: (row: T) => string;
  /** Group heading, e.g. "Fri 3 Oct". */
  label: (key: string, rows: T[]) => React.ReactNode;
  /** Right-hand summary, e.g. the day's subtotal. */
  summary?: (rows: T[]) => React.ReactNode;
}

interface DataTableProps<T> {
  rows: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  /** Card shown instead of a table row on small screens. */
  mobileCard: (row: T) => React.ReactNode;
  loading?: boolean;
  /** A failed load: shows the message with a retry button. */
  error?: unknown;
  onRetry?: () => void;
  /** Shown when there are no rows at all. */
  emptyState: React.ReactNode;
  /** True when filters/search are hiding rows: an empty result then shows "no results". */
  filtered?: boolean;
  onClearFilters?: () => void;
  search?: { value: string; onChange: (value: string) => void; placeholder: string };
  /** Extra controls in the toolbar (filters). */
  toolbar?: React.ReactNode;
  /** Prefix for this table's URL params when a page has more than one table. */
  urlPrefix?: string;
  pageSizes?: number[];
  defaultPageSize?: number;
  selectable?: boolean;
  bulkActions?: (selected: T[], clear: () => void) => React.ReactNode;
  groupBy?: DataTableGroup<T>;
  rowClassName?: (row: T) => string | undefined;
  /** Briefly highlights this row (deep links). */
  highlightId?: string | null;
  caption?: string;
}

/**
 * The one table used for every list. Search, sort, page and page size live in the URL
 * (replace, not push); density is remembered per user; on phones rows become cards.
 */
export function DataTable<T>({
  rows,
  columns,
  getRowId,
  mobileCard,
  loading = false,
  error,
  onRetry,
  emptyState,
  filtered = false,
  onClearFilters,
  search,
  toolbar,
  urlPrefix = "",
  pageSizes = [25, 50, 100],
  defaultPageSize = 25,
  selectable = false,
  bulkActions,
  groupBy,
  rowClassName,
  highlightId,
  caption,
}: DataTableProps<T>) {
  const isMobile = useIsMobile();
  const [density, setDensity] = useDensity();
  const url = useUrlState(urlPrefix);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const pageSize = pageSizes.includes(Number(url.get("size"))) ? Number(url.get("size")) : defaultPageSize;
  const [sortId, sortDir] = (url.get("sort") || ":").split(":") as [string, "asc" | "desc" | ""];
  const sortColumn = columns.find((c) => c.id === sortId && c.sortValue);

  const sorted = useMemo(() => {
    if (!sortColumn?.sortValue) return rows;
    const value = sortColumn.sortValue;
    const dir = sortDir === "desc" ? -1 : 1;
    return [...rows].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
    });
  }, [rows, sortColumn, sortDir]);

  const page = clampPage(Number(url.get("page", "1")) - 1, sorted.length, pageSize);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageRows = sorted.slice(page * pageSize, (page + 1) * pageSize);

  // Drop selections that are no longer in the list (deleted, filtered away).
  useEffect(() => {
    setSelected((current) => {
      const ids = new Set(rows.map(getRowId));
      const next = new Set([...current].filter((id) => ids.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [rows, getRowId]);

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(getRowId(r))), [rows, selected, getRowId]);
  const pageIds = pageRows.map(getRowId);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPage = pageIds.some((id) => selected.has(id));
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const togglePage = () =>
    setSelected((current) => {
      const next = new Set(current);
      pageIds.forEach((id) => (allOnPage ? next.delete(id) : next.add(id)));
      return next;
    });
  const clearSelection = () => setSelected(new Set());

  const setSort = (column: DataTableColumn<T>) => {
    const nextDir = sortColumn?.id === column.id ? (sortDir === "asc" ? "desc" : sortDir === "desc" ? "" : "asc") : "asc";
    url.set({ sort: nextDir ? `${column.id}:${nextDir}` : null, page: null });
  };

  const groups = useMemo(() => {
    if (!groupBy || sortColumn) return null;
    const result: Array<{ key: string; rows: T[] }> = [];
    for (const row of pageRows) {
      const key = groupBy.key(row);
      const last = result[result.length - 1];
      if (last?.key === key) last.rows.push(row);
      else result.push({ key, rows: [row] });
    }
    return result;
  }, [groupBy, sortColumn, pageRows]);

  const compact = density === "compact";
  const colSpan = columns.length + (selectable ? 1 : 0);

  const renderRow = (row: T) => {
    const id = getRowId(row);
    return (
      <TableRow
        key={id}
        id={`row-${id}`}
        data-state={selected.has(id) ? "selected" : undefined}
        className={cn(
          "transition-colors",
          highlightId === id && "animate-pulse bg-primary/10",
          rowClassName?.(row),
        )}
      >
        {selectable && (
          <TableCell className="w-10">
            <Checkbox checked={selected.has(id)} onCheckedChange={() => toggle(id)} aria-label="Select row" />
          </TableCell>
        )}
        {columns.map((column) => (
          <TableCell key={column.id} className={cn(column.align === "right" && "text-right", column.className)}>
            {column.cell(row)}
          </TableCell>
        ))}
      </TableRow>
    );
  };

  const toolbarVisible = search || toolbar;
  const content = (() => {
    if (loading) {
      return (
        <div className="space-y-2 p-4" aria-label="Loading">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      );
    }
    if (error) {
      return (
        <div className="flex flex-col items-center gap-3 px-4 py-10 text-center" role="alert">
          <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden />
          <div>
            <p className="font-medium">Couldn't load this list</p>
            <p className="text-sm text-muted-foreground">{getErrorMessage(error)}</p>
          </div>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      );
    }
    if (rows.length === 0) {
      if (filtered) {
        return (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <Search className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">
              {search?.value ? `No results for "${search.value}".` : "Nothing matches these filters."}
            </p>
            {onClearFilters && (
              <Button variant="outline" size="sm" onClick={onClearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        );
      }
      return <div className="px-4 py-10">{emptyState}</div>;
    }
    if (isMobile) {
      return (
        <ul className="space-y-3 p-3">
          {pageRows.map((row) => {
            const id = getRowId(row);
            return (
              <li
                key={id}
                id={`row-${id}`}
                className={cn(
                  "relative rounded-lg border bg-card p-3 animate-fade-in",
                  selected.has(id) && "border-primary",
                  highlightId === id && "ring-2 ring-primary",
                  rowClassName?.(row),
                )}
              >
                {selectable && (
                  <Checkbox
                    className="absolute right-3 top-3"
                    checked={selected.has(id)}
                    onCheckedChange={() => toggle(id)}
                    aria-label="Select"
                  />
                )}
                {mobileCard(row)}
              </li>
            );
          })}
        </ul>
      );
    }
    return (
      <Table className={cn(compact && "[&_td]:py-1.5 [&_th]:h-9")}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <TableHeader>
          <TableRow>
            {selectable && (
              <TableHead className="w-10">
                <Checkbox
                  checked={allOnPage ? true : someOnPage ? "indeterminate" : false}
                  onCheckedChange={togglePage}
                  aria-label="Select all on this page"
                />
              </TableHead>
            )}
            {columns.map((column) => {
              const active = sortColumn?.id === column.id;
              return (
                <TableHead
                  key={column.id}
                  className={cn(column.align === "right" && "text-right", column.className)}
                  aria-sort={active ? (sortDir === "desc" ? "descending" : "ascending") : undefined}
                >
                  {column.sortValue ? (
                    <button
                      type="button"
                      onClick={() => setSort(column)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        column.align === "right" && "flex-row-reverse",
                      )}
                    >
                      {column.header}
                      {active ? (
                        sortDir === "desc" ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        {groups ? (
          groups.map((group) => {
            const open = !collapsed.has(group.key);
            const toggleGroup = () =>
              setCollapsed((current) => {
                const next = new Set(current);
                if (open) next.add(group.key);
                else next.delete(group.key);
                return next;
              });
            return (
              <TableBody key={group.key}>
                <TableRow className="bg-muted/40 hover:bg-muted/60">
                  <TableCell colSpan={colSpan} className="py-2">
                    <button
                      type="button"
                      onClick={toggleGroup}
                      aria-expanded={open}
                      className="flex w-full items-center justify-between gap-3 rounded text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="flex items-center gap-2">
                        <ChevronDown className={cn("h-4 w-4 transition-transform", !open && "-rotate-90")} aria-hidden />
                        {groupBy!.label(group.key, group.rows)}
                      </span>
                      {groupBy!.summary && <span className="text-muted-foreground">{groupBy!.summary(group.rows)}</span>}
                    </button>
                  </TableCell>
                </TableRow>
                {open && group.rows.map(renderRow)}
              </TableBody>
            );
          })
        ) : (
          <TableBody>{pageRows.map(renderRow)}</TableBody>
        )}
      </Table>
    );
  })();

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {toolbarVisible && (
        <div className="flex flex-col gap-3 border-b p-3 lg:flex-row lg:items-center lg:justify-between">
          {search && (
            <div className="relative w-full lg:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={search.value}
                onChange={(e) => {
                  search.onChange(e.target.value);
                  url.set({ page: null });
                }}
                placeholder={search.placeholder}
                className="pl-9 pr-8"
                aria-label={search.placeholder}
              />
              {search.value && (
                <button
                  type="button"
                  onClick={() => search.onChange("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {toolbar}
            {!isMobile && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setDensity(compact ? "comfortable" : "compact")}
                    aria-label={compact ? "Comfortable rows" : "Compact rows"}
                    aria-pressed={compact}
                  >
                    {compact ? <Rows3 className="h-4 w-4" /> : <Rows4 className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{compact ? "Comfortable rows" : "Compact rows"}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      )}

      {selectable && selectedRows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-primary/5 px-3 py-2 text-sm animate-fade-in">
          <span className="font-medium">{selectedRows.length} selected</span>
          {bulkActions?.(selectedRows, clearSelection)}
          <Button variant="ghost" size="sm" onClick={clearSelection} className="ml-auto">
            Clear
          </Button>
        </div>
      )}

      <div className="overflow-x-auto">{content}</div>

      {!loading && !error && rows.length > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 border-t px-3 py-2 sm:flex-row">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="hidden sm:inline">Rows per page</span>
            <Select value={String(pageSize)} onValueChange={(v) => url.set({ size: v, page: null })}>
              <SelectTrigger className="h-8 w-20" aria-label="Rows per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizes.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="tabular-nums">
              {page * pageSize + 1}–{Math.min(sorted.length, (page + 1) * pageSize)} of {sorted.length}
            </span>
          </div>
          {totalPages > 1 && (
            <nav className="flex items-center gap-1" aria-label="Pagination">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={page === 0}
                onClick={() => url.set({ page: page })}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {pageWindow(page, totalPages).map((p, i) =>
                p === "…" ? (
                  <span key={`gap-${i}`} className="px-1 text-muted-foreground">
                    …
                  </span>
                ) : (
                  <Button
                    key={p}
                    variant={p === page ? "default" : "ghost"}
                    size="icon"
                    className="h-8 w-8 tabular-nums"
                    onClick={() => url.set({ page: p + 1 }, { page: "1" })}
                    aria-current={p === page ? "page" : undefined}
                    aria-label={`Page ${p + 1}`}
                  >
                    {p + 1}
                  </Button>
                ),
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={page + 1 >= totalPages}
                onClick={() => url.set({ page: page + 2 })}
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </nav>
          )}
        </div>
      )}
    </div>
  );
}
