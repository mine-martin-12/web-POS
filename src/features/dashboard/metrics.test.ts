import { describe, expect, it } from "vitest";
import type { SaleRow } from "@/features/sales/types";
import { computeDashboardMetrics, previousRange } from "./metrics";

let n = 0;
function sale(partial: Partial<SaleRow>): SaleRow {
  n++;
  return {
    id: `s${n}`,
    product_id: "p1",
    product_name: "Sugar",
    quantity: 1,
    selling_price: 100,
    total_price: 100,
    unit_cost: 60,
    sale_date: "2026-10-02T09:00:00Z",
    payment_method: "cash",
    description: null,
    created_at: "2026-10-02T09:00:00Z",
    created_by: null,
    credit: null,
    ...partial,
  };
}

describe("previousRange", () => {
  it("is the same number of days immediately before", () => {
    expect(previousRange({ from: "2026-10-01", to: "2026-10-07" })).toEqual({ from: "2026-09-24", to: "2026-09-30" });
    expect(previousRange({ from: "2026-10-03", to: "2026-10-03" })).toEqual({ from: "2026-10-02", to: "2026-10-02" });
  });
});

describe("computeDashboardMetrics", () => {
  const range = { from: "2026-10-01", to: "2026-10-03" };

  it("splits revenue into collected and pending using the finance module", () => {
    const m = computeDashboardMetrics(
      [
        sale({}),
        sale({ payment_method: "credit", credit: { id: "c", amount_owed: 100, amount_paid: 25, status: "partially_paid", due_date: "2026-10-10", customer_name: "A" } }),
      ],
      [sale({ total_price: 100 })],
      range,
    );
    expect(m.totalSalesAmount).toBe(200);
    expect(m.actualRevenue).toBe(125);
    expect(m.pendingRevenue).toBe(75);
    expect(m.actualRevenue + m.pendingRevenue).toBe(m.totalSalesAmount);
    expect(m.totalSalesAmountGrowth).toBe(100);
    expect(m.comparisonPeriodLabel).toBe("vs previous 3 days");
  });

  it("charts every day of the range, keyed in the business time zone", () => {
    const m = computeDashboardMetrics([sale({ sale_date: "2026-09-30T22:00:00Z" })], [], range, "Africa/Nairobi");
    expect(m.salesChart.map((p) => p.day)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(m.salesChart[0].sales).toBe(100); // 01:00 on 1 Oct in Nairobi
  });

  it("groups products by id and keeps top/bottom lists disjoint", () => {
    const m = computeDashboardMetrics(
      [
        sale({ product_id: "a", product_name: "Same name", total_price: 300 }),
        sale({ product_id: "b", product_name: "Same name", total_price: 100 }),
        sale({ product_id: "c", product_name: "Other", total_price: 50 }),
      ],
      [],
      range,
    );
    const top = m.topProducts.map((p) => p.productId);
    const bottom = m.bottomProducts.map((p) => p.productId);
    expect(top).toEqual(["a", "b"]);
    expect(bottom).toEqual(["c"]);
  });
});
