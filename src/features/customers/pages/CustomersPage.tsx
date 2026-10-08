import React, { useMemo, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { format } from "date-fns";
import { toast } from "sonner";
import { Archive, MoreHorizontal, Pencil, Plus, Users } from "lucide-react";
import { useActionParam } from "@/hooks/useActionParam";
import { useSecurity } from "@/hooks/useSecurity";
import { useUrlState } from "@/hooks/useUrlState";
import { getErrorMessage } from "@/lib/errors";
import { normalizePhone } from "@/lib/phone";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { DataTable, type DataTableColumn } from "@/components/common/data-table/DataTable";
import { CustomerFormDialog } from "../components/CustomerFormDialog";
import { MaskedPhone } from "../components/MaskedPhone";
import { useArchiveCustomer, useCustomers } from "../hooks";
import type { Customer } from "../types";

const CustomersPage: React.FC = () => {
  const { canDeleteRecords, isAdmin, canBulkOperations } = useSecurity();
  const customers = useCustomers();
  const archive = useArchiveCustomer();
  const url = useUrlState();
  const search = url.get("q");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [archiving, setArchiving] = useState<Customer[] | null>(null);
  useActionParam("new", () => setCreating(true));

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return customers.data ?? [];
    const phone = normalizePhone(term);
    return (customers.data ?? []).filter(
      (c) => c.name.toLowerCase().includes(term) || (phone !== null && c.phone === phone),
    );
  }, [customers.data, search]);

  const confirmArchive = async () => {
    if (!archiving) return;
    try {
      for (const c of archiving) await archive.mutateAsync(c.id);
      toast.success(archiving.length === 1 ? "Customer archived" : `${archiving.length} customers archived`);
      setArchiving(null);
    } catch (error) {
      toast.error("Couldn't archive", { description: getErrorMessage(error) });
    }
  };

  const actions = (c: Customer) =>
    isAdmin ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${c.name}`}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(c)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
          {canDeleteRecords && (
            <DropdownMenuItem onSelect={() => setArchiving([c])} className="text-destructive focus:text-destructive">
              <Archive className="mr-2 h-4 w-4" />
              Archive
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  const columns: DataTableColumn<Customer>[] = [
    { id: "name", header: "Name", sortValue: (c) => c.name.toLowerCase(), cell: (c) => <span className="font-medium">{c.name}</span> },
    { id: "phone", header: "Phone", cell: (c) => <MaskedPhone phone={c.phone} /> },
    { id: "notes", header: "Notes", className: "max-w-xs", cell: (c) => <span className="block truncate text-muted-foreground">{c.notes}</span> },
    {
      id: "added",
      header: "Added",
      sortValue: (c) => c.created_at,
      cell: (c) => <span className="text-muted-foreground">{format(new Date(c.created_at), "PP")}</span>,
    },
    ...(isAdmin ? [{ id: "actions", header: <span className="sr-only">Actions</span>, cell: actions }] : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        actions={
          <>
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" />
              <span className="sm:hidden">Add</span>
              <span className="hidden sm:inline">Add customer</span>
            </Button>
          </>
        }
      />

      <DataTable<Customer>
        rows={rows}
        columns={columns}
        getRowId={(c) => c.id}
        loading={customers.isLoading}
        caption="Customers"
        search={{
          value: search,
          onChange: (v) => url.set({ q: v, page: null }),
          placeholder: isAdmin ? "Search name or phone" : "Search by name",
        }}
        filtered={!!search}
        onClearFilters={() => url.set({ q: null, page: null })}
        selectable={canBulkOperations}
        bulkActions={(selected, clear) => (
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
        )}
        emptyState={
          <EmptyState
            icon={Users}
            title="No customers yet"
            description="They're added as you record sales, or you can add them here."
            action={{ label: "Add your first customer", onClick: () => setCreating(true) }}
          />
        }
        mobileCard={(c) => (
          <div className="flex items-start justify-between gap-3 pr-6">
            <div className="min-w-0">
              <p className="truncate font-medium">{c.name}</p>
              <MaskedPhone phone={c.phone} className="text-sm" />
              {c.notes && <p className="truncate text-sm text-muted-foreground">{c.notes}</p>}
            </div>
            {actions(c)}
          </div>
        )}
      />

      <CustomerFormDialog open={creating} onOpenChange={setCreating} />
      <CustomerFormDialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} customer={editing} />
      <ConfirmDialog
        open={archiving !== null}
        onOpenChange={(open) => !open && setArchiving(null)}
        title={archiving && archiving.length > 1 ? `Archive ${archiving.length} customers?` : "Archive customer?"}
        description="Archived customers are hidden from search. Their sales and credits are kept."
        confirmLabel="Archive"
        busyLabel="Archiving…"
        destructive
        busy={archive.isPending}
        onConfirm={confirmArchive}
      />
    </div>
  );
};

export default CustomersPage;
