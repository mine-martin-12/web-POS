import { format } from "date-fns";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/features/sales/types";
import { formatMoney } from "@/lib/currency";
import { parseDayKey } from "@/lib/dates";
import type { ChangeTable } from "./types";

export type FieldKind = "text" | "number" | "money" | "date" | "product" | "customer" | "method";

export const CHANGE_FIELDS: Record<ChangeTable, Record<string, { label: string; kind: FieldKind }>> = {
  sales: {
    product_id: { label: "Product", kind: "product" },
    quantity: { label: "Quantity", kind: "number" },
    selling_price: { label: "Price each", kind: "money" },
    sale_day: { label: "Sale date", kind: "date" },
    description: { label: "Notes", kind: "text" },
    customer_id: { label: "Customer", kind: "customer" },
    payment_method: { label: "Paid by", kind: "method" },
  },
  credits: {
    due_date: { label: "Due date", kind: "date" },
    customer_id: { label: "Customer", kind: "customer" },
  },
  products: {
    name: { label: "Name", kind: "text" },
    description: { label: "Description", kind: "text" },
    size: { label: "Size", kind: "text" },
    buying_price: { label: "Buying price", kind: "money" },
  },
};

export interface Lookups {
  currency: string;
  products: Map<string, string>;
  customers: Map<string, string>;
}

/** Human-readable value for the diff table. */
export function formatChangeValue(table: ChangeTable, field: string, value: unknown, lookups: Lookups): string {
  if (value === null || value === undefined || value === "") return "—";
  const kind = CHANGE_FIELDS[table][field]?.kind ?? "text";
  switch (kind) {
    case "money":
      return formatMoney(Number(value), lookups.currency);
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? format(parseDayKey(String(value)), "d MMM yyyy") : String(value);
    case "product":
      return lookups.products.get(String(value)) ?? "Unknown product";
    case "customer":
      return lookups.customers.get(String(value)) ?? "Unknown customer";
    case "method":
      return PAYMENT_METHOD_LABELS[value as PaymentMethod] ?? String(value);
    default:
      return String(value);
  }
}

export function fieldLabel(table: ChangeTable, field: string): string {
  return CHANGE_FIELDS[table][field]?.label ?? field;
}
