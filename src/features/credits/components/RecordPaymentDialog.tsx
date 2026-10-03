import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Money } from "@/components/common/Money";
import { invalidInputClass } from "@/components/common/form-fields";
import { PAYMENT_METHOD_LABELS, type PaidMethod } from "@/features/sales/types";
import { getErrorMessage } from "@/lib/errors";
import { creditOutstanding, fromCents, toCents } from "@/lib/finance";
import { cn } from "@/lib/utils";
import type { CreditListRow } from "../api";
import { useCreditPayments, useRecordPayment } from "../hooks";

interface RecordPaymentDialogProps {
  credit: CreditListRow | null;
  onOpenChange: (open: boolean) => void;
}

export function RecordPaymentDialog({ credit, onOpenChange }: RecordPaymentDialogProps) {
  const record = useRecordPayment();
  const payments = useCreditPayments(credit?.id ?? null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaidMethod>("cash");
  const [error, setError] = useState<string | null>(null);
  const outstanding = credit ? creditOutstanding(credit) : 0;

  useEffect(() => {
    if (credit) {
      setAmount("");
      setError(null);
    }
  }, [credit]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!credit) return;
    const cents = toCents(amount);
    if (amount.trim() === "" || cents <= 0) {
      setError("Enter the amount received");
      return;
    }
    if (cents > outstanding) {
      setError("That's more than the balance owed");
      return;
    }
    try {
      await record.mutateAsync({ creditId: credit.id, amount: fromCents(cents), method });
      toast.success(cents === outstanding ? "Credit fully paid" : "Payment recorded", {
        description: `${credit.customer_name}`,
      });
      onOpenChange(false);
    } catch (e) {
      toast.error("Couldn't record the payment", { description: getErrorMessage(e) });
    }
  };

  return (
    <Dialog open={credit !== null} onOpenChange={(open) => !record.isPending && onOpenChange(open)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>
            {credit?.customer_name} owes <Money cents={outstanding} className="font-medium text-foreground" />
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="payment-amount" className={cn(error && "text-destructive")}>
              Amount received
            </Label>
            <div className="flex gap-2">
              <Input
                id="payment-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setError(null);
                }}
                aria-invalid={!!error}
                aria-describedby={error ? "payment-amount-error" : undefined}
                className={invalidInputClass}
                autoFocus
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setAmount(fromCents(outstanding).toFixed(2));
                  setError(null);
                }}
              >
                Full balance
              </Button>
            </div>
            {error && (
              <p id="payment-amount-error" className="text-sm font-medium text-destructive">
                {error}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="payment-method">Paid by</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PaidMethod)}>
              <SelectTrigger id="payment-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["cash", "mpesa", "bank_cheque"] as const).map((m) => (
                  <SelectItem key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!!payments.data?.length && (
            <div className="space-y-1">
              <p className="text-sm font-medium">Earlier payments</p>
              <ul className="max-h-32 space-y-1 overflow-y-auto text-sm text-muted-foreground">
                {payments.data.map((p) => (
                  <li key={p.id} className="flex justify-between">
                    <span>
                      {format(new Date(p.paid_at), "d MMM yyyy")} · {PAYMENT_METHOD_LABELS[p.payment_method]}
                    </span>
                    <Money value={p.amount} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <DialogFooter className="flex-col gap-2 sm:flex-row-reverse sm:justify-start sm:gap-2">
            <Button type="submit" disabled={record.isPending} className="w-full sm:w-auto">
              {record.isPending ? "Saving…" : "Record payment"}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={record.isPending} className="w-full sm:w-auto">
              Cancel
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
