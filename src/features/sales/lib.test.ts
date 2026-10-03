import { describe, expect, it } from "vitest";
import { columnTotals } from "@/lib/exports/table";
import { summarizeSales } from "@/lib/finance";
import { salesSheet } from "./lib";
import type { SaleRow } from "./types";

const sale = (id: string, partial: Partial<SaleRow>): SaleRow => ({
  id,
  product_id: "p",
  product_name: "Tea",
  quantity: 1,
  selling_price: 100,
  total_price: 100,
  unit_cost: 60,
  sale_date: "2026-10-02T09:00:00Z",
  payment_method: "cash",
  description: null,
  created_at: "2026-10-02T09:00:00Z",
  created_by: null,
  customer: null,
  credit: null,
  ...partial,
});

describe("salesSheet", () => {
  it("exports exactly the totals the list shows", () => {
    const rows = [
      sale("a", {}),
      sale("b", { quantity: 3, selling_price: 33.33, total_price: 99.99, credit: { id: "c", amount_owed: 99.99, amount_paid: 10.01, status: "partially_paid", due_date: "2026-10-10", customer_name: "A" } }),
      sale("c", { total_price: 0.1, selling_price: 0.1 }),
    ];
    const sheet = salesSheet(rows, "Africa/Nairobi", true);
    const totals = columnTotals(sheet);
    const byHeader = (h: string) => totals.get(sheet.columns.findIndex((c) => c.header === h));
    const screen = summarizeSales(rows);
    expect(byHeader("Total")).toBe(screen.billed);
    expect(byHeader("Collected")).toBe(screen.collected);
    expect(byHeader("Outstanding")).toBe(screen.outstanding);
    expect(byHeader("Profit")).toBe(screen.profit);
    expect(byHeader("Price each")).toBeUndefined();
    expect(sheet.columns[0].value(rows[2], 2)).toBe("S0003");
  });
});
