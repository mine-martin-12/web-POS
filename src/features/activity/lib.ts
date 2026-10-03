import { formatMoney } from "@/lib/currency";
import type { ActivityAction, ActivityLog } from "./api";

export const ACTION_LABELS: Record<ActivityAction, string> = {
  create: "Created",
  update: "Updated",
  delete: "Deleted",
};

export const RECORD_LABELS: Record<string, string> = {
  sales: "Sale",
  credits: "Credit",
  credit_payments: "Credit payment",
  products: "Product",
  customers: "Customer",
  profiles: "Team member",
  user_roles: "Role",
  invitations: "Invitation",
  businesses: "Business details",
  pending_updates: "Change request",
};

const MONEY_FIELDS = new Set(["selling_price", "buying_price", "amount", "amount_owed", "amount_paid", "unit_cost", "total_price"]);
const HIDDEN_FIELDS = new Set(["id", "business_id", "created_by", "recorded_by", "requested_by"]);

/** Fields worth showing for a log entry: changed fields on update, everything else otherwise. */
export function visibleFields(log: ActivityLog): string[] {
  const keys = new Set([...Object.keys(log.old_values ?? {}), ...Object.keys(log.new_values ?? {})]);
  return [...keys].filter((k) => !HIDDEN_FIELDS.has(k)).sort();
}

export function humanField(field: string): string {
  return field.replace(/_id$/, "").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function formatLogValue(field: string, value: unknown, currency: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (MONEY_FIELDS.has(field) && Number.isFinite(Number(value))) return formatMoney(Number(value), currency);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** One-line summary: "quantity 3 → 2" or "name, buying price". */
export function summarize(log: ActivityLog, currency: string): string {
  const fields = visibleFields(log);
  if (log.action !== "update") {
    const values = log.action === "create" ? log.new_values : log.old_values;
    const name = values?.name ?? values?.customer_name ?? values?.email;
    return name ? String(name) : "";
  }
  if (fields.length === 1) {
    const f = fields[0];
    return `${humanField(f)}: ${formatLogValue(f, log.old_values?.[f], currency)} → ${formatLogValue(f, log.new_values?.[f], currency)}`;
  }
  const shown = fields.slice(0, 3).map(humanField).join(", ");
  return fields.length > 3 ? `${shown} +${fields.length - 3} more` : shown;
}
