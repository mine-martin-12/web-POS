import React from "react";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/common/Money";
import { saleMoney } from "@/lib/finance";
import { cn } from "@/lib/utils";
import { PAYMENT_METHOD_LABELS, type SaleRow } from "../types";

/** Paid / part-paid / unpaid, from the finance module (billed = collected + outstanding). */
export function PaymentStatusBadge({ sale, showAmounts = true }: { sale: SaleRow; showAmounts?: boolean }) {
  const m = saleMoney(sale);
  const tone =
    m.status === "paid"
      ? "border-success/30 bg-success/15 text-success"
      : m.status === "partial"
        ? "border-warning/40 bg-warning/15 text-warning-foreground dark:text-warning"
        : "border-destructive/30 bg-destructive/10 text-destructive";
  const label =
    m.status === "paid"
      ? sale.credit
        ? "Paid (credit)"
        : `Paid · ${PAYMENT_METHOD_LABELS[sale.payment_method]}`
      : m.status === "partial"
        ? `${m.percentPaid}% paid`
        : "Unpaid";
  return (
    <div className="flex flex-col items-start gap-1">
      <Badge variant="outline" className={cn("whitespace-nowrap font-medium", tone)}>
        {label}
      </Badge>
      {showAmounts && m.outstanding > 0 && (
        <span className="text-xs text-muted-foreground">
          Owes <Money cents={m.outstanding} />
        </span>
      )}
    </div>
  );
}
