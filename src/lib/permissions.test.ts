import { describe, expect, it } from "vitest";
import { CAPABILITIES, capabilitiesFor } from "./permissions";

describe("capabilitiesFor", () => {
  it("grants admins every capability", () => {
    const caps = capabilitiesFor("admin");
    expect(CAPABILITIES.every((c) => caps[c])).toBe(true);
  });

  it("keeps staff away from admin-only capabilities", () => {
    const caps = capabilitiesFor("user");
    for (const c of [
      "canManageUsers",
      "canManageBusiness",
      "canViewFinancialData",
      "canDeleteRecords",
      "canEditRecords",
      "canBulkOperations",
      "canViewCustomerPhone",
      "canReviewChanges",
      "canViewAuditLog",
      "canManageExpenses",
      "canSendMessages",
      "canViewAllSales",
    ] as const) {
      expect(caps[c], c).toBe(false);
    }
    expect(caps.canExportData).toBe(true);
  });

  it("grants nothing while the role is unknown", () => {
    for (const role of [null, undefined]) {
      const caps = capabilitiesFor(role);
      expect(CAPABILITIES.some((c) => caps[c])).toBe(false);
    }
  });
});
