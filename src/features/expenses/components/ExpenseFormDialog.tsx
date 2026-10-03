import React, { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateField } from "@/components/common/DateField";
import { TextField } from "@/components/common/form-fields";
import { PAYMENT_METHOD_LABELS } from "@/features/sales/types";
import { todayKey } from "@/lib/dates";
import { getErrorMessage } from "@/lib/errors";
import { invalidSummary, requiredText } from "@/lib/validation";
import { EXPENSE_CATEGORIES, type Expense } from "../api";
import { useCreateExpense, useUpdateExpense } from "../hooks";

const schema = z.object({
  category: requiredText("Category", 60),
  description: z.string().trim().max(300),
  amount: z
    .string()
    .trim()
    .refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, "Enter an amount above 0"),
  expense_date: z.string().min(1, "Choose the date"),
  payment_method: z.enum(["cash", "mpesa", "bank_cheque"]),
});
type FormData = z.infer<typeof schema>;

export function ExpenseFormDialog({
  open,
  onOpenChange,
  expense,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense?: Expense | null;
}) {
  const { business } = useAuth();
  const today = todayKey(business?.timezone);
  const create = useCreateExpense();
  const update = useUpdateExpense();
  const busy = create.isPending || update.isPending;
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    reValidateMode: "onSubmit",
    defaultValues: { category: "", description: "", amount: "", expense_date: today, payment_method: "cash" },
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      expense
        ? {
            category: expense.category,
            description: expense.description ?? "",
            amount: String(expense.amount),
            expense_date: expense.expense_date,
            payment_method: expense.payment_method as FormData["payment_method"],
          }
        : { category: "", description: "", amount: "", expense_date: today, payment_method: "cash" },
    );
  }, [open, expense, form, today]);

  const onSubmit = async (data: FormData) => {
    const input = { ...data, amount: Number(data.amount) };
    try {
      if (expense) await update.mutateAsync({ id: expense.id, expense: input });
      else await create.mutateAsync(input);
      toast.success(expense ? "Expense updated" : "Expense recorded", { description: data.category });
      onOpenChange(false);
    } catch (error) {
      toast.error("Couldn't save the expense", { description: getErrorMessage(error) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{expense ? "Edit expense" : "Record an expense"}</DialogTitle>
          <DialogDescription>Running costs like rent, wages and transport. Only admins see expenses.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit, (e) => toast.error(invalidSummary(e).title, { description: invalidSummary(e).description }))}
            className="space-y-4"
            noValidate
          >
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select value={field.value} onValueChange={(v) => { field.onChange(v); form.clearErrors("category"); }}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {[...new Set([...EXPENSE_CATEGORIES, ...(expense ? [expense.category] : [])])].map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <TextField
                control={form.control}
                clearErrors={form.clearErrors}
                name="amount"
                label="Amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
              />
              <div className="space-y-2">
                <Label htmlFor="expense-date">Date</Label>
                <Controller
                  control={form.control}
                  name="expense_date"
                  render={({ field }) => <DateField id="expense-date" value={field.value} onChange={field.onChange} max={today} />}
                />
              </div>
            </div>
            <FormField
              control={form.control}
              name="payment_method"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Paid by</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(["cash", "mpesa", "bank_cheque"] as const).map((m) => (
                        <SelectItem key={m} value={m}>
                          {PAYMENT_METHOD_LABELS[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <TextField control={form.control} clearErrors={form.clearErrors} name="description" label="Notes (optional)" />
            <DialogFooter className="flex-col gap-2 sm:flex-row-reverse sm:justify-start sm:gap-2">
              <Button type="submit" disabled={busy} className="w-full sm:w-auto">
                {busy ? "Saving…" : expense ? "Save changes" : "Record expense"}
              </Button>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy} className="w-full sm:w-auto">
                Cancel
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
