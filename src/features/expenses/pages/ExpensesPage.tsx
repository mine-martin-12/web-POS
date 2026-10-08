import React, { useMemo, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { format } from "date-fns";
import { toast } from "sonner";
import { Download, MoreHorizontal, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useActionParam } from "@/hooks/useActionParam";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { Money } from "@/components/common/Money";
import { DataTable, type DataTableColumn } from "@/components/common/data-table/DataTable";
import { PeriodPicker } from "@/features/sales/components/PeriodPicker";
import { resolvePeriod } from "@/features/sales/period";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/features/sales/types";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { ExportMenu } from "@/components/common/ExportMenu";
import { expensesSheet } from "../lib";
import { parseDayKey, todayKey } from "@/lib/dates";
import { toCents } from "@/lib/finance";
import type { Expense } from "../api";
import { ExpenseFormDialog } from "../components/ExpenseFormDialog";
import { useDeleteExpense, useExpenses } from "../hooks";

const ALL = "all";

const ExpensesPage: React.FC = () => {
  const { business } = useAuth();
  const today = todayKey(business?.timezone);
  const url = useUrlState();
  const period = resolvePeriod({ period: url.get("period"), month: url.get("month"), from: url.get("from"), to: url.get("to") }, today);
  const search = url.get("q");
  const category = url.get("category", ALL);
  const expenses = useExpenses(period.from, period.to);
  const remove = useDeleteExpense();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };
  useActionParam("new", openNew);

  const all = useMemo(() => expenses.data ?? [], [expenses.data]);
  const categories = useMemo(() => [...new Set(all.map((e) => e.category))].sort(), [all]);
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return all
      .filter((e) => category === ALL || e.category === category)
      .filter((e) => !term || e.category.toLowerCase().includes(term) || (e.description ?? "").toLowerCase().includes(term));
  }, [all, category, search]);
  const total = rows.reduce((sum, e) => sum + toCents(e.amount), 0);
  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of rows) map.set(e.category, (map.get(e.category) ?? 0) + toCents(e.amount));
    return [...map].sort((a, b) => b[1] - a[1]);
  }, [rows]);


  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting);
      toast.success("Expense deleted");
    } finally {
      setDeleting(null);
    }
  };

  const actions = (e: Expense) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Actions for ${e.category} expense`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => {
            setEditing(e);
            setFormOpen(true);
          }}
        >
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setDeleting(e)} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const columns: DataTableColumn<Expense>[] = [
    {
      id: "date",
      header: "Date",
      sortValue: (e) => e.expense_date,
      cell: (e) => <span className="whitespace-nowrap text-muted-foreground">{format(parseDayKey(e.expense_date), "d MMM yyyy")}</span>,
    },
    { id: "category", header: "Category", sortValue: (e) => e.category, cell: (e) => <Badge variant="secondary">{e.category}</Badge> },
    { id: "notes", header: "Notes", cell: (e) => <span className="block max-w-xs truncate">{e.description}</span> },
    { id: "method", header: "Paid by", cell: (e) => PAYMENT_METHOD_LABELS[e.payment_method as PaymentMethod] },
    { id: "amount", header: "Amount", align: "right", sortValue: (e) => Number(e.amount), cell: (e) => <Money value={Number(e.amount)} /> },
    { id: "actions", header: <span className="sr-only">Actions</span>, className: "w-12", cell: actions },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        actions={
          <>
            <div className="flex flex-wrap gap-2">
              <Button onClick={openNew} className="sm:order-2">
                <Plus className="mr-2 h-4 w-4" />
                <span className="sm:hidden">Add</span>
                <span className="hidden sm:inline">Record expense</span>
              </Button>
              <ExportMenu
                filename="expenses"
                title="Expenses"
                subtitle={period.label}
                disabled={!rows.length}
                className="sm:order-1"
                sheets={() => [expensesSheet(rows)]}
              />
            </div>
          </>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Total · {period.label}</p>
            {expenses.isLoading ? <Skeleton className="mt-2 h-8 w-32" /> : <Money cents={total} className="text-3xl font-bold" />}
          </div>
          <ul className="flex flex-wrap gap-2">
            {byCategory.slice(0, 5).map(([name, cents]) => (
              <li key={name} className="rounded-full border px-3 py-1 text-sm">
                {name} · <Money cents={cents} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <DataTable<Expense>
        rows={rows}
        columns={columns}
        getRowId={(e) => e.id}
        loading={expenses.isLoading}
        error={expenses.error}
        onRetry={() => expenses.refetch()}
        caption={`Expenses, ${period.label}`}
        search={{ value: search, onChange: (v) => url.set({ q: v, page: null }), placeholder: "Search expenses" }}
        filtered={!!search || category !== ALL}
        onClearFilters={() => url.set({ q: null, category: null, page: null })}
        toolbar={
          <>
            <PeriodPicker period={period} today={today} onChange={(u) => url.set({ ...u, page: null })} />
            {categories.length > 1 && (
              <Select value={category} onValueChange={(v) => url.set({ category: v, page: null }, { category: ALL })}>
                <SelectTrigger className="h-9 w-[11rem]" aria-label="Category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </>
        }
        emptyState={
          <EmptyState
            icon={Wallet}
            title={`No expenses in ${period.label}`}
            description="Record rent, wages and other costs to see your real profit in Reports."
            action={{ label: "Record an expense", onClick: openNew }}
          />
        }
        mobileCard={(e) => (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{e.category}</p>
              <p className="truncate text-xs text-muted-foreground">
                {format(parseDayKey(e.expense_date), "d MMM")} {e.description ? `· ${e.description}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Money value={Number(e.amount)} className="font-semibold" />
              {actions(e)}
            </div>
          </div>
        )}
      />

      <ExpenseFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        expense={editing}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this expense?"
        description={deleting ? `${deleting.category}, ${format(parseDayKey(deleting.expense_date), "d MMM yyyy")}. This can't be undone.` : ""}
        confirmLabel="Delete"
        busyLabel="Deleting…"
        destructive
        busy={remove.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
};

export default ExpensesPage;
