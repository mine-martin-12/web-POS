import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { TextField } from "@/components/common/form-fields";
import { getErrorMessage } from "@/lib/errors";
import { normalizePhone } from "@/lib/phone";
import { requiredText } from "@/lib/validation";
import { useCreateCustomer, useUpdateCustomer } from "../hooks";
import type { Customer } from "../types";
import { MaskedPhone } from "./MaskedPhone";

const schema = z.object({
  name: requiredText("Name", 120),
  phone: z
    .string()
    .trim()
    .refine((v) => v === "" || normalizePhone(v) !== null, "Enter a valid phone number, e.g. 0712 345 678"),
  notes: z.string().trim().max(500),
});
type FormData = z.infer<typeof schema>;

interface CustomerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this customer (admin only); omit to create. */
  customer?: Customer | null;
  /** Pre-fill from what was typed in the picker. */
  initial?: Partial<FormData>;
  /** Called with the created, reused or updated customer. */
  onSaved?: (customer: Customer) => void;
}

export function CustomerFormDialog({ open, onOpenChange, customer, initial, onSaved }: CustomerFormDialogProps) {
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const [matches, setMatches] = useState<Customer[] | null>(null);
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", phone: "", notes: "" },
    reValidateMode: "onSubmit",
  });
  const busy = create.isPending || update.isPending;

  useEffect(() => {
    if (!open) return;
    setMatches(null);
    form.reset({
      name: customer?.name ?? initial?.name ?? "",
      phone: customer?.phone ?? initial?.phone ?? "",
      notes: customer?.notes ?? initial?.notes ?? "",
    });
  }, [open, customer, initial, form]);

  const finish = (saved: Customer, message: string) => {
    toast.success(message, { description: saved.name });
    onSaved?.(saved);
    onOpenChange(false);
  };

  const submit = async (data: FormData, force = false) => {
    const input = { name: data.name, phone: normalizePhone(data.phone) ?? "", notes: data.notes };
    try {
      if (customer) {
        await update.mutateAsync({ id: customer.id, customer: input });
        finish({ ...customer, ...input, phone: input.phone || null, notes: input.notes || null }, "Customer updated");
        return;
      }
      const result = await create.mutateAsync({ customer: input, force });
      if (result.status === "name_matches") {
        setMatches(result.matches);
        return;
      }
      finish(
        result.customer,
        result.status === "existing_phone" ? "Existing customer found with this phone" : "Customer added",
      );
    } catch (error) {
      toast.error(customer ? "Couldn't update customer" : "Couldn't add customer", {
        description: getErrorMessage(error),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{matches ? "Is this the same person?" : customer ? "Edit customer" : "New customer"}</DialogTitle>
          <DialogDescription>
            {matches
              ? `You already have ${matches.length === 1 ? "a customer" : `${matches.length} customers`} called "${form.getValues("name")}".`
              : "Phone numbers are saved in one format so you can find customers by number later."}
          </DialogDescription>
        </DialogHeader>

        {matches ? (
          <div className="space-y-3">
            <ul className="divide-y rounded-lg border">
              {matches.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{m.name}</p>
                    <MaskedPhone phone={m.phone} className="text-sm" />
                  </div>
                  <Button size="sm" variant="outline" onClick={() => finish(m, "Using existing customer")}>
                    <UserCheck className="mr-2 h-4 w-4" />
                    Use this
                  </Button>
                </li>
              ))}
            </ul>
            <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
              <Button variant="ghost" onClick={() => setMatches(null)} disabled={busy}>
                Back
              </Button>
              <Button onClick={form.handleSubmit((d) => submit(d, true))} disabled={busy}>
                {busy ? "Saving…" : "No, this is a different person"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit((d) => submit(d))} className="space-y-4" noValidate>
              <TextField control={form.control} clearErrors={form.clearErrors} name="name" label="Name" autoFocus />
              <TextField
                control={form.control}
                clearErrors={form.clearErrors}
                name="phone"
                label="Phone (optional)"
                type="tel"
                inputMode="tel"
                placeholder="0712 345 678"
              />
              <TextField control={form.control} clearErrors={form.clearErrors} name="notes" label="Notes (optional)" />
              <DialogFooter className="flex-col gap-2 sm:flex-row-reverse sm:gap-0 sm:space-x-2 sm:space-x-reverse">
                <Button type="submit" disabled={busy} className="w-full sm:w-auto">
                  {busy ? "Saving…" : customer ? "Save changes" : "Add customer"}
                </Button>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy} className="w-full sm:w-auto">
                  Cancel
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
