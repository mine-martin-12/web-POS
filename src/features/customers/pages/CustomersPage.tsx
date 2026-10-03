import React, { useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Archive, MoreHorizontal, Pencil, Plus, Search, Users } from "lucide-react";
import { useActionParam } from "@/hooks/useActionParam";
import { useSecurity } from "@/hooks/useSecurity";
import { getErrorMessage } from "@/lib/errors";
import { normalizePhone } from "@/lib/phone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { CustomerFormDialog } from "../components/CustomerFormDialog";
import { MaskedPhone } from "../components/MaskedPhone";
import { useArchiveCustomer, useCustomers } from "../hooks";
import type { Customer } from "../types";

const CustomersPage: React.FC = () => {
  const { canDeleteRecords, isAdmin } = useSecurity();
  const customers = useCustomers();
  const archive = useArchiveCustomer();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [archiving, setArchiving] = useState<Customer | null>(null);
  useActionParam("new", () => setCreating(true));

  const visible = useMemo(() => {
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
      await archive.mutateAsync(archiving.id);
      toast.success("Customer archived", { description: archiving.name });
      setArchiving(null);
    } catch (error) {
      toast.error("Couldn't archive customer", { description: getErrorMessage(error) });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Customers</h1>
          <p className="text-muted-foreground">People you sell to and give credit to.</p>
        </div>
        <Button onClick={() => setCreating(true)} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          <span className="sm:hidden">Add</span>
          <span className="hidden sm:inline">Add customer</span>
        </Button>
      </div>

      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <CardTitle>
            {customers.data ? `${visible.length} ${visible.length === 1 ? "customer" : "customers"}` : "Customers"}
          </CardTitle>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              placeholder={isAdmin ? "Search name or phone" : "Search by name"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              aria-label="Search customers"
            />
          </div>
        </CardHeader>
        <CardContent>
          {customers.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : customers.isError ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">Couldn't load customers.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => customers.refetch()}>
                Try again
              </Button>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Users className="h-10 w-10 text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">
                {search ? `No customers match "${search}".` : "No customers yet. They're added as you record sales."}
              </p>
              {!search && (
                <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
                  Add your first customer
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead>Added</TableHead>
                      {isAdmin && (
                        <TableHead className="w-12">
                          <span className="sr-only">Actions</span>
                        </TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>
                          <MaskedPhone phone={c.phone} />
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-muted-foreground">{c.notes}</TableCell>
                        <TableCell className="text-muted-foreground">{format(new Date(c.created_at), "PP")}</TableCell>
                        {isAdmin && (
                          <TableCell>
                            <CustomerActions
                              customer={c}
                              canArchive={canDeleteRecords}
                              onEdit={setEditing}
                              onArchive={setArchiving}
                            />
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <ul className="space-y-3 md:hidden">
                {visible.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{c.name}</p>
                      <MaskedPhone phone={c.phone} className="text-sm" />
                      {c.notes && <p className="truncate text-sm text-muted-foreground">{c.notes}</p>}
                    </div>
                    {isAdmin && (
                      <CustomerActions customer={c} canArchive={canDeleteRecords} onEdit={setEditing} onArchive={setArchiving} />
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <CustomerFormDialog open={creating} onOpenChange={setCreating} />
      <CustomerFormDialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} customer={editing} />
      <ConfirmDialog
        open={archiving !== null}
        onOpenChange={(open) => !open && setArchiving(null)}
        title="Archive customer?"
        description={`${archiving?.name ?? ""} will be hidden from search. Their sales and credits are kept.`}
        confirmLabel="Archive"
        busyLabel="Archiving…"
        destructive
        busy={archive.isPending}
        onConfirm={confirmArchive}
      />
    </div>
  );
};

function CustomerActions({
  customer,
  canArchive,
  onEdit,
  onArchive,
}: {
  customer: Customer;
  canArchive: boolean;
  onEdit: (c: Customer) => void;
  onArchive: (c: Customer) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Actions for ${customer.name}`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onEdit(customer)}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </DropdownMenuItem>
        {canArchive && (
          <DropdownMenuItem onSelect={() => onArchive(customer)} className="text-destructive focus:text-destructive">
            <Archive className="mr-2 h-4 w-4" />
            Archive
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default CustomersPage;
