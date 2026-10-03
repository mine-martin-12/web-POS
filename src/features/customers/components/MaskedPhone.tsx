import React from "react";
import { useSecurity } from "@/hooks/useSecurity";
import { formatPhone, maskPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";

/**
 * A customer phone number. The server already masks numbers for non-admins
 * (customers_secure); this only formats for display and keeps the mask if a full
 * number ever reaches a user without the capability.
 */
export function MaskedPhone({ phone, className }: { phone: string | null | undefined; className?: string }) {
  const { canViewCustomerPhone } = useSecurity();
  if (!phone) return <span className={cn("text-muted-foreground", className)}>No phone</span>;
  const shown = canViewCustomerPhone ? formatPhone(phone) : maskPhone(phone);
  return <span className={cn("sensitive tabular-nums", className)}>{shown}</span>;
}
