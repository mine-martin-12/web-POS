import { describe, expect, it } from "vitest";
import type { ActivityLog } from "./api";
import { summarize, visibleFields } from "./lib";

const base: ActivityLog = {
  id: "1",
  actor_id: "u",
  action: "update",
  table_name: "sales",
  record_id: "s",
  old_values: null,
  new_values: null,
  reason: null,
  created_at: "2026-10-03T08:00:00Z",
};

describe("activity summaries", () => {
  it("shows a single changed field as before → after, with money formatted", () => {
    const log = { ...base, old_values: { selling_price: 50 }, new_values: { selling_price: 45 } };
    // Intl separates the currency code with a non-breaking space.
    expect(summarize(log, "KES").replace(/\u00a0/g, " ")).toBe("Selling price: KES 50.00 → KES 45.00");
  });

  it("lists several changed fields", () => {
    const log = { ...base, old_values: { quantity: 1, description: "a", customer_id: "x", sale_date: "d" }, new_values: { quantity: 2, description: "b", customer_id: "y", sale_date: "e" } };
    expect(summarize(log, "KES")).toBe("Customer, Description, Quantity +1 more");
  });

  it("names the record on create and delete", () => {
    expect(summarize({ ...base, action: "create", new_values: { name: "Milk" } }, "KES")).toBe("Milk");
    expect(summarize({ ...base, action: "delete", old_values: { customer_name: "Akinyi" } }, "KES")).toBe("Akinyi");
  });

  it("hides internal ids", () => {
    expect(visibleFields({ ...base, action: "create", new_values: { id: "1", business_id: "b", name: "x" } })).toEqual(["name"]);
  });
});
