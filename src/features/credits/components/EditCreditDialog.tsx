import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { DateField } from "@/components/common/DateField";
import { CustomerPicker } from "@/features/customers/components/CustomerPicker";
import type { CustomerChoice } from "@/features/customers/types";
import { useUpdateSale } from "@/features/sales/hooks";
import type { SaleChanges } from "@/features/sales/types";
import { getErrorMessage } from "@/lib/errors";
import { useAuth } from "@/contexts/AuthContext";
import { dayKey } from "@/lib/dates";
import type { CreditListRow } from "../api";

/** Admins change who owes a balance and when it's due. Amounts follow the sale itself. */
export function EditCreditDialog({ credit, onOpenChange }: { credit: CreditListRow | null; onOpenChange: (open: boolean) => void }) {
  const update = useUpdateSale();
  const { business } = useAuth();
  const [dueDate, setDueDate] = useState("");
  const [customer, setCustomer] = useState<CustomerChoice>(null);

  useEffect(() => {
    if (!credit) return;
    setDueDate(credit.due_date);
    setCustomer(
      credit.customer_id
        ? {
            kind: "customer",
            customer: { id: credit.customer_id, name: credit.customer_name, phone: null, notes: null, created_at: "", archived_at: null },
          }
        : null,
    );
  }, [credit]);

  const save = async () => {
    if (!credit) return;
    const changes: SaleChanges = {};
    if (dueDate && dueDate !== credit.due_date) changes.due_date = dueDate;
    const customerId = customer?.kind === "customer" ? customer.customer.id : null;
    if (customerId && customerId !== credit.customer_id) changes.customer_id = customerId;
    if (!Object.keys(changes).length) {
      onOpenChange(false);
      return;
    }
    try {
      await update.mutateAsync({ id: credit.sale_id, changes });
      toast.success("Credit updated");
      onOpenChange(false);
    } catch (error) {
      toast.error("Couldn't update the credit", { description: getErrorMessage(error) });
    }
  };

  const saleDay = credit?.sale ? dayKey(credit.sale.sale_date, business?.timezone) : undefined;

  return (
    <Dialog open={credit !== null} onOpenChange={(open) => !update.isPending && onOpenChange(open)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit credit</DialogTitle>
          <DialogDescription>
            To change the amount, edit the sale itself; the balance follows it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="credit-customer">Customer</Label>
            <CustomerPicker id="credit-customer" value={customer} onChange={setCustomer} allowWalkIn={false} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="credit-due">Due date</Label>
            <DateField id="credit-due" value={dueDate} onChange={setDueDate} min={saleDay} />
          </div>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row-reverse sm:justify-start sm:gap-2">
          <Button onClick={save} disabled={update.isPending} className="w-full sm:w-auto">
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={update.isPending} className="w-full sm:w-auto">
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
