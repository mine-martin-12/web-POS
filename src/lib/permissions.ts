import type { AppRole } from "@/contexts/AuthContext";

/**
 * The single role → capability matrix. Components check capabilities (via useSecurity),
 * never raw role strings, so changing who may do what happens here only.
 *
 * This is a UX layer: the database (RLS policies, column grants, RPC checks) is the
 * actual security boundary and enforces the same rules.
 */
export const CAPABILITIES = [
  "canManageUsers",
  "canManageBusiness",
  "canViewFinancialData",
  "canDeleteRecords",
  /** Edit saved sales, credits and products directly (staff request changes instead). */
  "canEditRecords",
  "canBulkOperations",
  "canViewCustomerPhone",
  "canReviewChanges",
  "canViewAuditLog",
  "canExportData",
  "canManageExpenses",
  "canSendMessages",
  "canViewAllSales",
] as const;

export type Capability = (typeof CAPABILITIES)[number];
export type CapabilitySet = Record<Capability, boolean>;

const NONE: CapabilitySet = Object.fromEntries(CAPABILITIES.map((c) => [c, false])) as CapabilitySet;

const MATRIX: Record<AppRole, CapabilitySet> = {
  admin: Object.fromEntries(CAPABILITIES.map((c) => [c, true])) as CapabilitySet,
  user: {
    ...NONE,
    // Staff can export the lists they can already see (their own sales, products, credits).
    canExportData: true,
  },
};

export function capabilitiesFor(role: AppRole | null | undefined): CapabilitySet {
  return role ? MATRIX[role] : NONE;
}

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  user: "Staff",
};
