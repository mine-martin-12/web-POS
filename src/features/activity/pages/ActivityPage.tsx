import React, { useMemo, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Download, History, Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateField } from "@/components/common/DateField";
import { useMemberNames } from "@/features/approvals/hooks";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { datedFilename, downloadCsv, toCsv } from "@/lib/csv";
import { addDaysToKey, DEFAULT_TIME_ZONE, todayKey } from "@/lib/dates";
import { getErrorMessage } from "@/lib/errors";
import { queryKeys } from "@/lib/queryKeys";
import { fetchActivityAll, fetchActivityPage, type ActivityAction, type ActivityFilters, type ActivityLog } from "../api";
import { ACTION_LABELS, formatLogValue, humanField, RECORD_LABELS, summarize, visibleFields } from "../lib";

const PAGE_SIZES = [25, 50, 100] as const;
const DEFAULT_DAYS = 30;
const ALL = "all";
const ACTION_TONE: Record<ActivityAction, string> = {
  create: "border-success/30 bg-success/15 text-success",
  update: "border-primary/30 bg-primary/10 text-primary",
  delete: "border-destructive/30 bg-destructive/10 text-destructive",
};

const ActivityPage: React.FC = () => {
  const { business } = useAuth();
  const timeZone = business?.timezone ?? DEFAULT_TIME_ZONE;
  const currency = business?.currency ?? DEFAULT_CURRENCY;
  const today = todayKey(timeZone);
  const names = useMemberNames();
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<ActivityLog | null>(null);
  const [exporting, setExporting] = useState(false);

  // Filters, page and page size live in the URL (replace, not push).
  const get = (key: string, fallback: string) => params.get(key) ?? fallback;
  const filtersFromUrl = {
    from: get("from", addDaysToKey(today, -(DEFAULT_DAYS - 1))),
    to: get("to", today),
    actor: params.get("actor"),
    action: params.get("action") as ActivityAction | null,
    table: params.get("type"),
  };
  const page = Math.max(0, Number(get("page", "1")) - 1);
  const pageSize = (PAGE_SIZES as readonly number[]).includes(Number(params.get("size"))) ? Number(params.get("size")) : 25;
  const [search, setSearch] = useState(get("q", ""));
  const debouncedSearch = useDebouncedValue(search, 300);

  const setFilter = (updates: Record<string, string | null>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(updates)) {
          if (value === null || value === "" || value === ALL) next.delete(key);
          else next.set(key, value);
        }
        if (!("page" in updates)) next.delete("page");
        return next;
      },
      { replace: true },
    );

  const filters: ActivityFilters = useMemo(
    () => ({ ...filtersFromUrl, search: debouncedSearch, timeZone }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params, debouncedSearch, timeZone],
  );

  const query = useQuery({
    queryKey: queryKeys.activity.page(filters, page, pageSize),
    queryFn: () => fetchActivityPage(filters, page, pageSize),
    placeholderData: keepPreviousData,
  });
  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const actorName = (id: string | null) => (id ? (names.data?.get(id) ?? "Former member") : "System");

  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows = await fetchActivityAll(filters);
      const csv = toCsv(
        rows,
        [
          { header: "When", value: (r) => format(new Date(r.created_at), "yyyy-MM-dd HH:mm") },
          { header: "Who", value: (r) => actorName(r.actor_id) },
          { header: "Action", value: (r) => ACTION_LABELS[r.action] },
          { header: "Record type", value: (r) => RECORD_LABELS[r.table_name] ?? r.table_name },
          { header: "Summary", value: (r) => summarize(r, currency) },
          { header: "Reason", value: (r) => r.reason ?? "" },
          { header: "Before", value: (r) => (r.old_values ? JSON.stringify(r.old_values) : "") },
          { header: "After", value: (r) => (r.new_values ? JSON.stringify(r.new_values) : "") },
        ],
        [[business?.name ?? "Smart POS"], ["Activity log", `${filters.from} to ${filters.to}`]],
      );
      downloadCsv(csv, datedFilename("activity", "csv"));
      toast.success("Export ready", { description: `${rows.length} entries` });
    } catch (error) {
      toast.error("Couldn't export the activity log", { description: getErrorMessage(error) });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity"
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} disabled={exporting || total === 0}>
              <Download className="mr-2 h-4 w-4" />
              {exporting ? "Exporting…" : "Export CSV"}
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <div className="space-y-1.5">
            <Label htmlFor="activity-from">From</Label>
            <DateField id="activity-from" value={filters.from} max={filters.to} onChange={(v) => setFilter({ from: v })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="activity-to">To</Label>
            <DateField id="activity-to" value={filters.to} min={filters.from} max={today} onChange={(v) => setFilter({ to: v })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="activity-actor">Team member</Label>
            <Select value={filters.actor ?? ALL} onValueChange={(v) => setFilter({ actor: v })}>
              <SelectTrigger id="activity-actor">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Everyone</SelectItem>
                {[...(names.data ?? [])].map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="activity-action">Action</Label>
            <Select value={filters.action ?? ALL} onValueChange={(v) => setFilter({ action: v })}>
              <SelectTrigger id="activity-action">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any action</SelectItem>
                {(Object.keys(ACTION_LABELS) as ActivityAction[]).map((a) => (
                  <SelectItem key={a} value={a}>
                    {ACTION_LABELS[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="activity-type">Record type</Label>
            <Select value={filters.table ?? ALL} onValueChange={(v) => setFilter({ type: v })}>
              <SelectTrigger id="activity-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All records</SelectItem>
                {Object.entries(RECORD_LABELS).map(([table, label]) => (
                  <SelectItem key={table} value={table}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="activity-search">Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="activity-search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setFilter({ q: e.target.value });
                }}
                placeholder="Name, reason…"
                className="pl-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {query.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : query.isError ? (
            <div className="p-8 text-center">
              <p className="text-sm text-muted-foreground">Couldn't load activity. {getErrorMessage(query.error)}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => query.refetch()}>
                Try again
              </Button>
            </div>
          ) : query.data?.rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-10 text-center">
              <History className="h-10 w-10 text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">No activity matches these filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Who</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Record</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className={query.isPlaceholderData ? "opacity-60" : undefined}>
                  {query.data?.rows.map((log) => (
                    <TableRow
                      key={log.id}
                      tabIndex={0}
                      onClick={() => setSelected(log)}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSelected(log))}
                      className="cursor-pointer"
                    >
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {format(new Date(log.created_at), "d MMM, HH:mm")}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{actorName(log.actor_id)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={ACTION_TONE[log.action]}>
                          {ACTION_LABELS[log.action]}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{RECORD_LABELS[log.table_name] ?? log.table_name}</TableCell>
                      <TableCell className="max-w-xs truncate">
                        <span className="sensitive">{summarize(log, currency)}</span>
                      </TableCell>
                      <TableCell className="max-w-[12rem] truncate text-muted-foreground">{log.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Rows per page</span>
          <Select value={String(pageSize)} onValueChange={(v) => setFilter({ size: v })}>
            <SelectTrigger className="h-8 w-20" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm tabular-nums text-muted-foreground">
            {total === 0 ? "0" : `${page * pageSize + 1}–${Math.min(total, (page + 1) * pageSize)}`} of {total}
          </span>
          <Button
            variant="outline"
            size="icon"
            disabled={page === 0}
            onClick={() => setFilter({ page: String(page) })}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={page + 1 >= pages}
            onClick={() => setFilter({ page: String(page + 2) })}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {ACTION_LABELS[selected.action]} · {RECORD_LABELS[selected.table_name] ?? selected.table_name}
                </DialogTitle>
                <DialogDescription>
                  {actorName(selected.actor_id)} · {format(new Date(selected.created_at), "PPpp")}
                  {selected.reason ? ` · “${selected.reason}”` : ""}
                </DialogDescription>
              </DialogHeader>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Field</TableHead>
                    {selected.action !== "create" && <TableHead>Before</TableHead>}
                    {selected.action !== "delete" && <TableHead>After</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleFields(selected).map((field) => (
                    <TableRow key={field}>
                      <TableCell className="font-medium">{humanField(field)}</TableCell>
                      {selected.action !== "create" && (
                        <TableCell className="break-all text-muted-foreground">
                          <span className="sensitive">{formatLogValue(field, selected.old_values?.[field], currency)}</span>
                        </TableCell>
                      )}
                      {selected.action !== "delete" && (
                        <TableCell className="break-all">
                          <span className="sensitive">{formatLogValue(field, selected.new_values?.[field], currency)}</span>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ActivityPage;
